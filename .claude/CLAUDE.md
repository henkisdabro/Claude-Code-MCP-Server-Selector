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
| `src/tui/hooks/useKeyBindings.ts` | Keyboard input handling (cross-platform Alt/Option) |
| `src/core/config/discovery.ts` | Config source discovery |
| `src/core/config/precedence.ts` | Dual precedence resolution |
| `src/core/config/state.ts` | State persistence |
| `src/core/servers/toggle.ts` | 3-way toggle logic |
| `src/utils/executable.ts` | Cross-platform executable detection (no shell commands) |
| `src/utils/platform.ts` | Platform detection (Linux, macOS, Windows, WSL) |
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

`enabledPlugins` uses `pluginName@marketplace` format (e.g., `developer-toolkit@wookstar-claude-plugins`), NOT the full server name format (`serverKey:pluginName@marketplace`).

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

### MCP JSON Formats

The `.mcp.json` file format supports two structures:

**Standard format** (servers under `mcpServers` key):
```json
{
  "mcpServers": {
    "server-name": { "command": "node", "args": ["server.js"] }
  }
}
```

**Root-level format** (servers directly at root, used by claude-plugins-official):
```json
{
  "server-name": { "command": "node", "args": ["server.js"] }
}
```

Both formats are supported. Root-level format is detected by checking for objects with `command`, `url`, or `type` properties. If `mcpServers` key is present and non-empty, it takes precedence over root-level servers.

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
- `executable.test.ts` - Cross-platform executable detection
- `platform.test.ts` - Platform detection (Linux, macOS, Windows, WSL)

Test files in `tests/integration/`:
- `discovery.test.ts` - Full discovery pipeline with config sources and precedence resolution

### End-to-End Testing Procedure

To verify the tool works correctly with Claude Code, test all three server types:

**1. Plugin Servers (Marketplace)**

```bash
# Check plugin state
node dist/cli.js context-report | grep -A10 "plugin"

# Toggle a plugin server
node dist/cli.js disable fetch:mcp-fetch@wookstar-claude-plugins
claude mcp list | grep fetch  # Should NOT appear

node dist/cli.js enable fetch:mcp-fetch@wookstar-claude-plugins
claude mcp list | grep fetch  # Should show "plugin:mcp-fetch:fetch"
```

**2. MCPJSON Servers (.mcp.json)**

```bash
# Create test server in project .mcp.json
echo '{"mcpServers":{"test-mcp":{"command":"echo","args":["test"]}}}' > .mcp.json

# Verify discovery
node dist/cli.js context-report | grep test-mcp

# Test toggle
node dist/cli.js disable test-mcp
# State stored in .claude/settings.local.json disabledMcpjsonServers

node dist/cli.js enable test-mcp
claude mcp list | grep test-mcp  # Should appear

# Clean up
rm .mcp.json
```

**3. Direct Servers (~/.claude.json)**

```bash
# Add test server to ~/.claude.json mcpServers
jq '.mcpServers["test-direct"] = {"command":"echo","args":["test"]}' ~/.claude.json > tmp && mv tmp ~/.claude.json

# Test toggle
node dist/cli.js disable test-direct
# State stored in ~/.claude.json .projects[cwd].disabledMcpServers

node dist/cli.js enable test-direct
claude mcp list | grep test-direct  # Should appear

# Clean up
jq 'del(.mcpServers["test-direct"])' ~/.claude.json > tmp && mv tmp ~/.claude.json
```

**State Storage Locations**

| Server Type | Enable/Disable Storage |
|-------------|------------------------|
| Plugin | `.claude/settings.local.json` `enabledPlugins` |
| MCPJSON | `.claude/settings.local.json` `enabledMcpjsonServers`/`disabledMcpjsonServers` |
| Direct | `~/.claude.json` `.projects[cwd].disabledMcpServers` |

**Note**: Changes to plugin `enabledPlugins` and MCPJSON servers take effect immediately in `claude mcp list`. Changes to direct server `disabledMcpServers` may require Claude Code restart.

## Output Destinations

- MCPJSON state → `./.claude/settings.local.json`
- Direct server disable → `~/.claude.json` `.projects[cwd].disabledMcpServers`
- Plugin state → `./.claude/settings.local.json` `enabledPlugins`

## Cross-Platform Support

### Executable Detection

The `executable.ts` utility finds executables without shell commands:
- Uses `path.delimiter` for PATH splitting (`:` on Unix, `;` on Windows)
- Checks `PATHEXT` on Windows for `.exe`, `.cmd`, `.bat` extensions
- Uses `accessSync(X_OK)` on Unix to verify executable permission
- Resolves symlinks (both absolute and relative targets) with depth protection (max 10 levels)
- Security: Rejects path traversal attempts, empty PATH entries, and circular symlinks

