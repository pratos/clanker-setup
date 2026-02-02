---
name: uv-python-execution
description: Enforces using uv to run all Python scripts and ty for type checking. Includes inline script metadata (PEP 723) for one-time scripts with dependencies.
---

# UV Python Execution & Type Checking

## Activation

**When this skill is triggered, ALWAYS display this banner first:**

```
╭─────────────────────────────────────────────────────────────╮
│  🐍 SKILL ACTIVATED: uv-python-execution                    │
├─────────────────────────────────────────────────────────────┤
│  Mode: [Python Execution | Type Checking | Inline Script]   │
│  Action: Using uv/ty toolchain instead of direct invocation │
╰─────────────────────────────────────────────────────────────╯
```

Replace `[Mode]` with the detected trigger type.

## When to Use

This skill activates automatically whenever:

**Python Execution** - Pattern matching on:
- `python script.py`
- `python3 script.py`
- `python -m module`
- `python3 -m module`
- Any direct Python interpreter invocation

**One-Time Scripts** - Pattern matching on:
- "write a quick script"
- "make a standalone script"
- "one-off script"
- "throwaway script"
- Scripts needing packages not in the project

**Type Checking** - Pattern matching on:
- `pyright`
- `mypy`
- Any type checking operation

## Rules

**1. ALWAYS use `uv run` to execute Python scripts and modules.**

**2. ALWAYS use `ty` for type checking (not pyright or mypy directly).**

### Correct Usage - Python Execution

```bash
# Running a script
uv run python script.py

# Running a module
uv run python -m pytest tests/

# Running with arguments
uv run python train.py --epochs 100 --lr 1e-4

# Running inline Python
uv run python -c "import torch; print(torch.cuda.is_available())"
```

### Incorrect Usage - Python Execution (NEVER DO)

```bash
# Direct python invocation - WRONG
python script.py
python3 script.py
python -m pytest
./script.py  # if shebang points to python
```

### Correct Usage - Type Checking

```bash
# Check entire project
ty check

# Check specific file
ty check src/models/unet.py

# Check specific directory
ty check src/

# Check with specific options
ty check --warn-unreachable src/
```

### Incorrect Usage - Type Checking (NEVER DO)

```bash
# Using pyright directly - WRONG
pyright src/
uv run pyright src/

# Using mypy directly - WRONG
mypy src/
uv run mypy src/
```

## Why

### Python Execution with `uv run`

1. **Dependency isolation**: `uv run` ensures the script runs with the project's virtual environment and dependencies
2. **Reproducibility**: Uses the exact versions locked in `uv.lock`
3. **Consistency**: All team members run scripts the same way
4. **No activation needed**: Works without manually activating the venv

### Type Checking with `ty`

1. **Speed**: `ty` is extremely fast (written in Rust by Astral, same team as uv/ruff)
2. **Unified toolchain**: Part of the Astral ecosystem (uv, ruff, ty) for consistent tooling
3. **Project-aware**: Reads `pyproject.toml` configuration automatically
4. **Better defaults**: Sensible defaults for modern Python projects

## Exceptions

### Python Execution

1. **System Python checks**: `python3 --version` to check system Python (but prefer `uv run python --version`)
2. **Inside Docker/CI**: When explicitly running inside a container with pre-configured environment
3. **User explicitly requests**: If user says "use python directly" or "don't use uv"

### Type Checking

1. **CI/pre-commit already configured**: If CI uses pyright/mypy explicitly
2. **User explicitly requests**: If user says "use pyright" or "use mypy"
3. **Compatibility checks**: When verifying behavior matches pyright/mypy specifically

## Implementation

### Python Execution

When writing Bash commands that execute Python:

1. **Prefix with `uv run`**: Always add `uv run` before `python` or `python3`
2. **Check existing scripts**: If referencing a script in `scripts/`, verify it uses `uv run` in justfile tasks
3. **For new scripts**: Add corresponding justfile tasks that use `uv run`

### Type Checking

When checking types or fixing type errors:

1. **Use `ty check`**: Run `ty check` instead of pyright/mypy
2. **Target specific files**: Use `ty check path/to/file.py` for focused checking
3. **Iterative fixing**: Run `ty check`, fix errors, repeat until clean

## Examples

### Training a Model

```bash
# Correct
uv run python scripts/train.py --config config.yaml

# Also correct - using just task
just train
```

### Running Tests

```bash
# Correct
uv run pytest tests/ -v

# Also correct
just test
```

### Quick Python Check

```bash
# Correct
uv run python -c "import torch; print(torch.__version__)"
```

### Type Checking Before Fixing Code

```bash
# Check entire project for type errors
ty check

# Check specific module you're working on
ty check src/models/

# Check a specific file after making changes
ty check src/trainer/lightning_module.py
```

## One-Time Scripts (Inline Dependencies)

When the user asks for a quick standalone script with external dependencies, use **uv's inline script metadata** (PEP 723). This runs scripts with their own dependencies without polluting the project environment.

### When to Use

- "write a quick script to fetch data from an API"
- "make a one-off script to process this CSV"
- "create a standalone script that uses requests/pandas/etc."
- Any throwaway or utility script needing packages not in the project

### Inline Script Format

Add a special comment block at the top of the script:

```python
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "requests",
#     "rich",
# ]
# ///

import requests
from rich import print

response = requests.get("https://api.github.com")
print(response.json())
```

### Running Inline Scripts

```bash
# Run directly (uv auto-detects inline metadata)
uv run script.py

# Or make executable and run
chmod +x script.py
./script.py
```

### Examples

**Fetch and display JSON data:**
```python
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx", "rich"]
# ///

import httpx
from rich.console import Console
from rich.json import JSON

console = Console()
data = httpx.get("https://api.github.com/repos/astral-sh/uv").json()
console.print(JSON.from_data(data))
```

**Quick CSV processing:**
```python
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pandas", "tabulate"]
# ///

import pandas as pd

df = pd.read_csv("data.csv")
print(df.describe().to_markdown())
```

**Web scraping one-liner:**
```python
#!/usr/bin/env -S uv run --script
# /// script
# dependencies = ["beautifulsoup4", "requests"]
# ///

import requests
from bs4 import BeautifulSoup

soup = BeautifulSoup(requests.get("https://example.com").text, "html.parser")
print(soup.title.string)
```

### Key Points

1. **No project setup needed**: Dependencies are installed in an isolated cache
2. **Reproducible**: Specify exact versions if needed (`requests>=2.28,<3`)
3. **Self-contained**: Script documents its own requirements
4. **Fast**: uv caches dependencies, subsequent runs are instant

### When NOT to Use Inline Scripts

- Script will be used repeatedly by the team → Add to project dependencies
- Script is part of the main codebase → Use `uv run` with project deps
- Complex multi-file scripts → Create proper package structure

## Red Flags

❌ Using `python` or `python3` directly without `uv run`
❌ Activating venv manually before running (`.venv/bin/activate`)
❌ Using `pip install` instead of `uv add` or `uv pip install`
❌ Using `pyright` or `mypy` instead of `ty check`
❌ Running type checking with `uv run pyright` or `uv run mypy`
❌ Installing packages globally for one-time scripts (use inline metadata instead)

## Success Criteria

✅ All Python script executions use `uv run` prefix
✅ New scripts have corresponding justfile tasks
✅ Consistent execution environment across all runs
✅ All type checking uses `ty check`
✅ Type errors are checked before and after code changes
✅ One-time scripts use inline metadata (PEP 723) for dependencies
