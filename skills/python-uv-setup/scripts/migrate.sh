#!/usr/bin/env bash
set -euo pipefail

# Migrate existing Python project to uv
# Usage: ./migrate.sh [--from poetry|conda|pip|requirements]
#
# Auto-detects source if not specified

echo "╭─────────────────────────────────────────────────────────────╮"
echo "│  🔄 Migrating Python project to uv                         │"
echo "╰─────────────────────────────────────────────────────────────╯"
echo ""

# Check if uv is installed
if ! command -v uv >/dev/null 2>&1; then
    echo "❌ uv is not installed. Install with:"
    echo "   curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

# Detect source
SOURCE="${1:-auto}"

if [ "$SOURCE" = "auto" ] || [ "$SOURCE" = "--from" ]; then
    if [ "$SOURCE" = "--from" ]; then
        SOURCE="${2:-auto}"
    fi
    
    if [ "$SOURCE" = "auto" ]; then
        if [ -f "poetry.lock" ] || grep -q "tool.poetry" pyproject.toml 2>/dev/null; then
            SOURCE="poetry"
        elif [ -f "environment.yml" ] || [ -f "environment.yaml" ]; then
            SOURCE="conda"
        elif [ -f "Pipfile" ]; then
            SOURCE="pipenv"
        elif [ -f "requirements.txt" ]; then
            SOURCE="requirements"
        elif [ -f "setup.py" ] || [ -f "setup.cfg" ]; then
            SOURCE="setuptools"
        else
            SOURCE="none"
        fi
    fi
fi

echo "📦 Detected source: $SOURCE"
echo ""

# Backup existing files
backup_files() {
    local backup_dir=".uv-migration-backup"
    mkdir -p "$backup_dir"
    
    for f in poetry.lock Pipfile Pipfile.lock requirements*.txt setup.py setup.cfg environment.yml environment.yaml; do
        if [ -f "$f" ]; then
            cp "$f" "$backup_dir/"
            echo "   📋 Backed up: $f"
        fi
    done
    echo "   Backups saved to $backup_dir/"
}

echo "💾 Backing up existing files..."
backup_files
echo ""

case "$SOURCE" in
    poetry)
        echo "🎭 Migrating from Poetry..."
        
        # Export requirements for reference
        if command -v poetry >/dev/null 2>&1; then
            poetry export -f requirements.txt --without-hashes > .uv-migration-backup/requirements-from-poetry.txt 2>/dev/null || true
        fi
        
        # Check if pyproject.toml already has [project] section
        if grep -q "^\[project\]" pyproject.toml 2>/dev/null; then
            echo "   ✓ pyproject.toml already has [project] section"
        else
            echo "   ⚠️  Need to convert [tool.poetry] to [project] section"
            echo "   Please manually update pyproject.toml (see skill docs)"
        fi
        
        # Remove poetry.lock
        if [ -f "poetry.lock" ]; then
            rm poetry.lock
            echo "   🗑️  Removed poetry.lock"
        fi
        ;;
        
    conda)
        echo "🐍 Migrating from Conda..."
        
        ENV_FILE="environment.yml"
        [ -f "environment.yaml" ] && ENV_FILE="environment.yaml"
        
        # Extract pip dependencies
        if [ -f "$ENV_FILE" ]; then
            echo "   Extracting pip dependencies from $ENV_FILE..."
            grep -A 1000 "pip:" "$ENV_FILE" 2>/dev/null | grep "^    -" | sed 's/^    - //' > .uv-migration-backup/pip-deps.txt || true
            
            # Extract conda packages (for reference)
            grep "^  - " "$ENV_FILE" | grep -v "pip:" | sed 's/^  - //' > .uv-migration-backup/conda-deps.txt || true
            
            echo "   ⚠️  Review .uv-migration-backup/conda-deps.txt for conda-only packages"
            echo "   (CUDA, MKL, etc. may need system install or hybrid approach)"
        fi
        
        # Initialize if no pyproject.toml
        if [ ! -f "pyproject.toml" ]; then
            uv init --bare
            echo "   ✓ Created pyproject.toml"
        fi
        ;;
        
    requirements|pip)
        echo "📄 Migrating from requirements.txt..."
        
        # Initialize if no pyproject.toml
        if [ ! -f "pyproject.toml" ]; then
            uv init --bare
            echo "   ✓ Created pyproject.toml"
        fi
        
        # Try to add dependencies
        if [ -f "requirements.txt" ]; then
            echo "   Adding dependencies from requirements.txt..."
            
            # Clean requirements (remove comments, -e, -r, etc.)
            grep -v '^#' requirements.txt | grep -v '^-' | grep -v '^\s*$' > .uv-migration-backup/clean-requirements.txt || true
            
            if [ -s .uv-migration-backup/clean-requirements.txt ]; then
                # Add packages one by one to handle failures gracefully
                while IFS= read -r pkg; do
                    # Extract package name (before ==, >=, etc.)
                    pkg_name=$(echo "$pkg" | sed 's/[<>=!].*//' | tr -d '[:space:]')
                    if [ -n "$pkg_name" ]; then
                        uv add "$pkg_name" 2>/dev/null || echo "   ⚠️  Could not add: $pkg_name"
                    fi
                done < .uv-migration-backup/clean-requirements.txt
            fi
        fi
        
        # Handle dev requirements
        for dev_file in requirements-dev.txt requirements_dev.txt dev-requirements.txt test-requirements.txt; do
            if [ -f "$dev_file" ]; then
                echo "   Adding dev dependencies from $dev_file..."
                grep -v '^#' "$dev_file" | grep -v '^-' | grep -v '^\s*$' | while IFS= read -r pkg; do
                    pkg_name=$(echo "$pkg" | sed 's/[<>=!].*//' | tr -d '[:space:]')
                    if [ -n "$pkg_name" ]; then
                        uv add --dev "$pkg_name" 2>/dev/null || echo "   ⚠️  Could not add dev: $pkg_name"
                    fi
                done
            fi
        done
        ;;
        
    setuptools)
        echo "🔧 Migrating from setup.py/setup.cfg..."
        echo "   ⚠️  Manual conversion required"
        echo "   Convert install_requires from setup.py/setup.cfg to pyproject.toml [project] dependencies"
        
        if [ ! -f "pyproject.toml" ]; then
            uv init --bare
            echo "   ✓ Created pyproject.toml skeleton"
        fi
        ;;
        
    pipenv)
        echo "📦 Migrating from Pipenv..."
        
        if command -v pipenv >/dev/null 2>&1; then
            pipenv requirements > .uv-migration-backup/requirements-from-pipenv.txt 2>/dev/null || true
            pipenv requirements --dev > .uv-migration-backup/requirements-dev-from-pipenv.txt 2>/dev/null || true
        fi
        
        if [ ! -f "pyproject.toml" ]; then
            uv init --bare
            echo "   ✓ Created pyproject.toml"
        fi
        
        echo "   Review .uv-migration-backup/requirements-from-pipenv.txt and add to pyproject.toml"
        ;;
        
    none)
        echo "🆕 No existing package manager detected"
        if [ ! -f "pyproject.toml" ]; then
            uv init --bare
            echo "   ✓ Created pyproject.toml"
        fi
        ;;
        
    *)
        echo "❌ Unknown source: $SOURCE"
        echo "   Supported: poetry, conda, requirements, pip, setuptools, pipenv"
        exit 1
        ;;
