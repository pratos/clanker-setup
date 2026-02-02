---
name: python-uv-setup
description: Sets up a modern Python project with uv, ruff, ty, and best practices for AI agent compatibility. Creates publishable packages with proper structure, type hints, and documentation.
---

# Python UV Project Setup

## Activation

**When this skill is triggered, ALWAYS display this banner first:**

```
╭─────────────────────────────────────────────────────────────╮
│  🐍 SKILL ACTIVATED: python-uv-setup                        │
├─────────────────────────────────────────────────────────────┤
│  Project: [project-name]                                    │
│  Action: Setting up modern Python project with uv...        │
│  Output: pyproject.toml, src layout, tests, CI              │
╰─────────────────────────────────────────────────────────────╯
```

## When to Use

This skill activates when:
- "set up a new Python project"
- "create a Python package"
- "initialize Python with uv"
- "modern Python setup"
- "migrate from conda/poetry/pip to uv"
- "convert requirements.txt to uv"
- Need a clean, agent-friendly Python project structure

## Quick Start

### Option 1: Use the bootstrap script (recommended)
```bash
# Create a library
bash .pi/skills/python-uv-setup/scripts/bootstrap.sh my-package

# Create an application
bash .pi/skills/python-uv-setup/scripts/bootstrap.sh my-cli --app
```

This creates a complete project with:
- src layout, tests, CI
- pyproject.toml with ruff, pytest, coverage config
- Type hints and py.typed marker
- Git initialized with first commit

### Option 2: Manual setup
```bash
# Create project directory
mkdir my-package && cd my-package

# Initialize with uv
uv init --lib --name my-package

# Or for an application (not a library)
uv init --app --name my-app
```

---

## Migrating Existing Projects

### Brown-field (existing codebase) policy

When the repo already contains Python code, **prioritize minimal change**. The goal is uv compliance without altering application behavior.

**Rules:**
- **Do not change application code** unless explicitly requested.
- **Do not move files** unless explicitly allowed by the user.
- **Preserve existing layout** (do not force a `src/` layout on brown-field repos).
- **Preserve declared Python support** (do not auto-bump to 3.12 if the project advertises 3.10+) **unless the user explicitly states a main version** (e.g., “Python 3.12 is the main”). In that case, set `.python-version` and `requires-python` to match the stated main version.

**Brown-field steps (minimal, best practice):**
1. Read `README.md`, `requirements*.txt`, `setup.cfg`/`setup.py`, `pyproject.toml`, and CI config to capture **name**, **version**, **Python version range**, and **dependencies**.
2. If no `pyproject.toml`, create one with `[project]` metadata (name, version, description, readme, license). **Reuse existing values** when available.
3. **Dependencies:** import from existing files and pin exact versions (use `uv pip compile` if needed). Preserve separation of runtime vs dev deps.
4. Add `.python-version` **matching the project’s supported Python** (do not bump without permission).
5. Add `.venv/` to `.gitignore` (keep existing ignore rules intact).
6. Generate `uv.lock` (via `uv lock` or `uv sync`) and commit it.
7. **Tooling configs (ruff/ty/pytest):** may be added, but keep them conservative and **do not enforce in CI** unless the user requests.
8. If CI exists, update it to use uv **only if requested**; otherwise leave CI untouched.

### Quick Migration Script

```bash
# Auto-detect and migrate (backs up existing files)
bash .pi/skills/python-uv-setup/scripts/migrate.sh

# Or specify source explicitly
bash .pi/skills/python-uv-setup/scripts/migrate.sh --from poetry
bash .pi/skills/python-uv-setup/scripts/migrate.sh --from conda
bash .pi/skills/python-uv-setup/scripts/migrate.sh --from requirements
```

The script will:
- Backup existing lock files and requirements
- Create/update pyproject.toml
- Import dependencies
- Run `uv sync`

---

### From requirements.txt

```bash
# 1. Initialize uv in existing project
uv init --bare  # Don't overwrite existing files

# 2. Import dependencies from requirements.txt
uv add $(cat requirements.txt | grep -v '^#' | grep -v '^-' | tr '\n' ' ')

# Or if you have pinned versions you want to preserve:
uv pip compile requirements.txt -o requirements.lock
uv add -r requirements.txt

# 3. Import dev dependencies if separate
uv add --dev -r requirements-dev.txt

# 4. Verify
uv sync
uv run python -c "import your_package"
```

**Manual alternative** - Add to pyproject.toml:
```toml
[project]
dependencies = [
    "requests>=2.28.0",
    "pandas>=2.0.0",
    # Copy from requirements.txt, adjust version specs
]
```

