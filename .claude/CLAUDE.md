# CLAUDE.md

Guidance for Claude Code when working on this repository.

## Project Overview

TypeScript TUI tool for managing MCP servers in Claude Code. Uses Ink (React for CLI) for interactive selection. Discovers 12+ config sources, applies dual precedence resolution, and writes changes atomically.

## Key Files

| File | Purpose |
|------|---------|
| `src/cli/index.ts` | CLI entry point with Commander.js commands |
| `src/tui/App.tsx` | Main Ink TUI application |
| `src/tui/store/index.ts` | Zustand state management |
| `src/core/config/discovery.ts` | Config source discovery |
| `src/core/config/precedence.ts` | Dual precedence resolution |
| `src/core/config/state.ts` | State persistence |
| `src/core/servers/toggle.ts` | 3-way toggle logic |
| `install-npm.sh` | npm-based installation script |

## Critical Guardrails

### Control Array Locations

These arrays ONLY work in specific files - putting them elsewhere has NO effect:

- `enabledMcpjsonServers` / `disabledMcpjsonServers` - ONLY in `.claude/settings*.json`
- `disabledMcpServers` - ONLY in `~/.claude.json` (root or `.projects[cwd]`)
- `enabledPlugins` - ONLY in `.claude/settings*.json`

### Plugin Disable Issue

Setting `enabledPlugins["name"] = false` makes plugin disappear from Claude UI entirely. Use omit strategy instead of explicit false.

### Plugin Key Format

`enabledPlugins` uses `pluginName@marketplace` format (e.g., `developer-toolkit@wookstar-claude-code-plugins`), NOT the full server name format (`serverKey:pluginName@marketplace`).

### Dual Precedence

Definition (where server is configured) and state (whether on/off) are resolved INDEPENDENTLY. A server can be defined in one file but controlled from another.

### Atomic Writes

Always use temp file + rename pattern for JSON updates. Never write directly.

## Server Types

| Type | Source | Control Method |
|------|--------|----------------|
| mcpjson | `.mcp.json` files | `enabledMcpjsonServers`/`disabledMcpjsonServers` |
| direct-global | `~/.claude.json` root `.mcpServers` | `disabledMcpServers` in `.projects[cwd]` |
| direct-local | `~/.claude.json` `.projects[cwd].mcpServers` | `disabledMcpServers` in same section |
| plugin | Marketplace installations | `enabledPlugins` object (ONLY control) |

### Plugin Control Details

- Plugins are controlled ONLY by `enabledPlugins` in `.claude/settings*.json`
- `disabledMcpServers` does NOT affect plugin servers (only direct servers)
- Plugins NOT in `enabledPlugins` default to disabled
- Plugins with `enabledPlugins: true` are enabled and running
- Plugins with `enabledPlugins: false` are disabled AND hidden from UI

## 3-Way Toggle (Display States)

RED (off) → GREEN (on) → ORANGE (paused) → RED

- **RED**: `state=off` - Server is disabled
- **GREEN**: `state=on`, `runtime!=stopped` - Server is enabled and running
- **ORANGE**: `state=on`, `runtime=stopped` - Server is enabled but paused (direct servers only)

## Scope Priority

1. Enterprise (priority 4) - immutable
2. Local (priority 3) - `./.claude/settings.local.json`
3. Project (priority 2) - `./.claude/settings.json`
4. User (priority 1) - `~/.claude/settings*.json`

## Development Commands

```bash
# TypeScript type checking
npm run typecheck

# Linting
npm run lint

# Build
npm run build

# Run tests
npm test

# Run CLI directly (after build)
node dist/cli.js

# Development with tsx
npx tsx src/cli/index.ts
```

## Key Modules

| Module | Purpose |
|--------|---------|
| `discovery.ts` | Scans all config sources, returns RawDefinition[] |
| `precedence.ts` | Resolves definitions + states into Server[] |
| `toggle.ts` | Computes display state and handles state transitions |
| `state.ts` | Writes changes back to appropriate config files |
| `store/index.ts` | Zustand store for TUI state management |

## Testing

Automated tests using Vitest:

```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage
```

Test files in `tests/unit/`:
- `toggle.test.ts` - 3-way toggle logic
- `precedence.test.ts` - Precedence resolution
- `enterprise.test.ts` - Enterprise access control
- `plugin.test.ts` - Plugin name format utilities

## Output Destinations

- MCPJSON state → `./.claude/settings.local.json`
- Direct server disable → `~/.claude.json` `.projects[cwd].disabledMcpServers`
- Plugin state → `./.claude/settings.local.json` `enabledPlugins`

## CI/CD

- **Workflow file**: `.github/workflows/deploy.yml` - MUST keep this filename as npm trusted publishing is configured for this specific workflow
- **Node.js version**: CI uses Node 24 (bundled npm 11.6.2 supports trusted publishing OIDC)
- **Package engines**: `>=22.0.0` for broader user compatibility
