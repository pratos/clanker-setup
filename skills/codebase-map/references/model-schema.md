# Codebase map model

The renderer accepts one JSON object. All user-visible strings are escaped before insertion into the page.

## Complete shape

```json
{
  "title": "Checkout request path",
  "subtitle": "From HTTP entrypoint to payment result",
  "repository": "acme/storefront",
  "summary": "The API validates a command, the checkout service owns orchestration, and durable state is committed before events are published.",
  "question": "How does checkout execute and where is state committed?",
  "canvas": { "width": 1200, "height": 760 },
  "stats": [
    { "label": "BOUNDARIES", "value": "4" },
    { "label": "PRIMARY FLOWS", "value": "2" }
  ],
  "groups": [
    {
      "id": "interface",
      "label": "Interface",
      "description": "Owns transport parsing and validation",
      "color": "#638b7b"
    }
  ],
  "nodes": [
    {
      "id": "checkout-api",
      "label": "Checkout API",
      "shortLabel": "API",
      "group": "interface",
      "kind": "entry",
      "x": 90,
      "y": 150,
      "width": 190,
      "height": 92,
      "file": "src/http/checkout.ts",
      "line": 42,
      "responsibility": "Validates the request and creates a checkout command.",
      "implementation": "The POST handler parses the body, calls validateCheckout, and delegates to CheckoutService.",
      "evidence": ["src/http/checkout.ts:42", "src/http/checkout.test.ts"],
      "confidence": "observed",
      "tags": ["HTTP", "validation"]
    }
  ],
  "flows": [
    {
      "id": "checkout",
      "label": "Checkout request",
      "description": "The primary synchronous request path.",
      "color": "#ad5f45",
      "steps": [
        {
          "from": "checkout-api",
          "to": "checkout-service",
          "label": "validated command",
          "payload": "CheckoutCommand { cartId, customerId }",
          "description": "Transport data becomes a domain command after validation."
        }
      ]
    }
  ],
  "notes": ["Payment-provider retry behavior is omitted from this view."]
}
```

## Required fields

At the root:

- `title`: concise diagram title
- `repository`: repository or workspace name
- `summary`: two or three sentences at most
- `groups`: non-empty array
- `nodes`: non-empty array
- `flows`: array; it may be empty for a purely structural map

For each group:

- `id`: unique ID
- `label`: visible boundary name

For each node:

- `id`: unique ID
- `label`: visible name
- `group`: an existing group ID
- `x`, `y`: coordinates in canvas units
- `responsibility`: what this node owns

For each flow:

- `id`: unique ID
- `label`: visible flow name
- `steps`: directed edges

For each step:

- `from`, `to`: existing node IDs
- `label`: concise edge label
- `payload`: concrete data or state represented by animated particles

## Coordinates

The default canvas is `1200 × 760`. Place nodes on a loose grid:

- left/right margin: 60
- top margin: 90
- normal node width: 170–220
- normal node height: 80–120
- horizontal gap: at least 90
- vertical gap: at least 70

Edges connect node centers and curve automatically. Avoid placing unrelated nodes directly on the line between a connected pair. Arrange the primary flow left-to-right or top-to-bottom.

## Optional fields and defaults

- `subtitle`: defaults to the scoped question
- `question`: shown in the overview inspector
- `canvas`: defaults to `{ "width": 1200, "height": 760 }`
- `stats`: defaults to derived node/group/flow counts
- `notes`: defaults to an empty list
- group `description`: defaults to empty
- group `color`: defaults to a palette color
- node `shortLabel`: defaults to the first letters of `label`
- node `kind`: defaults to `process`
- node `width`: defaults to `190`
- node `height`: defaults to `92`
- node `file`: defaults to empty
- node `line`: optional positive integer
- node `implementation`: defaults to empty
- node `evidence`: defaults to an empty list
- node `confidence`: `observed`, `inferred`, or `uncertain`; defaults to `observed`
- node `tags`: defaults to an empty list
- flow `description`: defaults to empty
- flow `color`: defaults to a palette color
- step `description`: defaults to empty

## Modeling guidance

### Groups

Use groups for boundaries that matter to the question: process, package, layer, service, persistence boundary, or external system. Do not mechanically mirror directories.

### Nodes

A node should have one clear responsibility. Combine tiny helpers into their owner. Split a module only when its roles participate differently in the flow.

### Flows

A flow is a sequence of related runtime or data transitions. Prefer one primary flow and, when useful, one failure/background flow. If order matters, list steps in execution order.

### Evidence

Evidence must point to inspected source. A useful evidence list contains entrypoint definitions, call sites, state mutations, schemas, or behavior-defining tests. Never fabricate line numbers.
