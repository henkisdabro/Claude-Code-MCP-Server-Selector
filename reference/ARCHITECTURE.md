# Architecture Reference

Detailed technical documentation for the MCP Server Selector implementation.

## Core Components

### Main Script: `mcp`

Single bash script (~3000 lines) that:

- Discovers and parses 12+ configuration sources
- Implements dual precedence resolution (definitions vs state)
- Provides fzf-based TUI with real-time preview
- Handles atomic file updates with backup/rollback

### Dependencies

- `fzf` - Interactive selection
- `jq` - JSON manipulation

## Data Flow

1. Script checks for dependencies (`fzf`, `jq`)
2. Discovers all configuration sources
3. Parses both settings arrays and MCP server definitions
4. Merges servers with precedence resolution
5. Presents unified list in `fzf` TUI
6. User interacts with keybindings
7. Changes saved atomically
8. Launches Claude with updated configuration

## Key Functions Reference

### Discovery Functions

| Function | Lines | Purpose |
|----------|-------|---------|
| `discover_and_parse_all_sources()` | ~300-320 | Main discovery orchestrator |
| `parse_enterprise_mcp_json()` | ~350-400 | Enterprise config parsing |
| `parse_claude_json_file()` | ~420-500 | ~/.claude.json parsing |
| `parse_mcp_json_file()` | ~520-580 | .mcp.json file parsing |
| `parse_settings_file()` | ~590-650 | Settings file parsing |
| `parse_plugin_marketplace_files()` | ~617-695 | Plugin discovery |
| `parse_enabled_plugins()` | ~700-750 | Plugin state parsing |

### State Management

| Function | Lines | Purpose |
|----------|-------|---------|
| `toggle_server()` | ~1670-1844 | 3-way toggle implementation |
| `add_to_disabled_mcp_servers()` | ~1541-1600 | Runtime disable helper |
| `remove_from_disabled_mcp_servers()` | ~1600-1668 | Runtime enable helper |
| `save_changes()` | ~2000-2100 | Atomic save with validation |

### Enterprise Functions (Phase G)

| Function | Lines | Purpose |
|----------|-------|---------|
| `server_matches_command_restriction()` | Phase G | Command array matching |
| `server_matches_url_restriction()` | Phase G | URL wildcard matching |
| `get_server_command_json()` | Phase G | Extract command+args |
| `get_server_url()` | Phase G | Extract URL for http/sse |
| `get_server_transport_type()` | Phase G | Detect stdio/http/sse |

## State File Format

Internal state file stores merged results:

```
state:server:def_scope:def_file:source_type:flags
```

Fields:

- `state` - on/off
- `server` - server name
- `def_scope` - local/project/user/enterprise
- `def_file` - path to definition file
- `source_type` - mcpjson/direct-global/direct-local/plugin
- `flags` - e=enterprise, b=blocked, r=restricted (optional)

Examples:

```
on:fetch:project:./.mcp.json:mcpjson:
on:company-api:enterprise:/etc/.../managed-mcp.json:mcpjson:e
off:filesystem:user:~/.mcp.json:mcpjson:b
```

## 3-Way Toggle System

Cycle: RED -> GREEN -> ORANGE -> RED

| State | Display | Config | Runtime |
|-------|---------|--------|---------|
| RED | `o` (red) | off | - |
| GREEN | `*` (green) | on | not stopped |
| ORANGE | `*` (orange) | on | stopped |

Toggle implementation logic (lines ~1670-1844):

```bash
# RED -> GREEN: Turn on config, remove from disabledMcpServers
# GREEN -> ORANGE: Keep config on, add to disabledMcpServers
# ORANGE -> RED: Turn off config, remove from disabledMcpServers
```

Save logic for MCPJSON servers (lines ~2041-2049):

```bash
if [[ "$state" == "on" ]] && [[ "$runtime" != "stopped" ]]; then
    enabled_mcpjson+=("$server")  # GREEN only
elif [[ "$state" == "off" ]]; then
    disabled_mcpjson+=("$server")  # RED only
fi
# ORANGE: neither array, controlled by disabledMcpServers
```

## Plugin Discovery (v1.5.0)

Two discovery methods in `parse_plugin_marketplace_files()`:

### Method 1: Root-level mcpServers

```
~/.claude/plugins/marketplaces/{MARKETPLACE}/.claude-plugin/marketplace.json
```

Check for `mcpServers` object directly in marketplace.json.

### Method 2: Source-guided Discovery

For each plugin in marketplace.json:

1. Read `.name` and `.source` fields
2. Validate `.source` (reject `..` and absolute paths)
3. Construct: `{marketplace_base}/{source}/.mcp.json`
4. If exists, output: `def:plugin-name@marketplace:user:.mcp.json:plugin`

Security:

- Path traversal protection: `[[ "$plugin_source" =~ \.\. ]]`
- Absolute path rejection: `[[ "$plugin_source" =~ ^/ ]]`

## Atomic File Updates

All writes use temp file + atomic move pattern:

```bash
TMP_FILE=$(mktemp)
jq '...' "$source" > "$TMP_FILE"
mv "$TMP_FILE" "$target"
```

For ~/.claude.json modifications, timestamped backups are created first.

## Error Handling

Script uses `set -euo pipefail` but disables during fzf:

```bash
set +e  # Before fzf
# ... fzf interaction ...
FZF_EXIT=$?
set -e  # After capturing exit code
```

Exit code 130 from fzf = user cancelled (ESC/Ctrl-C).

## ANSI Parsing

Selected items from fzf include ANSI codes that must be stripped:

```bash
sed 's/\x1b\[[0-9;]*m//g'  # Remove ANSI codes
sed 's/^\[ON \] *//'        # Remove state prefix
sed 's/ *(.*)$//'           # Remove scope suffix
```

## Performance: FAST_MODE

Default: `FAST_MODE=true`

- Skips `claude mcp list` call (saves 5-8 seconds)
- Detects ORANGE via `disabledMcpServers` only
- Trade-off: Cannot distinguish GREEN (running) from GREEN (enabled but not running)

Debug mode: `FAST_MODE=false ./mcp`

## Global Variables (Phase G)

```bash
EXCLUSIVE_ENTERPRISE_MODE=false  # Only enterprise servers allowed
MARKETPLACE_LOCKDOWN=false       # Marketplace disabled

declare -a ALLOWED_COMMANDS=()   # Command restrictions
declare -a DENIED_COMMANDS=()
declare -a ALLOWED_URLS=()       # URL restrictions
declare -a DENIED_URLS=()
declare -a STRICT_MARKETPLACES=()
```