esac

echo ""

# Ensure build-system is set
if ! grep -q "build-system" pyproject.toml 2>/dev/null; then
    echo "📝 Adding build-system to pyproject.toml..."
    cat >> pyproject.toml << 'EOF'

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
EOF
fi

# Add common dev dependencies if not present
echo "🔧 Ensuring dev dependencies..."
uv add --dev pytest ruff 2>/dev/null || true

# Sync
echo ""
echo "📥 Syncing dependencies..."
uv sync --all-extras || {
    echo "⚠️  Sync failed. You may need to manually fix pyproject.toml"
    exit 1
}

# Create .python-version (always 3.12)
echo "3.12" > .python-version
echo "✓ Created .python-version (3.12)"

# Ensure requires-python is set to 3.12
if grep -q "requires-python" pyproject.toml 2>/dev/null; then
    # Update existing requires-python to exact 3.12
    sed -i.bak 's/requires-python = "[^"]*"/requires-python = "==3.12.*"/' pyproject.toml
    rm -f pyproject.toml.bak
else
    # Add requires-python after [project]
    sed -i.bak '/^\[project\]/a\
requires-python = "==3.12.*"
' pyproject.toml
    rm -f pyproject.toml.bak
fi

# Pin all dependencies to exact versions
echo ""
echo "📌 Pinning dependencies to exact versions..."
echo "   Review pyproject.toml and replace >= with == for all deps"
echo "   Example: 'requests>=2.28' → 'requests==2.32.3'"
echo ""
echo "   To get current resolved versions:"
echo "   uv pip freeze"

echo ""
echo "╭─────────────────────────────────────────────────────────────╮"
echo "│  ✅ Migration complete!                                     │"
echo "├─────────────────────────────────────────────────────────────┤"
echo "│  Next steps:                                                │"
echo "│  1. Pin all deps to exact versions (== not >=)              │"
echo "│  2. Run: uv run pytest  (verify tests work)                 │"
echo "│  3. Update CI/CD to use uv (Python 3.12 only)               │"
echo "│  4. Remove old files when ready:                            │"
echo "│     rm requirements*.txt setup.py setup.cfg Pipfile*        │"
echo "│  5. Commit uv.lock to version control                       │"
echo "╰─────────────────────────────────────────────────────────────╯"
