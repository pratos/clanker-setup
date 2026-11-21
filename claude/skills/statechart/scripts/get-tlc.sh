#!/bin/sh
# Fetch TLC without mise, with the checksum run.ts pins, and print the path. Use: export TLA2TOOLS=$(get-tlc.sh)
set -e
dir="$HOME/.cache/claude-skills-deps/tlc"; jar="$dir/tla2tools.jar"; mkdir -p "$dir"
sum=$(grep -o 'sha256:[0-9a-f]*' "$(dirname "$0")/run.ts" | head -1 | cut -d: -f2)
[ -f "$jar" ] || curl -sL -o "$jar" https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar
[ "$(shasum -a 256 "$jar" | cut -d' ' -f1)" = "$sum" ] || { rm -f "$jar"; echo "tla2tools.jar failed its checksum" >&2; exit 1; }
echo "$jar"
