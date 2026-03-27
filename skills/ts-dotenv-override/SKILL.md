---
name: ts-dotenv-override
description: Ensures .env files in TypeScript projects override sops-nix shell secrets. Use when setting up env loading, debugging missing/wrong API keys, or configuring dotenv in TS projects.
---

# TypeScript .env Override for sops-nix

## Activation

**When this skill is triggered, ALWAYS display this banner first:**

```
╭─────────────────────────────────────────────────────────────╮
│  🔑 SKILL ACTIVATED: ts-dotenv-override                      │
├─────────────────────────────────────────────────────────────┤
│  Mode: [Setup | Debug | Fix]                                │
│  Action: Ensuring .env overrides sops-nix shell secrets     │
╰─────────────────────────────────────────────────────────────╯
```

Replace `[Mode]` with the detected trigger type.

## Background

This system uses **sops-nix** to decrypt secrets and export them as shell environment variables on every Fish shell startup (via `conf.d/secrets.fish`). These include API keys like `OPENROUTER_API_KEY`, `EXA_API_KEY`, `TAVILY_API_KEY`, etc.

The problem: most `.env` loaders in TypeScript/Node.js **do not override** existing environment variables by default. So the sops-nix value always wins over the project-local `.env` value, which causes confusion when projects need different keys or per-project configuration.

### Auto-loaded sops-nix secrets (always in shell env)

| Secret Path              | Env Var                |
|--------------------------|------------------------|
| `openrouter/api-key`     | `OPENROUTER_API_KEY`   |
| `exa/api-key`            | `EXA_API_KEY`          |
| `tavily/api-key`         | `TAVILY_API_KEY`       |
| `serper/api-key`         | `SERPER_API_KEY`       |

These are set by `~/.config/fish/conf.d/secrets.fish` before any project code runs.

## When to Use

This skill activates when:

- Setting up `.env` / `dotenv` in a TypeScript project
- "my .env isn't working" or "wrong API key being used"
- "env variable not picking up from .env"
- "sops secret overriding .env"
- Configuring environment loading in Next.js, Vite, Hono, Express, or plain Node/Bun projects
- Creating a new TypeScript project that uses API keys

## Rules

**1. ALWAYS configure dotenv with `override: true` in TypeScript projects.**

**2. ALWAYS check for sops-nix conflicts when debugging env var issues.**

**3. NEVER assume `.env` values will win over shell environment by default.**

## Fix by Framework / Runtime

### Plain `dotenv` (Node.js)

```typescript
// ❌ WRONG — does NOT override existing env vars
import 'dotenv/config'

// ✅ CORRECT — overrides sops-nix shell secrets
import dotenv from 'dotenv'
dotenv.config({ override: true })
```

If using multiple `.env` files:

```typescript
import dotenv from 'dotenv'

// Load base, then overrides (last one wins)
dotenv.config({ path: '.env', override: true })
dotenv.config({ path: '.env.local', override: true })
```

### Bun

Bun auto-loads `.env` but does **not** override existing env vars. Fix:

```typescript
// At the very top of your entry point
import dotenv from 'dotenv'
dotenv.config({ override: true })
```

Or use the shell workaround:

```bash
# Unset conflicting vars before running
env -u OPENROUTER_API_KEY bun run dev
```

### Next.js

Next.js loads `.env` files automatically with this precedence:
1. `.env.$(NODE_ENV).local` (highest)
2. `.env.local`
3. `.env.$(NODE_ENV)`
4. `.env` (lowest)

**But it still does NOT override existing shell env vars.**

Fix — add to the **top** of `next.config.ts` (or `next.config.mjs`):

```typescript
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local', override: true })
```

Or use `@next/env` explicitly:

```typescript
import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd(), true) // second arg = force override dev mode
```

### Vite

Vite loads `.env` files but respects existing env vars. Fix in `vite.config.ts`:

```typescript
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // loadEnv with prefix '' loads all vars, not just VITE_*
  const env = loadEnv(mode, process.cwd(), '')
  return {
    define: {
      // Explicitly override process.env for server-side
      'process.env.OPENROUTER_API_KEY': JSON.stringify(env.OPENROUTER_API_KEY),
    },
  }
})
```

### Hono / Express / Fastify (server-side)

Add at the **very first line** of your entry point (before any imports that read env):

```typescript
import dotenv from 'dotenv'
dotenv.config({ override: true })

// Now import everything else
import { Hono } from 'hono'
// ...
```

### T3 Env (`@t3-oss/env-*`)

T3 Env validates env vars but reads from `process.env` — which already has sops values. Ensure dotenv override runs **before** the T3 schema is evaluated:

```typescript
// env.ts
import dotenv from 'dotenv'
dotenv.config({ override: true })

import { createEnv } from '@t3-oss/env-core'
// ...
```

### Wrangler (Cloudflare Workers)

Wrangler uses `.dev.vars` for local secrets — these properly override. No fix needed for local dev. For `wrangler.toml` vars, they are bundled at build time and don't conflict.

## Debugging Checklist

When a user reports wrong/stale env vars in a TypeScript project:

1. **Check if the var is auto-loaded by sops-nix:**
   ```bash
   echo $OPENROUTER_API_KEY  # If set, sops-nix loaded it
   ```

2. **Check the project's `.env` file:**
   ```bash
   grep OPENROUTER_API_KEY .env .env.local 2>/dev/null
   ```

3. **Check how dotenv is configured:**
   ```bash
   grep -r "dotenv" src/ --include="*.ts" --include="*.mts" --include="*.js"
   ```

4. **Verify override is enabled:**
   Look for `override: true` in dotenv config. If missing, that's the fix.

5. **Nuclear option — unset before running:**
   ```bash
   env -u OPENROUTER_API_KEY -u EXA_API_KEY bun run dev
   ```

## Helper: fish function

A convenience function is available in the shell config:

```fish
# Run any command with .env values overriding shell env
function with-dotenv
    if test -f .env
        env (grep -v '^#' .env | grep '=' | xargs) $argv
    else
        echo "No .env file found in current directory" >&2
        return 1
    end
end

# Usage:
# with-dotenv bun run dev
# with-dotenv node server.js
```

To add this function, edit `nixpkgs/home/fish.nix` and add it to `programs.fish.functions`.

## Red Flags

❌ Using `import 'dotenv/config'` without override (will NOT override sops-nix vars)
❌ Assuming `.env` values win over shell environment
❌ Debugging "wrong API key" without checking `echo $VAR_NAME` in shell first
❌ Hardcoding API keys in source code to "fix" the override issue
❌ Using `process.env.VAR = "value"` to override (fragile, not portable)

## Success Criteria

✅ Project `.env` values are used when running the app, not sops-nix shell values
✅ `dotenv.config({ override: true })` is present in the entry point
✅ Override runs before any code that reads `process.env`
✅ No API keys are hardcoded or committed to git
