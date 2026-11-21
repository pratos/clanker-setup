#!/usr/bin/env bash
# Fails when domain code and the domain vocabulary disagree:
#   - a command or event declared in code that no entry lists;
#   - a command whose verb is not on the `## Verbs` line (Sign up → SignUp);
#   - a banned synonym used as a domain identifier: a command/event name, a field of its schema, or an exported name.
#     A `Not:` term is split on commas only and kept whole, so "comment chain" matches commentChain, CommentChain and
#     comment_chain, never "chain" alone. A `(was: …)` note after a term is ignored.
# Bans are scoped: a context's `Paths:` line (path prefixes) says where its `Not:` terms hold. A context without
# `Paths:` is global: its terms hold in every domain file.
# Notes, not failures: commands/events an entry lists that no code declares yet, and `Carried by` schemas that
# packages/schema does not export.
# Scope: packages/domain and packages/schema. Tests, *.d.ts, generated files and the kernel are out.
# usage: check-domain-vocabulary.sh docs/DOMAIN-VOCABULARY.md packages [apps …]
set -euo pipefail
# perl balances the braces of a schema; without it the field check would pass silently, so stop instead.
command -v perl >/dev/null || { echo "✗ perl is required (nix develop has it)"; exit 2; }
vocab="${1:?domain vocabulary path}"; shift
[ -f "$vocab" ] || { echo "no domain vocabulary at $vocab"; exit 2; }
files=$(find "$@" -type f \( -name '*.ts' -o -name '*.tsx' \) \
  -not -path '*/node_modules/*' -not -name '*.d.ts' -not -name '*.test.ts' -not -name '*.gen.ts' -not -name 'kernel.ts' \
  \( -path '*packages/domain/*' -o -path '*packages/schema/*' \) 2>/dev/null | sed 's|^\./||' | sort || true)
[ -n "$files" ] || { echo "no domain files under: $*"; exit 2; }

declared() { grep -hoE "define$1\(\s*['\"][A-Z][A-Za-z]+['\"]" "${@:2}" | grep -oE "['\"][A-Z][A-Za-z]+['\"]" | tr -d "'\"" | sort -u || true; }
# The keys of the fields object in define*('Name', { … }), braces balanced, so Schema.optional(Text) hides nothing.
fields() { perl -0777 -ne 'while (/define(?:Command|Event)\(\s*["\x27][A-Za-z]+["\x27]\s*,\s*(\{(?:[^{}]++|(?1))*\})/g) { my $o = $1; print "$1\n" while $o =~ /([A-Za-z_][A-Za-z0-9_]*)\s*:/g }' "$@"; }
# One identifier per line as lowercase words: CommentChain, commentChain, comment_chain → " comment chain "
words() { sed -E 's/([a-z0-9])([A-Z])/\1 \2/g; s/([A-Z]+)([A-Z][a-z])/\1 \2/g; s/[-_]+/ /g' | tr 'A-Z' 'a-z' | sed -E 's/ +/ /g; s/^ */ /; s/ *$/ /'; }

commands=$(declared Command $files); events=$(declared Event $files)
names=$(printf '%s\n%s\n' "$commands" "$events" | grep -v '^$' | sort -u || true)
listed=$(grep -oE '`[A-Z][A-Za-z]+`' "$vocab" | tr -d '`' | sort -u)
rc=0

for n in $names; do
  grep -qx "$n" <<<"$listed" || { echo "✗ $n is declared in code but no domain vocabulary entry lists it"; rc=1; }
done

# Verbs: the first line under `## Verbs`, up to its first full stop. "Sign up" is the verb of SignUp.
verbs=$(awk '/^## Verbs/{f=1; next} f && /^## /{exit} f && NF {print; exit}' "$vocab" | sed 's/\..*//' | tr ',' '\n' \
  | awk '{ s = ""; for (i = 1; i <= NF; i++) s = s toupper(substr($i, 1, 1)) substr($i, 2); if (s != "") print s }')
