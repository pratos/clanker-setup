import { createHash, randomBytes } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { homedir, platform, tmpdir } from "node:os";
import {
  basename,
  dirname,
  extname,
  join,
  normalize,
  parse,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { StringEnum, Type } from "@earendil-works/pi-ai";
import {
  defineTool,
  type ExtensionAPI,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";

const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));
const BLANK_DB_PATH = join(EXTENSION_DIR, "assets", "blank-db.sqlite");
const WEB_ROOT = join(EXTENSION_DIR, "web");
const APP_NAME = "tldraw offline";
const CMUX_BIN =
  process.env.CMUX_BUNDLED_CLI_PATH ??
  "/Applications/cmux.app/Contents/Resources/bin/cmux";
const DEFAULT_PORT = 7236;
const MAX_MARKDOWN_BYTES = 10 * 1024 * 1024;
const VERIFY_TIMEOUT_MS = 30_000;
const COLOR_NAMES = [
  "black",
  "blue",
  "green",
  "grey",
  "light-blue",
  "light-green",
  "light-red",
  "light-violet",
  "orange",
  "red",
  "violet",
  "yellow",
] as const;
const GEO_NAMES = [
  "rectangle",
  "ellipse",
  "diamond",
  "hexagon",
  "oval",
  "rhombus",
  "star",
  "triangle",
] as const;

const visualNodeSchema = Type.Object({
  id: Type.String({
    description: "Stable short identifier, unique within this diagram",
    minLength: 1,
    maxLength: 64,
  }),
  title: Type.String({
    description: "Short node heading",
    minLength: 1,
    maxLength: 120,
  }),
  body: Type.Optional(
    Type.String({ description: "Concise supporting detail", maxLength: 600 }),
  ),
  x: Type.Number({
    description: "Horizontal canvas position",
    minimum: -20_000,
    maximum: 20_000,
  }),
  y: Type.Number({
    description: "Vertical canvas position",
    minimum: -20_000,
    maximum: 20_000,
  }),
  width: Type.Optional(Type.Number({ minimum: 180, maximum: 800 })),
  height: Type.Optional(Type.Number({ minimum: 100, maximum: 600 })),
  color: Type.Optional(StringEnum(COLOR_NAMES)),
  shape: Type.Optional(StringEnum(GEO_NAMES)),
});

const visualEdgeSchema = Type.Object({
  from: Type.String({
    description: "Source node id",
    minLength: 1,
    maxLength: 64,
  }),
  to: Type.String({
    description: "Target node id",
    minLength: 1,
    maxLength: 64,
  }),
  label: Type.Optional(Type.String({ maxLength: 120 })),
});

const visualParams = Type.Object({
  markdownPath: Type.String({
    description: "Path to the substantive Markdown document to visualize",
  }),
  title: Type.String({
    description: "Diagram title",
    minLength: 1,
    maxLength: 160,
  }),
  nodes: Type.Array(visualNodeSchema, { minItems: 1, maxItems: 40 }),
  edges: Type.Optional(Type.Array(visualEdgeSchema, { maxItems: 80 })),
  open: Type.Optional(
    Type.Boolean({
      description:
        "Open and verify the generated canvas in tldraw Offline (default true)",
    }),
  ),
});

type VisualNode = {
  id: string;
  title: string;
  body?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: (typeof COLOR_NAMES)[number];
  shape?: (typeof GEO_NAMES)[number];
};

type VisualEdge = {
  from: string;
  to: string;
  label?: string;
};

type VisualParams = {
  markdownPath: string;
  title: string;
  nodes: VisualNode[];
  edges?: VisualEdge[];
  open?: boolean;
};

type CanvasServerConfig = {
  port: number;
  token: string;
  pid?: number;
};

type OpenCanvas = {
  id: string;
  filePath: string | null;
  name: string;
  unsavedChanges?: boolean;
  shapeCount?: number;
};

type VisualDetails = {
  markdownPath: string;
  companionPath: string;
  digest: string;
  nodeCount: number;
  edgeCount: number;
  opened: boolean;
  verified: boolean;
  verifiedShapeCount?: number;
  warning?: string;
};

type CmuxPaneServer = {
  server: Server;
  port: number;
  token: string;
};

type ArchivedVisual = {
  spec: {
    sourceHash: string;
    title: string;
    [key: string]: unknown;
  };
  persistenceKey: string;
  companionPath: string;
};

