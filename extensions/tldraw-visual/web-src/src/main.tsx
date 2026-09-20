import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Tldraw,
  createBindingId,
  createShapeId,
  toRichText,
  type Editor,
} from "tldraw";
import "tldraw/tldraw.css";
import "./styles.css";

type ColorName =
  | "black"
  | "blue"
  | "green"
  | "grey"
  | "light-blue"
  | "light-green"
  | "light-red"
  | "light-violet"
  | "orange"
  | "red"
  | "violet"
  | "yellow";

type GeoName =
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "hexagon"
  | "oval"
  | "rhombus"
  | "star"
  | "triangle";

type VisualNode = {
  id: string;
  shapeId: string;
  title: string;
  body: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: ColorName;
  shape: GeoName;
};

type VisualEdge = {
  id: string;
  fromShapeId: string;
  toShapeId: string;
  label: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
};

type VisualSpec = {
  sourceHash: string;
  sourcePath: string;
  title: string;
  titleShapeId: string;
  titleX: number;
  titleY: number;
  titleWidth: number;
  nodes: VisualNode[];
  edges: VisualEdge[];
};

type SpecResponse = {
  spec: VisualSpec;
  persistenceKey: string;
  companionPath: string;
};

function seedDiagram(editor: Editor, spec: VisualSpec) {
  const sourceMeta = {
    piVisual: true,
    piVisualSource: spec.sourceHash,
    markdownPath: spec.sourcePath,
  };
  const titleId = createShapeId(spec.titleShapeId);
  if (!editor.getShape(titleId)) {
    editor.createShape({
      id: titleId,
      type: "geo",
      x: spec.titleX,
      y: spec.titleY,
      props: {
        geo: "rectangle",
        w: spec.titleWidth,
        h: 110,
        color: "blue",
        fill: "semi",
        size: "l",
        richText: toRichText(spec.title),
      },
      meta: sourceMeta,
    });
  }

  for (const node of spec.nodes) {
    const id = createShapeId(node.shapeId);
    if (editor.getShape(id)) continue;
    editor.createShape({
      id,
      type: "geo",
      x: node.x,
      y: node.y,
      props: {
        geo: node.shape,
        w: node.width,
        h: node.height,
        color: node.color,
        fill: "semi",
        dash: "draw",
        richText: toRichText(
          node.body ? `${node.title}\n\n${node.body}` : node.title,
        ),
      },
      meta: { ...sourceMeta, piVisualNode: node.id },
    });
  }

  for (const edge of spec.edges) {
    const arrowId = createShapeId(edge.id);
    if (!editor.getShape(arrowId)) {
      editor.createShape({
        id: arrowId,
        type: "arrow",
        x: edge.start.x,
        y: edge.start.y,
        props: {
          start: { x: 0, y: 0 },
          end: {
            x: edge.end.x - edge.start.x,
            y: edge.end.y - edge.start.y,
          },
          arrowheadEnd: "arrow",
          richText: toRichText(edge.label),
        },
        meta: sourceMeta,
      });
    }

    const startBindingId = createBindingId(`${edge.id}-start`);
    const endBindingId = createBindingId(`${edge.id}-end`);
    const bindings = [];
    if (!editor.store.get(startBindingId)) {
      bindings.push({
        id: startBindingId,
        fromId: arrowId,
        toId: createShapeId(edge.fromShapeId),
        type: "arrow" as const,
        props: {
          terminal: "start" as const,
          normalizedAnchor: { x: 0.5, y: 0.5 },
          isExact: false,
          isPrecise: false,
        },
      });
    }
    if (!editor.store.get(endBindingId)) {
      bindings.push({
        id: endBindingId,
        fromId: arrowId,
        toId: createShapeId(edge.toShapeId),
        type: "arrow" as const,
        props: {
          terminal: "end" as const,
          normalizedAnchor: { x: 0.5, y: 0.5 },
          isExact: false,
          isPrecise: false,
        },
      });
    }
    if (bindings.length > 0) editor.createBindings(bindings);
  }

  window.setTimeout(
    () => editor.zoomToFit({ animation: { duration: 200 } }),
    50,
  );
}

function App() {
  const [document, setDocument] = useState<SpecResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const file = query.get("file");
    const token = query.get("token");
    if (!file || !token) {
      setError("Missing visual file or cmux pane token.");
      return;
    }
    const request = new URLSearchParams({ file, token });
    fetch(`/api/spec?${request}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return (await response.json()) as SpecResponse;
      })
      .then(setDocument)
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      );
  }, []);

  if (error) {
    return <div className="message error">{error}</div>;
  }
  if (!document) {
    return <div className="message">Loading visual companion…</div>;
  }

  return (
    <main>
      <Tldraw
        persistenceKey={`cmux-tldraw-${document.persistenceKey}`}
        onMount={(editor) => seedDiagram(editor, document.spec)}
      />
      <div className="source-pill" title={document.companionPath}>
        {document.spec.title}
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