if [ -n "$verbs" ]; then
  for c in $commands; do
    ok=0
    for v in $verbs; do [[ "$c" == "$v" || "$c" =~ ^$v[A-Z] ]] && { ok=1; break; }; done
    [ $ok -eq 1 ] || { echo "✗ command $c does not start with a verb on the Verbs line of $vocab"; rc=1; }
  done
fi

# Bans and paths per context: "P<tab>context<tab>prefix" and "B<tab>context<tab>term".
rules=$(awk '
  /^## Context:/ { ctx = $0; sub(/^## Context:[ ]*/, "", ctx); next }
  /^## /         { ctx = ""; next }
  /^Paths:/ { l = $0; sub(/^Paths:[ ]*/, "", l); n = split(l, a, ","); for (i = 1; i <= n; i++) { p = a[i]; gsub(/[` ]/, "", p); sub(/^\.\//, "", p); sub(/\/$/, "", p); if (p != "") print "P\t" ctx "\t" p }; next }
  /^[Nn]ot:/ { l = $0; sub(/^[Nn]ot:[ ]*/, "", l); gsub(/\([^)]*\)/, "", l); n = split(l, a, ","); for (i = 1; i <= n; i++) { t = tolower(a[i]); gsub(/[-_]+/, " ", t); gsub(/ +/, " ", t); sub(/^ /, "", t); sub(/ $/, "", t); if (t != "") print "B\t" ctx "\t" t } }
' "$vocab")
bans_for() {
  awk -F'\t' -v f="$1" '
    $1 == "P" { paths[$2] = paths[$2] "\n" $3; scoped[$2] = 1 }
    $1 == "B" { ctx[++n] = $2; term[n] = $3 }
    END {
      for (i = 1; i <= n; i++) {
        c = ctx[i]; if (!(c in scoped)) { print term[i]; continue }
        m = split(paths[c], ps, "\n")
        for (j = 1; j <= m; j++) { p = ps[j]; if (p != "" && (f == p || index(f, p "/") == 1 || index(f, "/" p "/") > 0)) { print term[i]; break } }
      }
    }' <<<"$rules" | sort -u
}

for f in $files; do
  bans=$(bans_for "$f"); [ -n "$bans" ] || continue
  idents=$( { fields "$f"; grep -hoE "^export (const|type|interface|function) [A-Za-z_][A-Za-z0-9_]*" "$f" | awk '{print $3}'; declared Command "$f"; declared Event "$f"; } | words | sort -u)
  while IFS= read -r b; do
    [ -n "$b" ] || continue
    if grep -qF -- " $b " <<<"$idents"; then
      where=$(grep -niE "$(sed 's/ /[-_]?/g' <<<"$b")" "$f" | grep -vE '^[0-9]+:\s*//' | head -2 | sed "s|^|    $f:|")
      echo "✗ banned synonym '$b' used as a domain identifier:"; echo "$where"; rc=1
    fi
  done <<<"$bans"
done

# Notes: entries ahead of the code, and schemas an entry names that do not exist.
draft=$(grep -E '^Carried by:' "$vocab" | sed -E 's/^Carried by:[^·]*//' | grep -oE '`[A-Z][A-Za-z]+`' | tr -d '`' | sort -u | grep -vxF -f <(printf '%s\n' $names) || true)
[ -z "$draft" ] || echo "· listed, not in code yet: $(tr '\n' ' ' <<<"$draft" | sed 's/ $//')"
schema_files=$(grep -E 'packages/schema/' <<<"$files" || true)
missing=$(for s in $(grep -oE '^Carried by: `[A-Z][A-Za-z]+` schema' "$vocab" | grep -oE '`[A-Za-z]+`' | tr -d '`'); do
  [ -n "$schema_files" ] && grep -qE "^export const $s\b" $schema_files || echo "$s"; done)
[ -z "$missing" ] || echo "· Carried by a schema packages/schema does not export: $(tr '\n' ' ' <<<"$missing" | sed 's/ $//')"

[ $rc -eq 0 ] && echo "✓ domain vocabulary and domain code agree ($(wc -w <<<"$names" | tr -d ' ') names, $(wc -w <<<"$commands" | tr -d ' ') command verbs, $(wc -l <<<"$files" | tr -d ' ') files checked)"
exit $rc