function stripAtPrefix(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed.at(-1);
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function markdownPathFromInput(cwd: string, input: string): string {
  return resolve(cwd, stripAtPrefix(stripWrappingQuotes(input)));
}

function companionPathFor(markdownPath: string): string {
  const file = parse(markdownPath);
  return join(file.dir, ".visuals", `${file.name}.tldraw`);
}

function companionPathFromInput(cwd: string, input: string): string {
  const path = resolve(cwd, stripAtPrefix(stripWrappingQuotes(input)));
  return extname(path).toLowerCase() === ".md" ? companionPathFor(path) : path;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeId(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return normalized || "item";
}

function calculateScriptDigest(files: Record<string, string>): string {
  const digest = createHash("sha256");
  for (const path of Object.keys(files).sort()) {
    digest.update(`${path}\0${sha256(files[path])}\n`);
  }
  return digest.digest("hex");
}

async function readArchivedVisual(
  pi: ExtensionAPI,
  companionPath: string,
  signal?: AbortSignal,
): Promise<ArchivedVisual> {
  const scriptResult = await pi.exec(
    "/usr/bin/unzip",
    ["-p", companionPath, "script/main.js"],
    { signal, timeout: 15_000 },
  );
  if (scriptResult.code !== 0) {
    throw new Error(
      `Could not read generated visual script: ${scriptResult.stderr}`,
    );
  }
  const marker = "const SPEC = ";
  const start = scriptResult.stdout.indexOf(marker);
  const end = scriptResult.stdout.indexOf(
    "\nconst sourceMeta",
    start + marker.length,
  );
  if (start < 0 || end < 0) {
    throw new Error(
      "This canvas is not a generated tldraw visual companion. Regenerate it with /visualize first.",
    );
  }
  let spec: ArchivedVisual["spec"];
  try {
    spec = JSON.parse(
      scriptResult.stdout.slice(start + marker.length, end),
    ) as ArchivedVisual["spec"];
  } catch (error) {
    throw new Error(
      `Could not parse the generated visual specification: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof spec.sourceHash !== "string" || typeof spec.title !== "string") {
    throw new Error(
      "Generated visual specification is missing its identity or title.",
    );
  }

  const metadataResult = await pi.exec(
    "/usr/bin/unzip",
    ["-p", companionPath, "metadata.json"],
    { signal, timeout: 15_000 },
  );
  let digest = sha256(scriptResult.stdout);
  if (metadataResult.code === 0) {
    try {
      const metadata = JSON.parse(metadataResult.stdout) as {
        script?: { sha256?: unknown };
      };
      if (typeof metadata.script?.sha256 === "string")
        digest = metadata.script.sha256;
    } catch {
      // The script hash remains a safe persistence identity when metadata is malformed.
    }
  }
  return {
    spec,
    persistenceKey: `${spec.sourceHash}-${digest.slice(0, 16)}`,
    companionPath,
  };
}

function contentTypeFor(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

async function startCmuxPaneServer(pi: ExtensionAPI): Promise<CmuxPaneServer> {
  const token = randomBytes(24).toString("hex");
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/api/spec") {
        if (url.searchParams.get("token") !== token) {
          response.writeHead(401, {
            "content-type": "text/plain; charset=utf-8",
          });
          response.end("Unauthorized");
          return;
        }
        const requestedPath = url.searchParams.get("file");
        if (!requestedPath) {
          response.writeHead(400, {
            "content-type": "text/plain; charset=utf-8",
          });
          response.end("Missing visual file path");
          return;
        }
        const companionPath = resolve(requestedPath);
        if (extname(companionPath).toLowerCase() !== ".tldraw") {
          response.writeHead(400, {
            "content-type": "text/plain; charset=utf-8",
          });
          response.end("Expected a .tldraw visual companion");
          return;
        }
        const visual = await readArchivedVisual(pi, companionPath);
        response.writeHead(200, {
          "cache-control": "no-store",
          "content-type": "application/json; charset=utf-8",
        });
        response.end(JSON.stringify(visual));
        return;
      }

      const relativePath =
        url.pathname === "/"
          ? "index.html"
          : decodeURIComponent(url.pathname.slice(1));
      const staticPath = resolve(WEB_ROOT, normalize(relativePath));
      if (
        staticPath !== WEB_ROOT &&
        !staticPath.startsWith(`${WEB_ROOT}${sep}`)
      ) {
        response.writeHead(403, {
          "content-type": "text/plain; charset=utf-8",
        });
        response.end("Forbidden");
        return;
      }
      const content = await readFile(staticPath);
      response.writeHead(200, {
        "cache-control": staticPath.endsWith("index.html")
          ? "no-store"
          : "public, max-age=31536000, immutable",
        "content-type": contentTypeFor(staticPath),
      });
      response.end(content);
    })().catch((error) => {
      if (response.headersSent) {
        response.end();
        return;
      }
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : String(error));
    });
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolvePromise();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not determine the local tldraw pane server port.");
  }
  return { server, port: address.port, token };
}

async function openCmuxPane(
  pi: ExtensionAPI,
  paneServer: CmuxPaneServer,
  companionPath: string,
  signal?: AbortSignal,
): Promise<string> {
  const query = new URLSearchParams({
    file: companionPath,
    token: paneServer.token,
  });
  const url = `http://127.0.0.1:${paneServer.port}/?${query}`;
  const result = await pi.exec(
    CMUX_BIN,
    ["browser", "open", url, "--focus", "true"],
    {
      signal,
      timeout: 15_000,
    },
  );
  if (result.code !== 0) {
    throw new Error(
      `Could not open the cmux browser pane: ${result.stderr || result.stdout || "unknown cmux error"}`,
    );
  }
  return url;
}

function serverJsonPath(): string {
  if (platform() === "darwin") {
    return join(
      homedir(),
      "Library",
      "Application Support",
      "tldraw",
      "server.json",
    );
  }
  if (platform() === "win32") {
    return join(
      process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
      "tldraw",
      "server.json",
    );
  }
  return join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "tldraw",
    "server.json",
  );
}

function scriptTrustPath(): string {
  if (process.env.TLDRAW_SCRIPT_TRUST) {
    return resolve(
      process.env.TLDRAW_SCRIPT_TRUST.replace(/^~(?=$|\/)/, homedir()),
    );
  }
  if (platform() === "darwin") {
    return join(
      homedir(),
      "Library",
      "Application Support",
      "tldraw",
      "script-trust.json",
    );
  }
  if (platform() === "win32") {
    return join(
      process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
      "tldraw",
      "script-trust.json",
    );
  }
  return join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "tldraw",
    "script-trust.json",
  );
}

async function readServerConfig(): Promise<CanvasServerConfig | null> {
  try {
    const parsed = JSON.parse(
      await readFile(serverJsonPath(), "utf8"),
    ) as Partial<CanvasServerConfig>;
    if (
      !Number.isInteger(parsed.port) ||
      typeof parsed.token !== "string" ||
      !parsed.token
    ) {
      return null;
    }
    if (parsed.pid && !isProcessAlive(parsed.pid)) return null;
    return parsed as CanvasServerConfig;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function requestSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function canvasRequest<T>(
  config: CanvasServerConfig,
  endpoint: string,
  options: {
    method?: "GET" | "POST";
    code?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const response = await fetch(
    `http://127.0.0.1:${config.port || DEFAULT_PORT}${endpoint}`,
    {
      method: options.method ?? "GET",
      headers: {
        authorization: `Bearer ${config.token}`,
        ...(options.code === undefined ? {} : { "content-type": "text/plain" }),
      },
      body: options.code,
      signal: requestSignal(options.signal, options.timeoutMs ?? 3_000),
    },
  );
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(
      `tldraw Canvas API returned HTTP ${response.status}: ${text.slice(0, 500)}`,
    );
  }
  if (!response.ok) {
    const error = (payload as { error?: unknown }).error;
    throw new Error(
      `tldraw Canvas API returned HTTP ${response.status}: ${String(error ?? text)}`,
    );
  }
  const result = payload as { success?: boolean; result?: T; error?: unknown };
  if (result.success === false) {
    throw new Error(
      `tldraw Canvas API error: ${String(result.error ?? "unknown error")}`,
    );
  }
  return result.result as T;
}

async function canvasSearch<T>(
  config: CanvasServerConfig,
  code: string,
  signal?: AbortSignal,
): Promise<T> {
  return canvasRequest<T>(config, "/api/search", {
    method: "POST",
    code,
    signal,
  });
}

async function canonicalPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

async function listOpenCanvases(signal?: AbortSignal): Promise<OpenCanvas[]> {
  const config = await readServerConfig();
  if (!config) return [];
  try {
    return await canvasSearch<OpenCanvas[]>(
      config,
      "return await api.getDocs()",
      signal,
    );
  } catch {
    return [];
  }
}

async function findOpenCanvas(
  path: string,
  signal?: AbortSignal,
): Promise<OpenCanvas | null> {
  const target = await canonicalPath(path);
  for (const canvas of await listOpenCanvases(signal)) {
    if (!canvas.filePath) continue;
    if ((await canonicalPath(canvas.filePath)) === target) return canvas;
  }
  return null;
}

async function trustGeneratedScript(digest: string): Promise<void> {
  const path = scriptTrustPath();
  await withFileMutationQueue(path, async () => {
    let trusted: string[] = [];
    try {
      const parsed = JSON.parse(await readFile(path, "utf8")) as {
        trusted?: unknown;
      };
      if (Array.isArray(parsed.trusted)) {
        trusted = parsed.trusted.filter(
          (item): item is string => typeof item === "string",
        );
      }
    } catch {
      // A missing trust file is expected on a fresh installation.
    }
    if (trusted.includes(digest)) return;
    const next = { trusted: [...new Set([...trusted, digest])] };
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, {
      mode: 0o600,
    });
    await chmod(temporary, 0o600);
    await rename(temporary, path);
  });
}

function validateSpec(params: VisualParams): void {
  const ids = new Set<string>();
  for (const node of params.nodes) {
    const id = safeId(node.id);
    if (ids.has(id)) {
      throw new Error(`Duplicate node id after normalization: ${node.id}`);
    }
    ids.add(id);
  }
  for (const edge of params.edges ?? []) {
    const from = safeId(edge.from);
    const to = safeId(edge.to);
    if (!ids.has(from))
      throw new Error(`Edge references unknown source node: ${edge.from}`);
    if (!ids.has(to))
      throw new Error(`Edge references unknown target node: ${edge.to}`);
    if (from === to)
      throw new Error(`Self-referential edge is not supported: ${edge.from}`);
  }
}

function buildDocumentScript(
  params: VisualParams,
  markdownPath: string,
  sourceHash: string,
): string {
  const idPrefix = `pi-${sourceHash}`;
  const nodes = params.nodes.map((node) => ({
    id: safeId(node.id),
    shapeId: `${idPrefix}-node-${safeId(node.id)}`,
    title: node.title,
    body: node.body ?? "",
    x: Math.round(node.x),
    y: Math.round(node.y),
    width: Math.round(node.width ?? 320),
    height: Math.round(node.height ?? (node.body ? 190 : 140)),
    color: node.color ?? "blue",
    shape: node.shape ?? "rectangle",
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = (params.edges ?? []).map((edge, index) => {
    const from = byId.get(safeId(edge.from))!;
    const to = byId.get(safeId(edge.to))!;
    return {
      id: `${idPrefix}-edge-${index}-${from.id}-${to.id}`,
      fromShapeId: from.shapeId,
      toShapeId: to.shapeId,
      label: edge.label ?? "",
      start: {
        x: from.x + from.width / 2,
        y: from.y + from.height / 2,
      },
      end: {
        x: to.x + to.width / 2,
        y: to.y + to.height / 2,
      },
    };
  });
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const spec = {
    sourceHash,
    sourcePath: markdownPath,
    title: params.title,
    titleShapeId: `${idPrefix}-title`,
    titleX: minX,
    titleY: minY - 180,
    titleWidth: Math.max(400, maxX - minX),
    nodes,
    edges,
  };

  return `import { createBindingId, createShapeId, toRichText } from 'tldraw'

const SPEC = ${JSON.stringify(spec, null, 2)}
const sourceMeta = { piVisual: true, piVisualSource: SPEC.sourceHash, markdownPath: SPEC.sourcePath }

export default function ({ editor, helpers }) {
  const expected = new Set([
    SPEC.titleShapeId,
    ...SPEC.nodes.map((node) => node.shapeId),
    ...SPEC.edges.map((edge) => edge.id),
  ].map((id) => createShapeId(id)))

  editor.run(() => {
    const stale = editor.getCurrentPageShapes().filter(
      (shape) => shape.meta?.piVisualSource === SPEC.sourceHash && !expected.has(shape.id),
    )
    if (stale.length > 0) editor.deleteShapes(stale.map((shape) => shape.id))

    helpers.createShapeIfMissing({
      id: createShapeId(SPEC.titleShapeId),
      type: 'geo',
      x: SPEC.titleX,
      y: SPEC.titleY,
      props: {
        geo: 'rectangle',
        w: SPEC.titleWidth,
        h: 110,
        color: 'blue',
        fill: 'semi',
        size: 'l',
        richText: toRichText(SPEC.title),
      },
      meta: sourceMeta,
    })

    for (const node of SPEC.nodes) {
      const text = node.body ? \`${"${node.title}\\n\\n${node.body}"}\` : node.title
      helpers.createShapeIfMissing({
        id: createShapeId(node.shapeId),
        type: 'geo',
        x: node.x,
        y: node.y,
        props: {
          geo: node.shape,
          w: node.width,
          h: node.height,
          color: node.color,
          fill: 'semi',
          dash: 'draw',
          richText: toRichText(text),
        },
        meta: { ...sourceMeta, piVisualNode: node.id },
      })
    }

    for (const edge of SPEC.edges) {
      const arrowId = createShapeId(edge.id)
      helpers.createShapeIfMissing({
        id: arrowId,
        type: 'arrow',
        x: edge.start.x,
        y: edge.start.y,
        props: {
          start: { x: 0, y: 0 },
          end: { x: edge.end.x - edge.start.x, y: edge.end.y - edge.start.y },
          arrowheadEnd: 'arrow',
          richText: toRichText(edge.label),
        },
        meta: sourceMeta,
      })

      const startBindingId = createBindingId(\`${"${edge.id}-start"}\`)
      const endBindingId = createBindingId(\`${"${edge.id}-end"}\`)
      const bindings = []
      if (!editor.store.get(startBindingId)) {
        bindings.push({
          id: startBindingId,
          fromId: arrowId,
          toId: createShapeId(edge.fromShapeId),
          type: 'arrow',
          props: {
            terminal: 'start',
            normalizedAnchor: { x: 0.5, y: 0.5 },
            isExact: false,
            isPrecise: false,
          },
        })
      }
      if (!editor.store.get(endBindingId)) {
        bindings.push({
          id: endBindingId,
          fromId: arrowId,
          toId: createShapeId(edge.toShapeId),
          type: 'arrow',
          props: {
            terminal: 'end',
            normalizedAnchor: { x: 0.5, y: 0.5 },
            isExact: false,
            isPrecise: false,
          },
        })
      }
      if (bindings.length > 0) editor.createBindings(bindings)
    }
  }, { history: 'ignore' })

  editor.zoomToFit({ animation: { duration: 200 } })
}
`;
}

async function createArchive(
  pi: ExtensionAPI,
  companionPath: string,
  title: string,
  script: string,
  digest: string,
  signal?: AbortSignal,
): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "pi-tldraw-visual-"));
  const workingDir = join(temporaryRoot, "archive");
  const temporaryArchive = join(temporaryRoot, "visual.tldraw");
  try {
    await mkdir(join(workingDir, "assets"), { recursive: true });
    await mkdir(join(workingDir, "script"), { recursive: true });
    await copyFile(BLANK_DB_PATH, join(workingDir, "db.sqlite"));
    await writeFile(join(workingDir, "script", "main.js"), script, "utf8");
    const metadata = {
      formatVersion: 1,
      displayName: title,
      createdWith: "pi-tldraw-visual/0.1.0",
      documentClock: 0,
      script: {
        sha256: digest,
        author: "pi",
        description: "Generated visual companion for a Markdown document",
      },
    };
    await writeFile(
      join(workingDir, "metadata.json"),
      JSON.stringify(metadata, null, "\t"),
      "utf8",
    );

    const result = await pi.exec(
      "/usr/bin/zip",
      [
        "-q",
        "-r",
        temporaryArchive,
        "metadata.json",
        "db.sqlite",
        "assets",
        "script",
      ],
      { cwd: workingDir, signal, timeout: 30_000 },
    );
    if (result.code !== 0) {
      throw new Error(
        `Could not package .tldraw archive: ${result.stderr || result.stdout}`,
      );
    }

    await mkdir(dirname(companionPath), { recursive: true });
    const staged = join(
      dirname(companionPath),
      `.${basename(companionPath)}.tmp-${process.pid}-${Date.now()}`,
    );
    await copyFile(temporaryArchive, staged);
    await rename(staged, companionPath);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function openAndVerify(
  pi: ExtensionAPI,
  companionPath: string,
  sourceHash: string,
  signal?: AbortSignal,
): Promise<{ verified: boolean; shapeCount?: number; warning?: string }> {
  if (platform() !== "darwin") {
    return {
      verified: false,
      warning:
        "The visual was created, but automatic app launch is currently configured for macOS only.",
    };
  }

  const opened = await pi.exec(
    "/usr/bin/open",
    ["-a", APP_NAME, companionPath],
    {
      signal,
      timeout: 15_000,
    },
  );
  if (opened.code !== 0) {
    return {
      verified: false,
      warning: `Created the visual, but could not open ${APP_NAME}: ${opened.stderr || opened.stdout}`,
    };
  }

  const target = await canonicalPath(companionPath);
  const deadline = Date.now() + VERIFY_TIMEOUT_MS;
  let lastWarning =
    "tldraw Offline did not expose the generated canvas before verification timed out.";
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("Cancelled");
    const config = await readServerConfig();
    if (!config) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 400));
      continue;
    }
    try {
      const docs = await canvasSearch<OpenCanvas[]>(
        config,
        "return await api.getDocs()",
        signal,
      );
      let doc: OpenCanvas | undefined;
      for (const candidate of docs) {
        if (
          candidate.filePath &&
          (await canonicalPath(candidate.filePath)) === target
        ) {
          doc = candidate;
          break;
        }
      }
      if (!doc) {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 400));
        continue;
      }
      const page = await canvasSearch<{
        shapes: Array<{ meta?: Record<string, unknown> }>;
      }>(
        config,
        `return await api.getShapes(${JSON.stringify(doc.id)})`,
        signal,
      );
      const generated = page.shapes.filter(
        (shape) => shape.meta?.piVisualSource === sourceHash,
      );
      if (generated.length > 0) {
        return { verified: true, shapeCount: generated.length };
      }
      lastWarning =
        "The canvas opened, but its generated document script has not produced shapes yet.";
    } catch (error) {
      lastWarning = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  return { verified: false, warning: lastWarning };
}

function createTldrawVisualTool(pi: ExtensionAPI) {
  return defineTool({
    name: "tldraw_visual",
    label: "tldraw Visual",
    description:
      "Create or replace an on-demand native tldraw Offline visual companion for a substantive Markdown document. The companion is written to a sibling .visuals directory. Nodes and edges must be a concise semantic diagram, not a verbatim rendering of the Markdown.",
    promptSnippet:
      "Create native tldraw Offline visual companions under .visuals",
    promptGuidelines: [
      "Use tldraw_visual only when the user explicitly asks for a visual companion or invokes /visualize or /visualize-all; do not create visuals automatically for ordinary Markdown edits.",
      "Before calling tldraw_visual, read the Markdown and synthesize its key ideas into a legible semantic diagram with non-overlapping coordinates and meaningful bound edges.",
    ],
    parameters: visualParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const input = params as VisualParams;
      const markdownPath = markdownPathFromInput(ctx.cwd, input.markdownPath);
      if (extname(markdownPath).toLowerCase() !== ".md") {
        throw new Error(`Expected a Markdown file, got: ${markdownPath}`);
      }
      const info = await stat(markdownPath).catch(() => null);
      if (!info?.isFile())
        throw new Error(`Markdown file not found: ${markdownPath}`);
      if (info.size > MAX_MARKDOWN_BYTES) {
        throw new Error(
          `Markdown file is larger than ${MAX_MARKDOWN_BYTES / 1024 / 1024}MB: ${markdownPath}`,
        );
      }
      validateSpec(input);

      await readFile(markdownPath);
      const sourceHash = sha256(markdownPath).slice(0, 16);
      const companionPath = companionPathFor(markdownPath);
      const script = buildDocumentScript(input, markdownPath, sourceHash);
      const digest = calculateScriptDigest({ "main.js": script });
      const edges = input.edges ?? [];

      onUpdate?.({
        content: [{ type: "text", text: `Creating ${companionPath}...` }],
        details: { companionPath },
      });

      await withFileMutationQueue(companionPath, async () => {
        if (await findOpenCanvas(companionPath, signal)) {
          throw new Error(
            `Close ${companionPath} in tldraw Offline before regenerating it. The app does not merge external changes into an open canvas.`,
          );
        }
        await createArchive(
          pi,
          companionPath,
          input.title,
          script,
          digest,
          signal,
        );
        await trustGeneratedScript(digest);
      });

      let verification: {
        verified: boolean;
        shapeCount?: number;
        warning?: string;
      } = {
        verified: false,
      };
      const shouldOpen = input.open !== false;
      if (shouldOpen) {
        onUpdate?.({
          content: [
            {
              type: "text",
              text: `Opening ${APP_NAME} and verifying the canvas...`,
            },
          ],
          details: { companionPath },
        });
        verification = await openAndVerify(
          pi,
          companionPath,
          sourceHash,
          signal,
        );
      }

      const details: VisualDetails = {
        markdownPath,
        companionPath,
        digest,
        nodeCount: input.nodes.length,
        edgeCount: edges.length,
        opened: shouldOpen,
        verified: verification.verified,
        verifiedShapeCount: verification.shapeCount,
        warning: verification.warning,
      };
      const relativeCompanion =
        resolve(ctx.cwd) === dirname(companionPath)
          ? basename(companionPath)
          : companionPath;
      let text = `Created visual companion: ${relativeCompanion}\nNodes: ${input.nodes.length}; edges: ${edges.length}.`;
      if (verification.verified) {
        text += `\nVerified ${verification.shapeCount} generated shapes in tldraw Offline.`;
      } else if (verification.warning) {
        text += `\nWarning: ${verification.warning}`;
      }
      return {
        content: [{ type: "text", text }],
        details,
      };
    },
  });
}

