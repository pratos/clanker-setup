#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SETTINGS="$HOME/.pi/agent/settings.json"
SKILLS_DIR="$HOME/.pi/agent/skills"

if [[ ! -f "$SETTINGS" ]]; then
  echo "Missing settings: $SETTINGS" >&2
  exit 1
fi

export ROOT SETTINGS SKILLS_DIR

python3 - <<'PY'
import json
import os
import pathlib

root = pathlib.Path(os.environ["ROOT"])
settings = pathlib.Path(os.environ["SETTINGS"])
skills_dir = pathlib.Path(os.environ["SKILLS_DIR"])

data = json.loads(settings.read_text())
packages = data.get("packages", [])

skills = []
if skills_dir.exists():
    for path in skills_dir.glob("*/SKILL.md"):
        skills.append(path.parent.name)
    for path in skills_dir.glob("*.md"):
        skills.append(path.stem)

packages_text = "# Pi packages/extensions to install\n" + "\n".join(packages)
if packages:
    packages_text += "\n"

skills_sorted = sorted(set(skills))
skills_text = "# Pi skills discovered under ~/.pi/agent/skills\n" + "\n".join(skills_sorted)
if skills_sorted:
    skills_text += "\n"

(root / "pi" / "extensions.txt").write_text(packages_text)
(root / "pi" / "skills.txt").write_text(skills_text)
PY

echo "Updated: $ROOT/pi/extensions.txt"
echo "Updated: $ROOT/pi/skills.txt"
