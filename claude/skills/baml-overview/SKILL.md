---
name: overview
description: BAML, full-picture-first. Same language as the core skill — a statically-typed, expression-oriented language (TypeScript-like, snake_case methods) with first-class LLM functions — but start by running `baml describe baml` to dump the ENTIRE stdlib (every namespace, type, and function) in one listing, then drill into any name with `baml describe <name>`. The CLI is the reference; never guess stdlib.
---

# baml — full picture first

BAML ≈ TypeScript, expression-oriented, snake_case methods, with LLM functions (`client:` + `prompt:` blocks that desugar to plain functions). **The CLI is the documentation. Get the whole map up front, then drill in:**

```bash
brew install baml                # binary: `baml-cli` (alias `baml`)

baml describe baml               # ← THE FULL PICTURE: every namespace, type & function in
                                 #   the stdlib in one listing (csv, env, errors, fs, http,
                                 #   json, math, net, time, toml, yaml, …) — read this first
baml describe baml.json          # drill into a namespace — its types + function signatures
baml describe Array              # drill into a type — full method list + docs
                                 #   (Array, String, Map, Int, Float, baml.fs, baml.errors, …)
                                 #   If output ends with "… N more lines", re-run with
                                 #   `--budget <higher-number>` to see the rest.

baml init                        # new project (baml.toml + baml_src/)
baml check                       # compile-check the project — errors + warnings
baml run -e 'expr'               # eval an expression — fast feedback, doubles as a syntax check
baml test --list && baml test -i "suite::case"
baml fmt baml_src/main.baml      # run before finishing
```

`baml describe baml` is the entry point: one command prints the complete stdlib
surface so you know what exists before reaching for it. When a name looks useful,
`baml describe <that name>` for its signatures. Anything you can't see → describe it; don't guess.

Pure (non-LLM) functions need no test block, testset wrapper, or client config — verify them instantly with `baml run -e 'add(2, 3)'`. This is the fastest feedback path for arithmetic, string-processing, and utility functions.

## The five fatal traps (everything else, `baml describe` it)

1. Class fields are `name: type,` — `baml fmt` writes the colon + comma (bare `name type` also parses, but fmt normalizes). Construction matches: `Point { x: 1 }`. Methods take explicit `self`; factories don't.
2. Last expression in a block is its value (Rust-style). Early exit: `return x;` with trailing `;`. No-value functions: `-> null` + trailing `null`.
3. `for (let x in xs)` iterates VALUES and requires `let`. `if`/`match`/blocks are expressions; `match (v) { 0 => "a", _ => "b" }`.
4. No implicit string coercion (`"n=" + 5` won't compile — `baml.unstable.string(5)`); indexing panics out of bounds (use `.at(i)`/`.get(k)` → `T?`); closures are `(x: T) -> R { ... }` (the `=>` arrow is match-only — `.filter`/`.map` return arrays directly, no `.collect()`); map keys must be `string`.
5. `catch` arms are type-only and non-exhaustive: `f(x) catch (e) { BadInput => fallback }`; `throws T` is part of the signature; panics aren't catchable.

### Gotchas (easy-to-miss silent pitfalls)

- **Closures:** outside obvious inference contexts, closures need typed params **and** an explicit return annotation: `(x: int) -> int { x + 1 }`.
- **`??` precedence:** `??` binds looser than `+`; `m.get(w) ?? 0 + 1` parses as `m.get(w) ?? (0 + 1)`. Use parentheses: `(m.get(w) ?? 0) + 1`.
- **`catch` type paths:** `catch` arms must use fully-qualified error names (for example `baml.json.JsonParseError`, not `JsonParseError`).
- **`reduce` under `baml run -e`:** inline-closure inference can fail; if it does, move the reducer into a named function in `baml_src` and call that function from `run -e`.
- **`Array.insert` argument order:** it is `insert(item, idx)`, not `insert(idx, item)` like many other languages.

## LLM functions + tests, minimum viable

```baml
class Intent {
    kind: "billing" | "support" | "other",
    confidence: float,
}

function classify(text: string) -> Intent {
    client: "openai/gpt-4o-mini"
    prompt: #"Classify: {{ text }}  {{ ctx.output_format }}"#   // ALWAYS include ctx.output_format
}

// A single test needs no wrapper — `testset "name" { ... }` only GROUPS multiple tests.
test "parses" {
    let r = baml.json.from_string<Intent>(#"{ "kind": "support", "confidence": 0.9 }"#);
    assert.equal(r.kind, "support")  // trailing expr → no `;`; asserts: equal is_true not_null contains
}
```

The return type is the schema; prompts are `#"..."#` block strings with Jinja inside `{{ }}`. Every LLM function gets a `name$parse(raw)` companion for parsing captured replies in tests.

**Workflow: `baml describe baml` for the full picture → sketch → `baml run -e` / `baml check` constantly → `baml describe <name>` for any signature → `baml test` → `baml fmt`.**
