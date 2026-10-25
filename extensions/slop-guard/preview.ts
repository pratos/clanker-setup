/**
 * slop-guard — path routing and edit preview
 *
 * Decides which files the guard applies to (tiny glob matcher, no deps) and
 * reconstructs what a file will look like after an `edit` tool call, so the
 * guard can judge the result before it lands.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const globCache = new Map<string, RegExp>();

/** Supports `**`, `*`, `?`. A `**` segment matches zero or more directories. */
export function globToRegExp(glob: string): RegExp {
  const cached = globCache.get(glob);
  if (cached) return cached;

  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        const j = i + 2;
        if (glob[j] === "/") {
          re += "(?:[^/]*/)*";
          i = j;
        } else {
          re += ".*";
          i = j - 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (".+^$()|[]{}\\".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  const compiled = new RegExp(`^${re}$`);
  globCache.set(glob, compiled);
  return compiled;
}

export function matchesAny(relPath: string, patterns: string[]): boolean {
  return patterns.some((p) => globToRegExp(p).test(relPath));
}

export function shouldCheckPath(path: string, include: string[], exclude: string[], cwd: string): boolean {
  const abs = isAbsolute(path) ? path : resolve(cwd, path);
  const rel = relative(cwd, abs).split(sep).join("/");
  if (rel.startsWith("..")) return false; // outside the project
  if (matchesAny(rel, exclude)) return false;
  return matchesAny(rel, include);
}

export interface EditInstruction {
  oldText: string;
  newText: string;
}

/**
 * Apply an edit call's edits to the original content. pi matches each
 * edits[].oldText against the original file (not sequentially), so we locate
 * spans on the original and splice them all in. If anything doesn't line up,
 * we fall back to the new text alone and mark the preview approximate.
 */
export function previewEdit(original: string, edits: EditInstruction[]): { text: string; approximate: boolean } {
  let approximate = false;
  const spans: { start: number; end: number; newText: string }[] = [];

  for (const edit of edits) {
    const i = original.indexOf(edit.oldText);
    if (i === -1) {
      approximate = true;
      continue;
    }
    const end = i + edit.oldText.length;
    if (spans.some((s) => i < s.end && s.start < end)) {
      approximate = true;
      continue;
    }
    spans.push({ start: i, end, newText: edit.newText });
  }

  if (spans.length === 0) {
    const joined = edits.map((e) => e.newText).join("\n\n");
    return { text: joined, approximate: edits.length > 0 };
  }

  spans.sort((a, b) => a.start - b.start);
  let out = "";
  let pos = 0;
  for (const s of spans) {
    out += original.slice(pos, s.start) + s.newText;
    pos = s.end;
  }
  out += original.slice(pos);
  return { text: out, approximate };
}

/** Content a write/edit would produce; null when it can't be determined. */
export async function previewTargetContent(
  toolName: "write" | "edit",
  input: { path: string; content?: string; edits?: EditInstruction[] },
  cwd: string,
): Promise<{ text: string; approximate: boolean } | null> {
  if (toolName === "write") {
    return typeof input.content === "string" ? { text: input.content, approximate: false } : null;
  }
  if (!Array.isArray(input.edits) || input.edits.length === 0) return null;
  const abs = isAbsolute(input.path) ? input.path : resolve(cwd, input.path);
  let original: string;
  try {
    original = await readFile(abs, "utf8");
  } catch {
    return null; // unreadable file: the tool itself will fail; nothing to guard
  }
  return previewEdit(original, input.edits);
}
