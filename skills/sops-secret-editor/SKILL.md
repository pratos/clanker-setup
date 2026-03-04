---
name: sops-secret-editor
description: Allows pi or any agent to put secrets safely via sops.
---

# Sops Secret Editor

## Activation

**When this skill is triggered, ALWAYS display this banner first:**

```
╭─────────────────────────────────────────────────────────────╮
│  🔐 SKILL ACTIVATED: sops-secret-editor                     │
├─────────────────────────────────────────────────────────────┤
│  Action: Safely write encrypted secrets via sops            │
│  Output: Updated secrets file + redacted summary            │
╰─────────────────────────────────────────────────────────────╯
```

## When to Use

- "add secrets via sops"
- "update encrypted secrets"
- "sops set"
- "store credentials in sops"
- "put this secret in secrets.yaml"
- "add new api key in sops"

## Inputs to Collect

- Target secrets file path (default: `nixpkgs/secrets/secrets.yaml`)
- Age key file path (default: `~/.config/sops/age/keys.txt`)
- List of secrets to update (multiple allowed):
  - Key path (slash-separated, e.g., `fpl/email`)
  - Secret value (never echo back)
- Confirm **yolo mode** (apply all updates in one run without extra prompts)

## Workflow / How to Run

1) **Confirm defaults**
   - Secrets file: `nixpkgs/secrets/secrets.yaml`
   - Age key file: `~/.config/sops/age/keys.txt`

2) **Validate prerequisites**
   - Verify the secrets file exists.
   - Verify the age key file exists.
   - Set `SOPS_AGE_KEY_FILE` before running sops.

3) **Convert key paths to JSON indices**
   - `fpl/email` → `["fpl"]["email"]`
   - `aws/credentials` → `["aws"]["credentials"]`

4) **Apply updates (yolo mode)**
   - Use `nix run nixpkgs#sops -- set --value-stdin` for each secret.
   - Always JSON-encode values before passing to sops.
   - Run multiple updates in one session.

**Example (multi-secret, safe stdin + JSON encoding):**

```bash
set -euo pipefail
export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"
secrets_file="nixpkgs/secrets/secrets.yaml"

# Repeat per secret (no echo; JSON-encode via python)
read -s FPL_EMAIL
printf '%s' "$FPL_EMAIL" | python3 - <<'PY' | nix run nixpkgs#sops -- set --value-stdin "$secrets_file" '["fpl"]["email"]'
import json, sys
print(json.dumps(sys.stdin.read()))
PY

read -s FPL_PASSWORD
printf '%s' "$FPL_PASSWORD" | python3 - <<'PY' | nix run nixpkgs#sops -- set --value-stdin "$secrets_file" '["fpl"]["password"]'
import json, sys
print(json.dumps(sys.stdin.read()))
PY
```

5) **Report results (redacted)**
   - Summarize only the keys updated and the target file path.
   - Do **not** print or log secret values.

## Output Format

- Confirmation that the secrets file was updated.
- List of updated keys (paths only, no values).
- Any errors encountered (redact sensitive data).

## Safety Rules

- **Never** echo or log secret values.
- **Never** print decrypted files.
- **Always** use `--value-stdin` and JSON encoding.
- **Do not** store secrets in files, commits, or shell history.
- **Stop immediately** if sops cannot decrypt the file (missing age key).

## Success Criteria

- Requested keys are updated in `nixpkgs/secrets/secrets.yaml`.
- No secret values are exposed in output or logs.
- sops exits successfully for every update.