### From Poetry (pyproject.toml + poetry.lock)

```bash
# 1. uv can read Poetry's pyproject.toml directly!
# Just remove poetry-specific sections and add uv build system

# 2. Export poetry deps (optional, for reference)
poetry export -f requirements.txt > requirements-poetry.txt

# 3. Update pyproject.toml - replace Poetry sections:
```

**Before (Poetry):**
```toml
[tool.poetry]
name = "my-package"
version = "0.1.0"

[tool.poetry.dependencies]
python = "^3.11"
requests = "^2.28"

[tool.poetry.group.dev.dependencies]
pytest = "^8.0"

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"
```

**After (uv):**
```toml
[project]
name = "my-package"
version = "0.1.0"
requires-python = "==3.12.*"
dependencies = [
    "requests==2.32.3",
]

[project.optional-dependencies]
dev = [
    "pytest==8.3.5",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

```bash
# 4. Remove poetry files and sync
rm poetry.lock
uv sync --all-extras
```

### From Conda (environment.yml)

```bash
# 1. Export conda environment to requirements format
conda list --export > conda-packages.txt

# Or from environment.yml, extract pip dependencies:
grep -A 1000 "pip:" environment.yml | grep "^    -" | sed 's/^    - //' > pip-deps.txt

# 2. Initialize uv
uv init --bare

# 3. Add Python-only packages (skip conda-specific like cudatoolkit)
# Review and add manually to pyproject.toml or:
uv add requests pandas numpy  # etc.

# 4. For conda-only packages (CUDA, MKL, etc.)
# Keep a minimal conda env OR use system packages
```

**Hybrid approach** (conda for CUDA + uv for Python):
```bash
# Create minimal conda env for CUDA only
conda create -n myenv python=3.12 cudatoolkit=12.1 -y
conda activate myenv

# Use uv for all Python packages
uv sync
```

### From pip + venv (no pyproject.toml)

```bash
# 1. Freeze current environment
pip freeze > requirements-frozen.txt

# 2. Initialize uv with project metadata
uv init --bare

# 3. Edit pyproject.toml with your project info
# Add dependencies (clean up pinned versions if desired)

# 4. Import dependencies
uv add requests pandas  # Add your main deps
uv add --dev pytest ruff  # Add dev deps

# 5. Remove old venv, let uv manage it
rm -rf venv .venv
uv sync --all-extras
```

### From setup.py / setup.cfg

```bash
# 1. Convert setup.py to pyproject.toml
# Use the hatch migration tool or manual conversion:

# If you have setup.cfg, it maps closely to pyproject.toml:
```

**setup.cfg:**
```ini
[metadata]
name = my-package
version = 0.1.0

[options]
packages = find:
install_requires =
    requests>=2.28
    pandas>=2.0
