# CLAUDE.md

Guidance for Claude Code when working on this repository.

## Project Overview

Bash TUI tool for managing MCP servers in Claude Code. Uses `fzf` for interactive selection, `jq` for JSON manipulation. Single script (`mcp`) discovers 12+ config sources, applies dual precedence resolution, and writes changes atomically.

## Key Files

| File | Purpose |
|------|---------|
| `mcp` | Main executable (~3000 lines bash) |
| `install.sh` | Installation script |
| `reference/ARCHITECTURE.md` | Detailed function references and data flow |
| `reference/CONFIGURATION.md` | All config sources and control arrays |
| `reference/ENTERPRISE.md` | Enterprise feature details |

## Critical Guardrails

### Control Array Locations

These arrays ONLY work in specific files - putting them elsewhere has NO effect:

- `enabledMcpjsonServers` / `disabledMcpjsonServers` - ONLY in `.claude/settings*.json`
- `disabledMcpServers` - ONLY in `~/.claude.json` (root or `.projects[cwd]`)
- `enabledPlugins` - ONLY in `.claude/settings*.json`

### Plugin Disable Issue

Setting `enabledPlugins["name"] = false` makes plugin disappear from Claude UI entirely. Use omit strategy instead of explicit false.

### Dual Precedence

Definition (where server is configured) and state (whether on/off) are resolved INDEPENDENTLY. A server can be defined in one file but controlled from another.

### Atomic Writes

Always use temp file + `mv` pattern for JSON updates. Never write directly.

## Server Types

| Type | Source | Control Method |
|------|--------|----------------|
| mcpjson | `.mcp.json` files | `enabledMcpjsonServers`/`disabledMcpjsonServers` |
| direct-global | `~/.claude.json` root `.mcpServers` | `disabledMcpServers` in `.projects[cwd]` |
| direct-local | `~/.claude.json` `.projects[cwd].mcpServers` | `disabledMcpServers` in same section |
| plugin | Marketplace installations | `enabledPlugins` object |

## 3-Way Toggle

RED (off) -> GREEN (on) -> ORANGE (paused) -> RED

- **RED**: `state=off`, in `disabledMcpjsonServers`
- **GREEN**: `state=on`, `runtime!=stopped`, in `enabledMcpjsonServers`
- **ORANGE**: `state=on`, `runtime=stopped`, in `disabledMcpServers`

## Scope Priority

1. Enterprise (priority 4) - immutable
2. Local (priority 3) - `./.claude/settings.local.json`
3. Project (priority 2) - `./.claude/settings.json`
4. User (priority 1) - `~/.claude/settings*.json`

## Development Commands

```bash
# Validate bash syntax
bash -n mcp

# Check dependencies
command -v fzf jq

# Run directly
./mcp

# Debug mode (slow, shows runtime state)
FAST_MODE=false ./mcp
```

## Key Functions

When modifying, check these locations:

| Function | Approx Lines | Purpose |
|----------|--------------|---------|
| `discover_and_parse_all_sources()` | ~300 | Discovery orchestrator |
| `parse_plugin_marketplace_files()` | ~617-695 | Plugin discovery |
| `toggle_server()` | ~1670-1844 | 3-way toggle logic |
| `save_changes()` | ~2000-2100 | Atomic save |

## Coding Patterns

### JSON Manipulation

```bash
# Read with jq
value=$(jq -r '.mcpServers | keys[]' "$file")

# Atomic write
TMP_FILE=$(mktemp)
jq '.key = "value"' "$source" > "$TMP_FILE"
mv "$TMP_FILE" "$target"
```

### fzf Error Handling

```bash
set +e
result=$(echo "$items" | fzf ...)
FZF_EXIT=$?
set -e
[[ $FZF_EXIT -eq 130 ]] && exit 0  # User cancelled
```

### State File Format

```
state:server:scope:file:type:flags
```

Example: `on:fetch:project:./.mcp.json:mcpjson:`

Flags (optional): `e`=enterprise, `b`=blocked, `r`=restricted

## Testing Notes

No automated tests currently. Manual testing workflow:

1. Create test config files
2. Run `./mcp`
3. Toggle servers, verify state file
4. Save, verify JSON output
5. Check Claude sees changes

## Output Destinations

- MCPJSON state -> `./.claude/settings.local.json`
- Direct server disable -> `~/.claude.json` `.projects[cwd].disabledMcpServers`
- Plugin state -> `./.claude/settings.local.json` `enabledPlugins`

## Reference Documents

For detailed specs, see:

- `reference/ARCHITECTURE.md` - Function line numbers, data flow, state format
- `reference/CONFIGURATION.md` - All 12+ config sources, control array details
- `reference/ENTERPRISE.md` - Enterprise access control, Phase G features
