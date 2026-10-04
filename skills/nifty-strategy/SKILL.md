---
name: nifty-strategy
description: Fetches live or cached NIFTY option-chain data, runs derivatives strategy simulations, and summarizes BUY/SELL/HOLD recommendations. Use when the user asks for nifty strategy, nifty derivatives, nifty simulation, or nifty analysis.
---

# NIFTY Derivatives Strategy

## Activation

TRIGGER when: user says "nifty strategy", "nifty derivatives", "run nifty simulation", "nifty analysis", "market strategy"

**Display this banner first:**

```
╭─────────────────────────────────────────────────────────────╮
│  NIFTY Derivatives Strategy Simulator                       │
├─────────────────────────────────────────────────────────────┤
│  Strategies: PCR | Max Pain | OI Change | Straddle          │
│  Data: NSE India Option Chain API                           │
│  Output: CSV files in output/                               │
╰─────────────────────────────────────────────────────────────╯
```

## What This Does

Fetches live NIFTY option chain data from NSE India, runs 4 trading strategies, simulates trades, and exports results to CSV.

## Usage

Run the script using uv:

```bash
# Full run: live data with cache fallback
uv run /Users/pratos/personal/sandeep_skills/nifty_strategy.py

# Use cached data only (offline mode)
uv run /Users/pratos/personal/sandeep_skills/nifty_strategy.py --cached

# Fetch and cache data only, no strategy run
uv run /Users/pratos/personal/sandeep_skills/nifty_strategy.py --fetch-only
```

## Arguments

The skill accepts these optional arguments:
- `--cached` — Use cached data only (no live fetch)
- `--fetch-only` — Fetch and cache data, skip strategy analysis
- `--symbol NIFTY` — Symbol to analyze (default: NIFTY)

Pass arguments from the user's message. For example, if user says "run nifty strategy with cached data", use `--cached`.

## After Running

1. Run the appropriate command above via Bash
2. Read the CSV files from `output/` directory and present results in a formatted table
3. Highlight the composite recommendation (BUY/SELL/HOLD)
4. Explain each strategy's signal briefly

## Output Files

All CSV files are in `/Users/pratos/personal/sandeep_skills/output/`:
- `option_chain_*.csv` — Raw option chain data
- `strategy_signals_*.csv` — Individual strategy signals
- `simulation_result_*.csv` — Trade simulation details
- `summary_*.csv` — One-row summary with all key metrics

## Disclaimer

This is for educational/simulation purposes only. Not financial advice. Do not use for actual trading decisions.
