#!/usr/bin/env bash
set -euo pipefail

# Understand git repository structure - show directory trees and file counts
# Usage: ./understand_git_structure.sh [dir1] [dir2] ...
#        Without arguments: shows full overview with default directories (apps, lib, test, assets)
#        With arguments: shows only specified directories
# Dependencies: git (standard in dev environment), tree (for directory visualization)

# Check if tree command is available
if ! command -v tree >/dev/null 2>&1; then
    echo "Error: 'tree' command is required but not installed." >&2
    echo "Please install it with: brew install tree" >&2
    exit 1
fi

# Store git ls-tree output to avoid multiple calls
ALL_FILES=$(git ls-tree -r HEAD --name-only)

# Parse command line arguments
SPECIFIED_DIRS=("$@")

# If specific directories are requested, show only those
if [ ${#SPECIFIED_DIRS[@]} -gt 0 ]; then
    echo "=== DIRECTORY STRUCTURE ANALYSIS ==="
    echo
    
    # Function to show tree for a directory
    show_tree() {
        local dir=$1
        local title=$2
        echo
        echo "📁 $title FULL TREE (directories and files):"
        echo "----------------------"
        if echo "$ALL_FILES" | grep -q "^$dir/"; then
            echo "$ALL_FILES" | grep "^$dir/" | sed "s|^$dir/||" | tree --fromfile --noreport
            echo
            local file_count=$(echo "$ALL_FILES" | grep "^$dir/" | wc -l | tr -d ' ')
            echo "Total files in $dir/: $file_count"
        else
            echo "Directory '$dir' not found in repository"
        fi
    }
    
    # Show each specified directory
    for dir in "${SPECIFIED_DIRS[@]}"; do
        # Remove trailing slash if present
        dir="${dir%/}"
        show_tree "$dir" "./$dir"
    done
    
    exit 0
fi

# Default behavior - show full overview
echo "=== CODEBASE OVERVIEW ==="
echo

# Get all top-level directories from git
dirs=$(echo "$ALL_FILES" | grep '/' | sed 's|/.*||' | sort -u)

# Count files in each top-level directory
echo "📁 TOP-LEVEL DIRECTORIES:"
echo "------------------------"
for dir in $dirs; do
  count=$(echo "$ALL_FILES" | grep "^$dir/" | wc -l | tr -d ' ')
  printf "%-20s %5d files\n" "$dir/" "$count"
done

echo
echo "📄 TOP-LEVEL FILES:"
echo "------------------"
# List all files in root (excluding directories)
root_files=$(echo "$ALL_FILES" | grep '^[^/]*$')
if [ -n "$root_files" ]; then
  echo "$root_files"
else
  echo "(no files in root)"
fi

# Function to show tree for a directory
show_tree() {
  local dir=$1
  local title=$2
  echo
  echo "📁 $title DIRECTORY TREE:"
  echo "----------------------"
  echo "$ALL_FILES" | grep "^$dir/" | sed "s|^$dir/||" | tree --fromfile --noreport -d
}

# Show tree structure for important directories
show_tree "apps" "./apps"
show_tree "lib" "./lib"
show_tree "test" "./test"
show_tree "assets" "./assets"

echo
echo "📊 SUMMARY:"
echo "-----------"
total_files=$(echo "$ALL_FILES" | wc -l | tr -d ' ')
root_count=$(echo "$ALL_FILES" | grep '^[^/]*$' | wc -l | tr -d ' ')
dir_count=$(echo "$dirs" | wc -l | tr -d ' ')
apps_count=$(echo "$ALL_FILES" | grep '^apps/' | wc -l | tr -d ' ')
lib_count=$(echo "$ALL_FILES" | grep '^lib/' | wc -l | tr -d ' ')
test_count=$(echo "$ALL_FILES" | grep '^test/' | wc -l | tr -d ' ')

echo "Total files:        $total_files"
echo "Root files:         $root_count"
echo "Directories:        $dir_count"
echo ""
echo "Key areas:"
echo "  apps/:            $apps_count files"
echo "  lib/:             $lib_count files"
echo "  test/:            $test_count files"
