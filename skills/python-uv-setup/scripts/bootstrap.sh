#!/usr/bin/env bash
set -euo pipefail

# Bootstrap a modern Python project with uv
# Usage: ./bootstrap.sh <package-name> [--app]
#
# Examples:
#   ./bootstrap.sh my-awesome-lib        # Create a library
#   ./bootstrap.sh my-cli-tool --app     # Create an application

if [ $# -lt 1 ]; then
    echo "Usage: $0 <package-name> [--app]"
    echo ""
    echo "Examples:"
    echo "  $0 my-awesome-lib        # Create a library"
    echo "  $0 my-cli-tool --app     # Create an application"
    exit 1
fi

PACKAGE_NAME="$1"
PACKAGE_DIR="${PACKAGE_NAME//-/_}"  # Convert hyphens to underscores
IS_APP="${2:-}"

echo "╭─────────────────────────────────────────────────────────────╮"
echo "│  🐍 Bootstrapping Python project: $PACKAGE_NAME"
echo "╰─────────────────────────────────────────────────────────────╯"
echo ""

# Check if uv is installed
if ! command -v uv >/dev/null 2>&1; then
    echo "❌ uv is not installed. Install with:"
    echo "   curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

# Create directory
if [ -d "$PACKAGE_NAME" ]; then
    echo "❌ Directory '$PACKAGE_NAME' already exists"
    exit 1
fi

mkdir -p "$PACKAGE_NAME"
cd "$PACKAGE_NAME"

echo "📦 Initializing uv project..."
if [ "$IS_APP" = "--app" ]; then
    uv init --app --name "$PACKAGE_NAME"
else
    uv init --lib --name "$PACKAGE_NAME"
fi

# Create src layout (uv init creates flat layout by default)
echo "📁 Creating src layout..."
mkdir -p "src/$PACKAGE_DIR"
mkdir -p tests
mkdir -p docs
mkdir -p .github/workflows

# Move any generated files to src layout
if [ -f "$PACKAGE_DIR.py" ]; then
    mv "$PACKAGE_DIR.py" "src/$PACKAGE_DIR/core.py"
fi

# Create __init__.py
cat > "src/$PACKAGE_DIR/__init__.py" << EOF
"""$PACKAGE_NAME - A Python package."""

__version__ = "0.1.0"
__all__ = ["__version__"]
EOF

# Create py.typed marker
touch "src/$PACKAGE_DIR/py.typed"

# Create core.py if not exists
if [ ! -f "src/$PACKAGE_DIR/core.py" ]; then
    cat > "src/$PACKAGE_DIR/core.py" << 'EOF'
"""Core functionality."""

from __future__ import annotations


def hello(name: str = "World") -> str:
    """Return a greeting.
    
    Args:
        name: Name to greet.
        
    Returns:
        Greeting string.
        
    Example:
        >>> hello("Python")
        'Hello, Python!'
    """
    return f"Hello, {name}!"
EOF
fi

# Create tests
cat > "tests/__init__.py" << 'EOF'
"""Test suite."""
EOF

cat > "tests/conftest.py" << 'EOF'
"""Pytest configuration and fixtures."""

import pytest


@pytest.fixture
def sample_name() -> str:
    """Provide a sample name for testing."""
    return "Test"
EOF

cat > "tests/test_core.py" << EOF
"""Tests for core functionality."""

from $PACKAGE_DIR.core import hello


def test_hello_default() -> None:
    """Test hello with default argument."""
    assert hello() == "Hello, World!"


def test_hello_with_name(sample_name: str) -> None:
    """Test hello with a name."""
    assert hello(sample_name) == "Hello, Test!"
EOF

# Create .python-version (always 3.12)
echo "3.12" > .python-version

# Create .gitignore
cat > .gitignore << 'EOF'
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

# Testing
.pytest_cache/
.coverage
htmlcov/

# Type checking
.mypy_cache/

# IDEs
.idea/
.vscode/
*.swp

# OS
.DS_Store

# Logs
*.log
EOF

# Create GitHub Actions CI
cat > .github/workflows/ci.yml << 'EOF'
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

      - name: Lint
        run: |
          uv run ruff check .
          uv run ruff format --check .

      - name: Test
        run: uv run pytest --cov
EOF

# Update pyproject.toml with full configuration
cat > pyproject.toml << EOF
[project]
name = "$PACKAGE_NAME"
version = "0.1.0"
description = "A Python package"
readme = "README.md"
license = { text = "MIT" }
requires-python = "==3.12.*"
authors = [
    { name = "Your Name", email = "you@example.com" }
]
classifiers = [
    "Development Status :: 3 - Alpha",
    "Intended Audience :: Developers",
    "License :: OSI Approved :: MIT License",
    "Programming Language :: Python :: 3",
    "Programming Language :: Python :: 3.12",
    "Typing :: Typed",
]
dependencies = []

[project.optional-dependencies]
dev = [
    "pytest==8.3.5",
    "pytest-cov==6.0.0",
    "ruff==0.9.4",
]

[project.urls]
Homepage = "https://github.com/username/$PACKAGE_NAME"
Repository = "https://github.com/username/$PACKAGE_NAME"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/$PACKAGE_DIR"]

[tool.ruff]
target-version = "py311"
line-length = 88
src = ["src", "tests"]

[tool.ruff.lint]
select = ["E", "W", "F", "I", "B", "C4", "UP", "ARG", "SIM", "TCH", "PTH", "RUF"]
ignore = ["E501"]

[tool.ruff.lint.isort]
known-first-party = ["$PACKAGE_DIR"]

[tool.ruff.format]
quote-style = "double"
docstring-code-format = true

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["src"]
addopts = ["-ra", "--strict-markers", "--strict-config"]

[tool.coverage.run]
source = ["src"]
branch = true
EOF

# Create README
cat > README.md << EOF
# $PACKAGE_NAME

A Python package.

## Installation

\`\`\`bash
pip install $PACKAGE_NAME
\`\`\`

## Development

\`\`\`bash
# Clone the repository
git clone https://github.com/username/$PACKAGE_NAME.git
cd $PACKAGE_NAME

# Install dependencies
uv sync --all-extras

# Run tests
uv run pytest

# Lint
uv run ruff check .
uv run ruff format .
\`\`\`

## License

MIT
EOF

# Create LICENSE
cat > LICENSE << 'EOF'
MIT License

Copyright (c) 2024

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
EOF

# Install dependencies
echo ""
echo "📥 Installing dependencies..."
uv sync --all-extras

# Initialize git
echo ""
echo "🔧 Initializing git..."
git init -q
git add .
git commit -q -m "(feat) initial project setup with uv"

# Run checks
echo ""
echo "✅ Running verification..."
uv run ruff check . || true
uv run pytest -q || true

echo ""
echo "╭─────────────────────────────────────────────────────────────╮"
echo "│  ✅ Project created successfully!                          │"
echo "├─────────────────────────────────────────────────────────────┤"
echo "│  cd $PACKAGE_NAME"
echo "│  uv run pytest           # Run tests"
echo "│  uv run ruff check .     # Lint code"
echo "│  uv run ruff format .    # Format code"
echo "╰─────────────────────────────────────────────────────────────╯"
