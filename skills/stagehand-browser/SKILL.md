---
name: stagehand-browser
description: Browser automation using Stagehand and AI. Use when you need to interact with websites, fill forms, login to services, extract data from web pages, or automate web workflows. Provides the browser_automate tool.
---

# Stagehand Browser Automation

## Overview

This skill provides AI-powered browser automation via the `browser_automate` tool. It uses Stagehand to translate natural language instructions into browser actions.

## When to Use

- Login to websites and perform authenticated actions
- Fill out forms with dynamic content
- Extract structured data from web pages
- Navigate complex web applications
- Take screenshots for verification

## The browser_automate Tool

### Basic Usage

```json
{
  "url": "https://example.com",
  "task": "Click the login button and read the page title"
}
```

### With Credential Lookup

```json
{
  "url": "https://fantasy.premierleague.com",
  "task": "Login with my credentials, then navigate to My Team",
  "credentials": { "site": "fpl" }
}
```

Credentials are loaded from sops-nix:
- `~/.config/sops-nix/secrets/<site>/` (with `email`/`username` and `password` files)
- `~/.config/sops-nix/secrets/stagehand/<site>/` (alternative location)

### With Data Extraction

```json
{
  "url": "https://example.com/products",
  "task": "Find the featured product",
  "extract": {
    "instruction": "Extract the product name and price",
    "schema": {
      "name": "string",
      "price": "string"
    }
  }
}
```

### Debugging Mode (Watch Browser)

```json
{
  "url": "https://example.com",
  "task": "Fill out the contact form",
  "headless": false
}
```

Set `headless: false` to watch the browser perform actions in real-time.

## Task Writing Tips

### Be Specific

❌ "Login and do stuff"
✅ "Login with username from credentials, click 'My Account' in the top menu, then click 'Order History'"

### Break Down Complex Tasks

For multi-step workflows, describe each step:
```
"1. Login using credentials
2. Navigate to 'Transfers' tab
3. Click 'Make Transfers'
4. Search for player 'Salah'
5. Click 'Add to team'"
```

### Handle Dynamic Content

Stagehand understands context:
- "Click the button that says 'Submit'" (text matching)
- "Fill the email field" (semantic understanding)
- "Select the second item in the dropdown" (positional)

## Parameters Reference

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | required | URL to navigate to |
| `task` | string | required | Natural language task description |
| `credentials.site` | string | optional | Site identifier for credential lookup |
| `extract.instruction` | string | optional | What data to extract |
| `extract.schema` | object | optional | Schema for extracted data |
| `screenshot` | boolean | `true` | Take a screenshot when done |
| `headless` | boolean | `true` | Run browser without UI (set `false` to watch) |
| `timeout` | number | `60000` | Timeout in milliseconds |

## Integration with Other Skills

Other skills can reference this tool. Example for an FPL skill:

```markdown
## Making Transfers

When the user wants to make transfers, use the `browser_automate` tool:

browser_automate({
  url: "https://fantasy.premierleague.com/transfers",
  task: "Login, then transfer out [PLAYER_OUT] and bring in [PLAYER_IN]",
  credentials: { site: "fpl" },
  screenshot: true
})
```

## Limitations

- Each tool call is stateless (browser closes after task)
- No persistent sessions across calls (login required each time)
- Screenshots are PNG files saved to temp directory
- 60-second default timeout (configurable)

## Troubleshooting

### "No LLM API key found"
Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in your environment, or add to sops-nix.

### Browser not launching
Run setup: `~/.pi/agent/extensions/stagehand-browser/scripts/setup-local.sh`

### Timeout errors
Increase timeout: `{ "timeout": 120000 }` (2 minutes)

### Site blocking automation
Try with `{ "headless": false }` to see what's happening. Some sites may require additional handling.

### Credentials not found
Check that your credentials are at `~/.config/sops-nix/secrets/<site>/` with `email` (or `username`) and `password` files.
