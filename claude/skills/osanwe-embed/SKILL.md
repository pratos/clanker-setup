---
name: osanwe-embed
description: "Use Ósanwë's kernel (osanwe-core) in another project: pack the TypeScript packages and the kernel module as local artifacts with cargo xtask pack, link them live while developing, or take the Rust crate by path. Use when a project outside /Users/pratos/personal/nyi/osanwe needs @osanwe/core, @osanwe/host, @osanwe/chat, the osanwe-core crate or the wasmtime kernel, or asks how to install Ósanwë."
---

# Embed Ósanwë in another project

Ósanwë's repository is `/Users/pratos/personal/nyi/osanwe`. Nothing in it is on a registry: the crates say `publish = false` and the npm packages are `private`. That refuses `npm publish` and `cargo publish` only. A tarball, a `file:` link, a path dependency and a git pin all work.

Pick the route by the other project's language. Every route folds the same log to the same state, since the wasm and the kernel module are the Rust crate compiled.

| The other project is | Route |
|---|---|
| Node, a Worker, Rivet, a browser | `@osanwe/core` (the kernel as wasm), plus `@osanwe/host` for the thread protocol and `@osanwe/chat` to draw a thread |
| Rust | the crate `osanwe-core` by path or git |
| Anything that embeds wasmtime or another wasm runtime | the kernel module `osanwe-kernel-VERSION.wasm` |

## TypeScript, by tarball (reproducible)

Run in the Ósanwë repository:

```sh
cargo xtask pack
```

It rebuilds the wasm, the TypeScript builds and the kernel module, then writes `target/pack/`: one tarball each of core, host and chat, the kernel module, and `osanwe-pack.json` with the version, the commit and whether the tree had uncommitted changes. `--no-build` packs what is built already, `--no-kernel` leaves the module out, `--out DIR` writes elsewhere. The command prints the install line; it has the shape

```sh
npm install /path/to/osanwe/target/pack/osanwe-core-0.3.0.tgz /path/to/osanwe/target/pack/osanwe-host-0.3.0.tgz
```

Rules:

- Install the host's tarball in the same command as the core's. The host takes `@osanwe/core` as a peer dependency at the exact version, and pnpm refuses a git or file dependency under a dependency (ERR_PNPM_EXOTIC_SUBDEP). Never make it a plain dependency.
- npm does not reinstall a tarball whose name and version match what it has. After a kernel change the consumer must see, bump `version` in `packages/core`, `packages/host` and `packages/chat` and the workspace version in `Cargo.toml`, or remove the package from the consumer's `node_modules` before installing.
- Pack from a clean commit when someone else will install the result. The manifest says `dirty: true` otherwise.

## TypeScript, by link (live)

For a day of editing the kernel and seeing it in the other project at once, point its `package.json` at the directories:

```json
"@osanwe/core": "file:../osanwe/packages/core",
"@osanwe/host": "file:../osanwe/packages/host"
```

npm symlinks them, so `cargo xtask build wasm` and `cargo xtask build ts` in Ósanwë land in the consumer with no reinstall. Nothing pins what ran, so switch to a tarball or a git pin before anything that must be reproducible.

## TypeScript, by git pin (a build machine with no sibling checkout)

This is Emmarie's route. The consumer pins one commit of `github.com/pratos/osanwe` with a path to the package. The committed `build/` and `wasm/` are what it runs, so a change is not usable there until it is on `origin/main`: change Ósanwë, run `cargo xtask build wasm` and `cargo xtask build ts`, commit what they write, push with the person's word, then move the pin. Never copy Ósanwë's code into the consumer.

## Wiring a TypeScript host

`packages/core/README.md` documents every export. The shape: `init(module)` once per process or isolate, then `new Session(options, host)` with what only the host can supply (a `Store` with `append` and `flush`, a `fetch`, the API key, a `ToolRunner`, optionally a clock and `onText`). `process`, `enqueue` and `pump` drive it; `input`, `decide`, `answer` and `cancel` are the person's commands; `foldLog` and `resume` reopen a log. Behind the thread protocol, `ThreadHost` in `@osanwe/host` keeps the session private and gives the app `entry`, `appendContext`, `requestEffect` and `facet` (docs/EXTENSIONS.md). The reference hosts are `apps/cli` and `apps/worker`.

What the wasm cannot do: models of other providers (`openai:`, `gemini:` and the rest), which go through genai in the native binary only, and tools, which need `osanwe tool-server` by stdio or URL.

## Rust

```toml
[dependencies]
osanwe-core = { path = "../osanwe/crates/osanwe-core" }
# or pinned:
osanwe-core = { git = "https://github.com/pratos/osanwe.git", rev = "COMMIT" }
```

The crate is sans-IO. The consumer supplies a `Journal` (one synchronous `append`), builds `Machine::new(world, journal, clock)` and `Runner::new(machine, deterministic, approve, base_url, traced)`, then loops: `run()` gives the work, the consumer performs each model call step by step and each `ToolJob`, and `poll`, `feed`, `complete` and `fail` hand the results back. `crates/osanwe/src/driver.rs` is the worked example, and `crates/osanwe-wasm` is the same wiring behind wasm-bindgen.

## The kernel module

`cargo xtask pack` leaves `osanwe-kernel-VERSION.wasm` in `target/pack/`, or `cargo xtask build kernel` writes it to `target/kernel/`. Copy that one file into the other project. The ABI, three imports and a method table over JSON bytes, is at the top of `crates/osanwe-kernel/src/lib.rs`; the desktop app's wasmtime host in `crates/ithildin` is the worked example.

## Keys

The API key reaches the kernel in no route. A TypeScript host passes it as `apiKey` and the wrapper adds the header; a Rust host adds it when it sends. Keys come from the environment or the Keychain through `cargo xtask secret run`, never from a file an agent writes.