function createTldrawCmuxTool(
  pi: ExtensionAPI,
  ensurePaneServer: () => Promise<CmuxPaneServer>,
) {
  return defineTool({
    name: "tldraw_cmux",
    label: "tldraw cmux Pane",
    description:
      "Open an existing generated tldraw visual companion as an interactive local canvas in a cmux browser pane. Accepts either the Markdown source path or its .tldraw companion path.",
    promptSnippet:
      "Open generated tldraw visuals in an embedded cmux browser pane",
    promptGuidelines: [
      "Use tldraw_cmux when the user explicitly asks to open or show a tldraw visual inside cmux; create a missing companion with tldraw_visual first.",
    ],
    parameters: Type.Object({
      path: Type.String({
        description: "Markdown source path or generated .tldraw companion path",
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const companionPath = companionPathFromInput(ctx.cwd, params.path);
      const info = await stat(companionPath).catch(() => null);
      if (!info?.isFile()) {
        throw new Error(
          `Visual companion not found: ${companionPath}. Create it with tldraw_visual first.`,
        );
      }
      await readArchivedVisual(pi, companionPath, signal);
      const paneServer = await ensurePaneServer();
      const url = await openCmuxPane(pi, paneServer, companionPath, signal);
      return {
        content: [
          {
            type: "text",
            text: `Opened interactive tldraw canvas in cmux: ${companionPath}`,
          },
        ],
        details: { companionPath, url },
      };
    },
  });
}

export default function tldrawVisualExtension(pi: ExtensionAPI) {
  let paneServer: CmuxPaneServer | null = null;
  const ensurePaneServer = async () => {
    if (paneServer?.server.listening) return paneServer;
    paneServer = await startCmuxPaneServer(pi);
    return paneServer;
  };

  pi.registerTool(createTldrawVisualTool(pi));
  pi.registerTool(createTldrawCmuxTool(pi, ensurePaneServer));

  pi.on("session_shutdown", async () => {
    const active = paneServer;
    paneServer = null;
    if (!active) return;
    await new Promise<void>((resolvePromise) =>
      active.server.close(() => resolvePromise()),
    );
  });

  pi.registerCommand("visualize", {
    description:
      "Create or update a .visuals tldraw companion for one Markdown document",
    handler: async (args, ctx) => {
      let path = args.trim();
      if (!path && ctx.hasUI) {
        path =
          (await ctx.ui.input(
            "Markdown document to visualize:",
            "docs/spec.md",
          )) ?? "";
      }
      if (!path) {
        ctx.ui.notify("Usage: /visualize <path-to-markdown>", "warning");
        return;
      }
      if (!ctx.isIdle()) {
        ctx.ui.notify(
          "Wait for the current agent run to finish, then retry /visualize.",
          "warning",
        );
        return;
      }
      pi.sendUserMessage(
        `Create or update the on-demand tldraw visual companion for ${JSON.stringify(path)}. ` +
          "Read the Markdown first, identify its key concepts and relationships, then call tldraw_visual exactly once. " +
          "Use a clear semantic diagram with concise nodes, meaningful edges, and non-overlapping coordinates. " +
          "Do not rewrite the Markdown unless a correction is necessary for the visual to be accurate.",
      );
    },
  });

  pi.registerCommand("visualize-cmux", {
    description:
      "Create a Markdown visual companion and open it in a cmux browser pane",
    handler: async (args, ctx) => {
      let path = args.trim();
      if (!path && ctx.hasUI) {
        path =
          (await ctx.ui.input(
            "Markdown document to visualize in cmux:",
            "docs/spec.md",
          )) ?? "";
      }
      if (!path) {
        ctx.ui.notify("Usage: /visualize-cmux <path-to-markdown>", "warning");
        return;
      }
      if (!ctx.isIdle()) {
        ctx.ui.notify(
          "Wait for the current agent run to finish, then retry /visualize-cmux.",
          "warning",
        );
        return;
      }
      pi.sendUserMessage(
        `Create or update the tldraw visual companion for ${JSON.stringify(path)} and open it inside cmux. ` +
          "Read the Markdown, call tldraw_visual exactly once with open=false and a concise semantic diagram, " +
          "then call tldraw_cmux with the same Markdown path. Do not open the native tldraw app.",
      );
    },
  });

  pi.registerCommand("tldraw-pane", {
    description:
      "Open an existing .visuals companion in an interactive cmux browser pane",
    handler: async (args, ctx) => {
      if (!args.trim()) {
        ctx.ui.notify(
          "Usage: /tldraw-pane <markdown-or-tldraw-path>",
          "warning",
        );
        return;
      }
      const companionPath = companionPathFromInput(ctx.cwd, args);
      const info = await stat(companionPath).catch(() => null);
      if (!info?.isFile()) {
        ctx.ui.notify(`Visual companion not found: ${companionPath}`, "error");
        return;
      }
      try {
        await readArchivedVisual(pi, companionPath);
        const server = await ensurePaneServer();
        await openCmuxPane(pi, server, companionPath);
        ctx.ui.notify(`Opened ${companionPath} in cmux`, "info");
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          "error",
        );
      }
    },
  });

  pi.registerCommand("visualize-all", {
    description:
      "Backfill .visuals companions for substantive Markdown documents in a directory",
    handler: async (args, ctx) => {
      const directory = args.trim() || ".";
      if (!ctx.isIdle()) {
        ctx.ui.notify(
          "Wait for the current agent run to finish, then retry /visualize-all.",
          "warning",
        );
        return;
      }
      pi.sendUserMessage(
        `Backfill on-demand tldraw visual companions for substantive Markdown documents under ${JSON.stringify(directory)}. ` +
          "Find authored READMEs, plans, specs, research, and notes; skip dependencies, generated files, changelogs, tiny stubs, and vendored content. " +
          "For each selected document, read it and call tldraw_visual once with a concise semantic diagram. " +
          "Process a reasonable batch and report any documents intentionally skipped.",
      );
    },
  });

  pi.registerCommand("tldraw-open", {
    description:
      "Open a Markdown document's .visuals companion in tldraw Offline",
    handler: async (args, ctx) => {
      if (!args.trim()) {
        ctx.ui.notify(
          "Usage: /tldraw-open <markdown-or-tldraw-path>",
          "warning",
        );
        return;
      }
      const inputPath = resolve(
        ctx.cwd,
        stripWrappingQuotes(stripAtPrefix(args)),
      );
      const path =
        extname(inputPath).toLowerCase() === ".md"
          ? companionPathFor(inputPath)
          : inputPath;
      const info = await stat(path).catch(() => null);
      if (!info?.isFile()) {
        ctx.ui.notify(`Visual companion not found: ${path}`, "error");
        return;
      }
      const result = await pi.exec("/usr/bin/open", ["-a", APP_NAME, path], {
        timeout: 15_000,
      });
      if (result.code !== 0) {
        ctx.ui.notify(
          result.stderr || result.stdout || `Could not open ${path}`,
          "error",
        );
        return;
      }
      ctx.ui.notify(`Opened ${path}`, "info");
    },
  });

  pi.registerCommand("tldraw-status", {
    description: "Show the tldraw Offline Canvas API status and open documents",
    handler: async (_args, ctx) => {
      const config = await readServerConfig();
      if (!config) {
        ctx.ui.notify(
          "tldraw Offline is not running or its Canvas API is unavailable.",
          "warning",
        );
        return;
      }
      try {
        const docs = await canvasSearch<OpenCanvas[]>(
          config,
          "return await api.getDocs()",
        );
        const summary =
          docs.length === 0
            ? `Canvas API is ready on port ${config.port}; no documents are open.`
            : `Canvas API is ready on port ${config.port}. Open: ${docs
                .map((doc) => `${doc.name}${doc.unsavedChanges ? "*" : ""}`)
                .join(", ")}`;
        ctx.ui.notify(summary, "info");
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          "error",
        );
      }
    },
  });
}