### macOS Keyboard Shortcuts

The `useKeyBindings.ts` hook handles multiple Alt/Option key detection methods:
1. **Native `key.meta`** - Works in iTerm2 and configured terminals
2. **Escape sequence** - For terminals sending Escape+key
3. **Unicode character map** - For unconfigured macOS Terminal.app

macOS Terminal.app by default sends Unicode characters for Option+key:
- `Option+E` → `´` (mapped back to 'e')
- `Option+D` → `∂` (mapped back to 'd')
- `Option+M` → `µ` (mapped back to 'm')

### Platform Detection

The `platform.ts` utility detects:
- `macos` - Darwin platform
- `windows` - Win32 platform
- `wsl` - Linux with `microsoft-standard` or `wsl` in kernel release, or `WSL_DISTRO_NAME` env var
- `linux` - Native Linux (including Azure VMs which are NOT detected as WSL)

**Note**: WSL detection is specific to avoid false positives on Azure Linux VMs which contain "microsoft" but not "microsoft-standard" in their kernel release string.

### Windows Path Handling

**Critical**: Claude Code uses **forward slashes** for project keys on ALL platforms:
- Claude Code stores: `"C:/Users/henrik/project"`
- Windows `path.normalize()` produces: `C:\Users\henrik\project`

These are different JSON keys, causing read/write mismatches. Solution:
```typescript
import { normaliseProjectPath } from '@/utils/platform.js';
const normalizedCwd = normaliseProjectPath(cwd);
```

The `normaliseProjectPath()` function handles:
- Converts backslashes to forward slashes
- Uppercases Windows drive letters (`c:/` → `C:/`)
- Uses `path.normalize()` for consistent path resolution

This function is used in `state.ts`, `discovery.ts`, and `migration.ts`.

### Concurrent Access Protection

File locking prevents race conditions when multiple instances access config files:
- Uses `proper-lockfile` package for advisory file locking
- Retries with exponential backoff (5 retries, 100-1000ms timeout)
- Stale lock detection (10 second timeout)
- Graceful fallback if locking fails (e.g., network drives)

### Plugin Name Validation

Plugin server names must follow the format `serverKey:pluginName@marketplace`:
- Exactly 1 colon separating serverKey from pluginName
- Exactly 1 @ symbol separating pluginName from marketplace
- Colon must appear before @ symbol
- No empty components (serverKey, pluginName, marketplace all required)

Use `validatePluginServerName()` from `src/utils/plugin.ts` to validate before processing.

## CI/CD

- **Workflow file**: `.github/workflows/deploy.yml` - MUST keep this filename as npm trusted publishing is configured for this specific workflow
- **Node.js version**: CI uses Node 24 (bundled npm 11.6.2 supports trusted publishing OIDC)
- **Package engines**: `>=22.0.0` for broader user compatibility
- **Platform matrix**: Tests run on ubuntu-latest, macos-latest, windows-latest

## Claude Code v2.1.0 Features

This project uses Claude Code v2.1.0 features for enhanced development workflow.

### Skills

Skills in `.claude/skills/` use frontmatter format:

- `context: fork` - Run skill in isolated sub-agent context (used by `/release`)
- `model` - Specify model for skill execution (e.g., `claude-opus-4-5-20251101`)
- `allowed-tools` - YAML list of permitted tools
- `hooks` - Skill-scoped hooks with `once: true` support at matcher level

Skills are auto-discovered with hot-reload - no registration in settings.json needed.

### Agents

Custom agents in `.claude/agents/`:

- `test-runner.md` - Fast test execution with Haiku model
- `code-reviewer.md` - Code review with Sonnet model

Agent frontmatter uses `tools` field (not `allowed-tools`) and `skills` field to grant skill access.

### Hooks

Skill-scoped hooks support `once: true` for one-time pre-flight checks:

```yaml
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "git status --porcelain"
      once: true  # At matcher level, NOT inside hooks array
```

**Note**: `once: true` only works for skills and slash commands, not agents or settings hooks.

### Settings

Permissions use conservative wildcard patterns:

- `Bash(npm run:*)` instead of individual npm commands
- `Bash(git add:*)`, `Bash(git commit:*)` for git operations
- Skills auto-discovery means no `skills` array needed in settings.json

### Key Syntax Differences

| Component | Tools Field | Supports `once: true` |
|-----------|-------------|----------------------|
| Skills | `allowed-tools` | Yes (at matcher level) |
| Agents | `tools` | No |
| Commands | `allowed-tools` | Yes (at matcher level) |