```

**pyproject.toml:**
```toml
[project]
name = "my-package"
version = "0.1.0"
requires-python = "==3.12.*"
dependencies = [
    "requests==2.32.3",
    "pandas==2.2.3",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

```bash
# 2. Remove old files
rm setup.py setup.cfg MANIFEST.in

# 3. Sync
uv sync
```

### Migration Checklist

- [ ] Backup existing lock files (poetry.lock, Pipfile.lock, conda-lock.yml)
- [ ] Note Python version requirement
- [ ] List all dependencies (runtime + dev + optional)
- [ ] Check for conda-only packages (CUDA, MKL) - may need hybrid approach
- [ ] Create pyproject.toml with [project] section
- [ ] Add [build-system] with hatchling
- [ ] Run `uv sync --all-extras`
- [ ] Run tests to verify: `uv run pytest`
- [ ] Update CI/CD workflows to use uv
- [ ] Update README with new install instructions
- [ ] Remove old files: requirements*.txt, setup.py, setup.cfg, poetry.lock, Pipfile*
- [ ] Commit uv.lock to version control

## Project Structure (src layout)

**Note:** Use this structure for new/green-field projects. For brown-field repos, keep the existing layout unless the user explicitly asks to reorganize.

```
my-package/
├── .github/
│   └── workflows/
│       └── ci.yml              # GitHub Actions CI
├── src/
│   └── my_package/             # Package code (underscore, not hyphen)
│       ├── __init__.py         # Package exports
│       ├── py.typed            # PEP 561 marker for type hints
│       ├── core.py             # Core functionality
│       └── cli.py              # CLI entry point (optional)
├── tests/
│   ├── __init__.py
│   ├── conftest.py             # pytest fixtures
│   └── test_core.py
├── docs/
│   └── README.md               # Detailed documentation
├── .gitignore
├── .python-version             # Pin Python version for uv
├── pyproject.toml              # Project configuration (single source of truth)
├── README.md                   # Project overview
├── LICENSE                     # MIT recommended
└── uv.lock                     # Lockfile (commit this!)
```

## pyproject.toml (Complete Template)

```toml
[project]
name = "my-package"
version = "0.1.0"
description = "A short description of your package"
readme = "README.md"
license = { text = "MIT" }
requires-python = "==3.12.*"
authors = [
    { name = "Your Name", email = "you@example.com" }
]
keywords = ["keyword1", "keyword2"]
classifiers = [
    "Development Status :: 3 - Alpha",
    "Intended Audience :: Developers",
    "License :: OSI Approved :: MIT License",
    "Programming Language :: Python :: 3",
    "Programming Language :: Python :: 3.12",
    "Typing :: Typed",
]
dependencies = [
    # Runtime dependencies
]

[project.optional-dependencies]
dev = [
    "pytest==8.3.5",
    "pytest-cov==6.0.0",
    "ruff==0.9.4",
]

[project.scripts]
# CLI entry points
my-cli = "my_package.cli:main"

[project.urls]
Homepage = "https://github.com/username/my-package"
Documentation = "https://github.com/username/my-package#readme"
Repository = "https://github.com/username/my-package"
Issues = "https://github.com/username/my-package/issues"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/my_package"]

# ============================================================
# Ruff - Fast linter and formatter (replaces black, isort, flake8)
# ============================================================
[tool.ruff]
target-version = "py311"
line-length = 88
src = ["src", "tests"]

[tool.ruff.lint]
select = [
    "E",      # pycodestyle errors
    "W",      # pycodestyle warnings
    "F",      # pyflakes
    "I",      # isort
    "B",      # flake8-bugbear
    "C4",     # flake8-comprehensions
    "UP",     # pyupgrade
    "ARG",    # flake8-unused-arguments
    "SIM",    # flake8-simplify
    "TCH",    # flake8-type-checking
    "PTH",    # flake8-use-pathlib
    "ERA",    # eradicate (commented out code)
    "RUF",    # ruff-specific rules
]
ignore = [
    "E501",   # line too long (formatter handles this)
]

[tool.ruff.lint.isort]
known-first-party = ["my_package"]

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
docstring-code-format = true

# ============================================================
# Pytest
# ============================================================
[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["src"]
addopts = [
    "-ra",
    "--strict-markers",
    "--strict-config",
]

# ============================================================
# Coverage
# ============================================================
[tool.coverage.run]
source = ["src"]
branch = true

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "if TYPE_CHECKING:",
    "if __name__ == .__main__.:",
    "raise NotImplementedError",
]
```

## Essential Files

### src/my_package/__init__.py
```python
"""My Package - A short description."""

from my_package.core import main_function

__version__ = "0.1.0"
__all__ = ["main_function", "__version__"]
```

### src/my_package/py.typed
```
# PEP 561 marker - this package supports type checking
```
(Empty file, just needs to exist)

### src/my_package/core.py
```python
"""Core functionality for my-package."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Sequence


def main_function(items: Sequence[str]) -> list[str]:
    """Process items and return results.
    
    Args:
        items: Input items to process.
        
    Returns:
        Processed items as a list.
        
    Example:
        >>> main_function(["a", "b", "c"])
        ['A', 'B', 'C']
    """
    return [item.upper() for item in items]
```

### tests/conftest.py
```python
"""Pytest configuration and fixtures."""

import pytest


@pytest.fixture
def sample_data() -> list[str]:
    """Provide sample test data."""
    return ["apple", "banana", "cherry"]
```

### tests/test_core.py
```python
"""Tests for core functionality."""

from my_package.core import main_function


def test_main_function(sample_data: list[str]) -> None:
    """Test main_function processes items correctly."""
    result = main_function(sample_data)
    assert result == ["APPLE", "BANANA", "CHERRY"]


def test_main_function_empty() -> None:
    """Test main_function handles empty input."""
    assert main_function([]) == []
```

### .python-version
```
3.12
```
**New projects:** pin to 3.12 for consistency.
**Brown-field:** match the project's existing supported Python version **unless the user explicitly names a main version**, in which case use that.

### .gitignore
```gitignore
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
*.egg-info/
*.egg
dist/
build/

# Virtual environments
.venv/
venv/
ENV/

# Testing
.pytest_cache/
.coverage
htmlcov/
.tox/

# Type checking
.mypy_cache/

# IDEs
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Project specific
*.log
```

### .github/workflows/ci.yml
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v4
        with:
          enable-cache: true

      - name: Set up Python 3.12
        run: uv python install 3.12

      - name: Install dependencies
        run: uv sync --all-extras

      - name: Lint with ruff
        run: |
          uv run ruff check .
          uv run ruff format --check .

      - name: Type check with ty
        run: uv run ty check src/

      - name: Test with pytest
        run: uv run pytest --cov --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          file: ./coverage.xml
```

## Commands Reference

### Daily Development
```bash
# Install dependencies (creates .venv automatically)
uv sync

# Install with dev dependencies
uv sync --all-extras

# Run your code
uv run python -m my_package
uv run my-cli  # if CLI entry point defined

# Run tests
uv run pytest
uv run pytest -v --cov

# Lint and format
uv run ruff check .
uv run ruff check . --fix      # Auto-fix issues
uv run ruff format .

# Type check
ty check src/
```

### Dependency Management
```bash
# Add a dependency
uv add requests

# Add dev dependency
uv add --dev pytest-xdist

# Remove a dependency
uv remove requests

# Update all dependencies
uv lock --upgrade

# Update specific dependency
uv lock --upgrade-package requests
```

### Building and Publishing
```bash
# Build package
uv build

# Publish to PyPI
uv publish

# Publish to TestPyPI first
uv publish --publish-url https://test.pypi.org/legacy/
```

## Version Pinning (Strict)

**Always pin exact versions** - no `>=`, `>`, `^`, or `~`:

```toml
# ✅ Good - Exact versions
dependencies = [
    "requests==2.32.3",
    "pandas==2.2.3",
    "numpy==2.2.2",
]

# ❌ Bad - Version ranges
dependencies = [
    "requests>=2.28",
    "pandas^2.0",
    "numpy~=2.0",
]
```

**Why exact versions:**
- Reproducible builds across all environments
- No surprise breakages from upstream updates
- Easier debugging (everyone has same versions)
- AI agents can rely on specific API behavior

**To get current versions:**
```bash
# Check latest version of a package
uv pip show requests | grep Version

# Or install and check what was resolved
uv add requests
cat uv.lock | grep -A2 '"requests"'
```

**Python version:**
```
# .python-version - new projects: 3.12; brown-field: match existing
3.12
```

```toml
# pyproject.toml - new projects: pin to 3.12.x; brown-field: preserve existing range
requires-python = "==3.12.*"
```

---

## Agent-Friendly Best Practices

### 1. Type Everything
```python
# ✅ Good - AI agents can understand types
def process(data: dict[str, int]) -> list[tuple[str, int]]:
    return [(k, v) for k, v in data.items()]

# ❌ Bad - No type information
def process(data):
    return [(k, v) for k, v in data.items()]
```

### 2. Docstrings with Examples
```python
def calculate_discount(price: float, percent: float) -> float:
    """Calculate discounted price.
    
    Args:
        price: Original price in dollars.
        percent: Discount percentage (0-100).
        
    Returns:
        Discounted price.
        
    Raises:
        ValueError: If percent is not between 0 and 100.
        
    Example:
        >>> calculate_discount(100.0, 20.0)
        80.0
    """
```

### 3. Explicit Exports
```python
# __init__.py - Be explicit about public API
__all__ = [
    "MainClass",
    "helper_function",
    "CONSTANT",
]
```

### 4. Structured Errors
```python
class MyPackageError(Exception):
    """Base exception for my-package."""

class ValidationError(MyPackageError):
    """Raised when validation fails."""
    
    def __init__(self, field: str, message: str) -> None:
        self.field = field
        self.message = message
        super().__init__(f"{field}: {message}")
```

### 5. Configuration via Pydantic (optional)
```bash
uv add pydantic pydantic-settings
```

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    api_key: str
    debug: bool = False
    max_retries: int = 3
    
    model_config = {"env_prefix": "MY_PACKAGE_"}
```

## Checklist

- [ ] `uv init --lib --name package-name`
- [ ] Create `src/package_name/` directory structure
- [ ] Add `py.typed` marker file
- [ ] Configure `pyproject.toml` with all tools
- [ ] Add type hints to all functions
- [ ] Write docstrings with examples
- [ ] Set up tests with pytest
- [ ] Create `.github/workflows/ci.yml`
- [ ] Add `.gitignore` and `.python-version`
- [ ] Initialize git and make first commit
- [ ] Run `uv sync --all-extras` to verify setup
- [ ] Run `uv run pytest` to verify tests work
- [ ] Run `uv run ruff check .` to verify linting
- [ ] Run `ty check src/` to verify types
