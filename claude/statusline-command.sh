#!/usr/bin/env bash
# Claude Code status line approximating the user's Starship prompt (~/.config/starship.toml)
input=$(cat)
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd')
model=$(echo "$input" | jq -r '.model.display_name // empty')
used=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
effort=$(echo "$input" | jq -r '.effort.level // empty')
thinking=$(echo "$input" | jq -r 'if .thinking.enabled == false then "off" else "" end')

B=$'\e[1m'; R=$'\e[0m'
GREEN=$'\e[1;32m'; BLUE=$'\e[1;34m'; YELLOW=$'\e[1;33m'; CYAN=$'\e[1;36m'
RED=$'\e[31m'; WHITE=$'\e[1;37m'; MAGENTA=$'\e[1;35m'; DIM=$'\e[2m'

# directory: ~ substitution, last 3 components in full, earlier ones fish-style (1 char), "../" prefix
path="$cwd"
case "$path" in "$HOME"*) path="~${path#$HOME}";; esac
IFS='/' read -r -a parts <<< "$path"
n=${#parts[@]}
if [ "$n" -gt 3 ]; then
  out="../"
  for ((i=n-3; i<n; i++)); do out+="${parts[i]}"; [ $i -lt $((n-1)) ] && out+="/"; done
  path="$out"
fi

# git branch + status (no optional locks)
git_part=""
if git -C "$cwd" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  porcelain=$(git -C "$cwd" --no-optional-locks status --porcelain=v1 -b 2>/dev/null)
  head=$(echo "$porcelain" | head -1)
  branch=${head#\#\# }; branch=${branch%%...*}; branch=${branch%% \[*}
  [ "$branch" = "HEAD (no branch)" ] && branch=$(git -C "$cwd" rev-parse --short HEAD 2>/dev/null)
  body=$(echo "$porcelain" | tail -n +2)
  st=""
  echo "$body" | grep -qE '^(UU|AA|DD|AU|UA|DU|UD)' && st+="xxx"
  echo "$body" | grep -qE '^[MARC]' && st+="+"
  echo "$body" | grep -qE '^.[MT]' && st+="!"
  echo "$body" | grep -qE '^(R.|.R)' && st+=">>"
  echo "$body" | grep -qE '^( D|D |.D)' && st+="✘"
  echo "$body" | grep -q '^??' && st+="?"
  git -C "$cwd" rev-parse --verify -q refs/stash >/dev/null 2>&1 && st+="≡"
  ahead=$(echo "$head" | sed -n 's/.*ahead \([0-9]*\).*/\1/p')
  behind=$(echo "$head" | sed -n 's/.*behind \([0-9]*\).*/\1/p')
  if [ -n "$ahead" ] && [ -n "$behind" ]; then st+="⇕"
  elif [ -n "$ahead" ]; then st+="⇡$ahead"
  elif [ -n "$behind" ]; then st+="⇣$behind"
  fi
  [ -z "$st" ] && st="✔"
  gdir=$(git -C "$cwd" rev-parse --git-dir 2>/dev/null); state=""
  case 1 in
    $([ -d "$gdir/rebase-merge" ] || [ -d "$gdir/rebase-apply" ] && echo 1)) state="REBASING";;
    $([ -f "$gdir/MERGE_HEAD" ] && echo 1)) state="MERGING";;
    $([ -f "$gdir/CHERRY_PICK_HEAD" ] && echo 1)) state="CHERRY-PICKING";;
  esac
  git_part=" on ${CYAN}${branch}${R}"
  [ -n "$state" ] && git_part+="|${RED}${state}${R}"
  git_part+=" ${RED}${st}${R}"
fi

# language modules (detected by project files; version shown as in Starship)
lang=""
add() { lang+=" ${BLUE}$1${R}"; }
cd "$cwd" 2>/dev/null && {
  [ -f package.json ] && command -v node >/dev/null && add "node $(node --version)"
  [ -f Cargo.toml ] && command -v rustc >/dev/null && add "rust v$(rustc --version | awk '{print $2}')"
  [ -f go.mod ] && command -v go >/dev/null && add "go v$(go version | awk '{print $3}' | sed 's/go//')"
  { [ -f pyproject.toml ] || [ -f requirements.txt ]; } && command -v python3 >/dev/null && add "py v$(python3 --version | awk '{print $2}')"
  [ -f Gemfile ] && command -v ruby >/dev/null && add "ruby v$(ruby --version | awk '{print $2}')"
  [ -f mix.exs ] && command -v elixir >/dev/null && add "elixir v$(elixir --version 2>/dev/null | awk '/Elixir/{print $2}')"
}

host=$(hostname -s)
user=$(whoami)
printf '┌─%s%s%s as %s%s%s in %s%s%s%s%s\n' \
  "$GREEN" "$host" "$R" "$BLUE" "$user" "$R" "$YELLOW" "$path" "$R" "$git_part" "$lang"

# A 10-cell usage bar with its percentage: green below 50%, yellow from 50%, red from 80%.
meter() {
  local pct filled bar="" bc i
  pct=$(printf '%.0f' "$1")
  filled=$(( (pct * 10 + 50) / 100 ))
  [ "$filled" -gt 10 ] && filled=10
  [ "$filled" -lt 0 ] && filled=0
  for ((i=0; i<10; i++)); do
    if [ $i -lt $filled ]; then bar+="▰"; else bar+="▱"; fi
  done
  if [ "$pct" -ge 80 ]; then bc=$'\e[31m'
  elif [ "$pct" -ge 50 ]; then bc=$'\e[33m'
  else bc=$'\e[32m'; fi
  printf '%s' "${bc}${bar} ${pct}%${R}"
}

# Time until an epoch timestamp, e.g. "2h14m" or "3d5h".
until_reset() {
  local left=$(( $1 - $(date +%s) ))
  [ "$left" -le 0 ] && { printf 'now'; return; }
  local d=$(( left / 86400 )) h=$(( left % 86400 / 3600 )) m=$(( left % 3600 / 60 ))
  if [ "$d" -gt 0 ]; then printf '%dd%dh' "$d" "$h"
  elif [ "$h" -gt 0 ]; then printf '%dh%02dm' "$h" "$m"
  else printf '%dm' "$m"; fi
}

five=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
five_at=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // empty')
week=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
week_at=$(echo "$input" | jq -r '.rate_limits.seven_day.resets_at // empty')
limits=""
if [ -n "$five" ]; then
  limits+="5h $(meter "$five")"
  [ -n "$five_at" ] && limits+=" ${DIM}↺ $(until_reset "$five_at")${R}"
fi
if [ -n "$week" ]; then
  [ -n "$limits" ] && limits+="  "
  limits+="7d $(meter "$week")"
  [ -n "$week_at" ] && limits+=" ${DIM}↺ $(until_reset "$week_at")${R}"
fi

# The last line gets the closing corner.
if [ -n "$limits" ]; then line2="├─"; else line2="└─"; fi
[ -n "$model" ] && line2+="${GREEN}${model}${R}"
# Thinking effort (low … max); says so when thinking is off.
if [ "$thinking" = "off" ]; then line2+=" ${DIM}thinking off${R}"
elif [ -n "$effort" ]; then line2+=" effort ${MAGENTA}${effort}${R}"; fi
[ -n "$used" ] && line2+=" ctx $(meter "$used")"
line2+=" ${WHITE}$(date +%T)${R}"
printf '%s' "$line2"
[ -n "$limits" ] && printf '\n└─%s' "$limits"
