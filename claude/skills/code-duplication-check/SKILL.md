---
name: code-duplication-check
description: Prevents recreating existing code by detecting component requests, searching codebase for similar implementations, and offering reuse options before writing new code.
---

# Code Duplication Prevention

## Activation

**When this skill is triggered, ALWAYS display this banner first:**

```
╭─────────────────────────────────────────────────────────────╮
│  🔍 SKILL ACTIVATED: code-duplication-check                 │
├─────────────────────────────────────────────────────────────┤
│  Detected: Request to write new component                   │
│  Action: Searching codebase for existing implementations... │
╰─────────────────────────────────────────────────────────────╯
```

## When to Use

This skill activates automatically when it detects requests to write specific components. Pattern matching on:

- "write a callback"
- "create a utility" / "add a helper"
- "implement a new loss" / "add a loss function"
- "add a metric" / "create a metric"
- "build a multi-GPU function" / "add multi-GPU support"
- "create a data augmentation" / "add augmentation"
- "implement a scheduler" / "add scheduler"
- "write a transform" / "add transform"

**Key principle**: Search first, code second. Only write new code after checking for existing implementations.

## Search Process

### Scope
Search entire `src/` directory comprehensively.

### Strategy
Combine two approaches:
1. **Keyword-based**: Exact matches on function/class names, file names, key terms
2. **Semantic understanding**: Conceptual similarity (e.g., "learning rate warmup" finds scheduler code)

### What to Track
- **ML-specific patterns**: PyTorch Lightning callbacks, multi-GPU utilities, WandB logging, checkpoint handlers, losses, metrics, augmentations, schedulers
- **General Python utilities**: Reusable functions/classes (data processing, file I/O, config helpers)

### Matching Strictness
Use judgment based on context:
- **Strict** for well-defined ML components (callbacks, losses, metrics)
- **Broader** for general utilities (more variation in implementations)

### Result Limiting
- Show **1 match** if very confident it's the right one
- Show **up to 3 matches** if uncertain about which is best
- Rank by relevance (name similarity, usage patterns, code structure)

## Presentation Flow

When matches are found, PAUSE before writing any code and present:

```
I found similar code in the codebase:

**Match 1**: <ClassName/FunctionName> (<file_path>:<line_start>-<line_end>)
```<language>
<code snippet>
```

[Show up to 3 matches if applicable]

What would you like to do?
1. **Use existing** - I'll show you how to import and use this
2. **Write new** - I'll explain why this doesn't fit and write new code
3. **Adapt existing** - I'll show what changes are needed
```

Each match shows:
- Code snippet (function/class definition)
- File location with line numbers
- Brief context if helpful

## Three Workflow Paths

### Path 1: Use Existing

1. Show import statement
2. Show usage example (how to add to trainer, what parameters it needs, etc.)
3. Confirm with user
4. Done

Example:
```
To use this callback:

1. Import: `from src.trainer.callbacks import MultiGPUCheckCallback`
2. Usage: Add to trainer callbacks list in your config or training script
3. Parameters: None required (auto-detects GPU count)
```

### Path 2: Write New

1. **Justify first**: Explain why existing code doesn't meet requirements
2. Proceed to write the requested code
3. Document rationale in code comments or commit message

Example:
```
The existing callback only logs GPU count. Your request needs to track
per-GPU memory usage and log to WandB, which isn't present. I'll write
new code with these capabilities.
```

### Path 3: Adapt Existing

1. Show the existing code
2. Show proposed modifications (highlighted or explained)
3. Explain what changes are needed and why
4. Ask for confirmation before editing

Example:
```
I can adapt the existing MultiGPUCheckCallback by:
1. Adding memory tracking using torch.cuda.memory_allocated()
2. Adding WandB logging in on_train_batch_end()
3. Adding configuration for memory threshold alerts

Proceed with these changes?
```

## Special Cases

### Registry-Based Components

For components using the project's registry pattern (`@register_model`, `@register_loss`):

1. **Check registry first**: Look in `src/<component_type>/__init__.py` for registered items
2. **Then check implementations**: Search individual files in `src/<component_type>/`
3. **Suggest registry pattern**: If match found in registry, show how to use it via `get_<component>()`

Example:
```
I found a registered loss function in the loss registry:

**Available**: `sisdr` (Scale-Invariant Signal-to-Distortion Ratio)

Usage:
```python
from src.losses import get_loss_function
loss_fn = get_loss_function({"type": "sisdr"})
```

Is this what you need?
```

### Component-Specific Directories

Prioritize searches based on component type:
- **Callbacks**: Prioritize `src/trainer/`, check `src/utils/`
- **Losses/Metrics**: Check registry first, then `src/losses/`
- **Utilities**: Prioritize `src/utils/`, search all `src/`
- **Data augmentations**: `src/data/augmentations.py`, `src/data/`
- **Multi-GPU helpers**: `src/trainer/`, `src/config/`, `src/utils/`

### No Matches Found

If no similar code is found:
- **Proceed silently** without interruption
- Write the requested code normally
- No need to announce "no matches found"

Low-friction design: only intervene when reuse is possible.

## Implementation Tools

Use these tools for search and presentation:

1. **Grep**: Search for keywords and patterns
   ```
   - Use with `output_mode="files_with_matches"` first to find files
   - Then `output_mode="content"` with `-A/-B` context for snippets
   - Try both exact keywords and related terms
   ```

2. **Glob**: Pattern matching for specific file types
   ```
   - **/*.py for all Python files
   - src/trainer/**/*.py for callbacks
   - src/losses/*.py for losses
   ```

3. **Read**: Get code snippets with line numbers

4. **AskUserQuestion**: Present the 3-choice decision

## Search Examples

### Example 1: Callback Request
```
User: "Write a callback to log learning rate to WandB"

Search process:
1. Grep for "callback" + "learning rate" in src/trainer/
2. Grep for "lr" + "wandb" + "log" in src/
3. Check if WandBLogger or similar exists
4. Present matches with 3 options
```

### Example 2: Utility Request
```
User: "Create a utility to check if we're in DDP mode"

Search process:
1. Grep for "ddp" + "distributed" in src/
2. Grep for "multi.*gpu" + "trainer" in src/
3. Check src/utils/ and src/config/ for existing checks
4. Present matches or proceed if none found
```

### Example 3: Loss Function Request
```
User: "Implement a spectral convergence loss"

Search process:
1. Check loss registry: grep "spectral" in src/losses/__init__.py
2. Grep for "spectral" + "loss" in src/losses/
3. Check multiscale_losses.py (likely location)
4. Present matches or write new if truly novel
```

## Red Flags - Never Do This

❌ Write code immediately without searching first
❌ Show matches without file location and line numbers
❌ Proceed to "write new" without justifying why existing code won't work
❌ Search only in one directory (always comprehensive search)
❌ Announce "no matches found" (silent when nothing found)
❌ Show more than 3 matches (information overload)

## Success Criteria

✅ Auto-detects component writing requests
✅ Searches comprehensively before presenting options
✅ Shows code snippets with file locations
✅ Presents 3 clear options: use, write new, adapt
✅ Handles all three workflow paths completely
✅ Silent when no matches (low friction)
✅ Integrates with registry patterns when applicable

## Notes

- This skill reduces code duplication across the research team
- Promotes discovery of existing utilities and patterns
- Forces deliberate decision-making about new code vs. reuse
- Minimal friction: only intervenes when helpful
