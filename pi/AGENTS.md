# Global Agent Instructions

## Environment

- macOS (Apple Silicon), managed by Nix flakes + nix-darwin + home-manager
- Primary repo: `~/.bin` (laptop dotfiles)
- Shell: Fish
- Terminal: Kitty / Ghostty
- Editor: Neovim (LazyVim), VSCode, Cursor

## Preferences

- Use `uv` for Python projects (not pip/poetry directly)
- Use `bun` over `npm` when possible
- Nix for system packages, Homebrew for GUI apps only
- 2-space indentation for Nix, shell, and config files
- Prefer concise, functional code over verbose patterns

## Tool Usage

- **Python**: Use `uv run` for scripts, `ty` for type checking
- **Nix**: `just rebuild` to build, `just switch` to apply, `just lint` to check
- **Git**: Conventional commits, prefer small focused changes
- **Search**: Use `rg` (ripgrep) and `fd` for file searching
