# Pi setup snapshot

This repo captures your Pi packages plus custom skills/extensions you want to sync to `~/.pi` on a new machine.

## Contents

- `pi/extensions.txt`: package sources for `pi install`
- `skills/`: custom skills to sync into `~/.pi/agent/skills`
- `extensions/`: custom extensions to sync into `~/.pi/agent/extensions`

## Setup on a new machine

1) Install Pi:

```bash
npm install -g @mariozechner/pi-coding-agent
```

2) Install packages listed in `pi/extensions.txt`:

```bash
bash scripts/pi-install.sh
```

3) Sync skills/extensions from this repo into `~/.pi`:

```bash
bash scripts/pi-sync.sh
```

## Update the package list (current machine)

```bash
bash scripts/pi-export.sh
```

> Note: skills/extensions are synced from this repo; `pi install` only manages packages.
