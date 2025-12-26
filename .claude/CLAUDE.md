# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a bash-based TUI (Text User Interface) tool for managing MCP (Model Context Protocol) servers in Claude Code. The tool provides an interactive interface using `fzf` for enabling/disabling MCP servers from multiple configuration sources, with scope awareness and project-local override management.

## Architecture

### Core Components

**Main Script: `mcp`**
- Bash script that wraps the Claude Code CLI with an interactive server selector
- Discovers and parses 7 configuration sources (local/project/user scopes)
- Uses `fzf` for interactive selection with preview window and `jq` for JSON manipulation
- Always writes changes to `./.claude/settings.local.json` (project-local overrides)
- Atomically updates configuration using temp file + `mv` pattern
- Automatically launches Claude after configuration changes

### Configuration Sources (8+ Files)

The tool reads from all available configuration files and merges them with precedence:

**ENTERPRISE SCOPE** (highest priority, immutable) **v1.3.0**:
- `/etc/claude-code/managed-mcp.json` (Linux) - Enterprise MCP servers
- `/Library/Application Support/ClaudeCode/managed-mcp.json` (macOS) - Enterprise MCP servers
- `/etc/claude-code/managed-settings.json` (Linux) - Access policies (allowlist/denylist)
- `/Library/Application Support/ClaudeCode/managed-settings.json` (macOS) - Access policies

**LOCAL SCOPE**:
- `./.claude/settings.local.json` - Project-local settings (gitignored)

**PROJECT SCOPE**:
- `./.claude/settings.json` - Project-shared settings (version-controlled)
- `./.mcp.json` - Project MCP server definitions

**USER SCOPE** (lowest priority):
- `~/.claude/settings.local.json` - User-local settings
- `~/.claude/settings.json` - User-global settings
- `~/.claude.json` - Main user configuration
- `~/.mcp.json` - User MCP server definitions

### Two Separate Concepts

**Concept 1: Server Definitions** (`mcpServers` object)
- **What**: Actual server configurations (command, args, env, etc.)
- **Where**: Can exist in ANY of the 7 config files
- **Format**:
```json
{
  "mcpServers": {
    "fetch": { "command": "uvx", "args": ["mcp-server-fetch"] },
    "time": { "command": "uvx", "args": ["mcp-server-time"] }
  }
}
```
- **Purpose**: Defines WHAT servers exist and HOW to run them
- **Precedence**: When same server defined in multiple files, local > project > user

**Concept 2: Enable/Disable State** (Multiple Control Mechanisms)

Controls for MCPJSON servers (`enabledMcpjsonServers`/`disabledMcpjsonServers` arrays):
- **What**: Toggle switches for servers from `.mcp.json` files
- **Where**: Can exist in settings files (`.claude/settings*.json`)
- **Format**:
```json
{
  "enabledMcpjsonServers": ["fetch", "time"],
  "disabledMcpjsonServers": ["github"],
  "enableAllProjectMcpServers": true
}
```
- **Master Switch**: `enableAllProjectMcpServers` (true = enable all, false = disable all by default)
- **Individual Override**: Individual enable/disable arrays override master switch
- **CRITICAL LIMITATION**: These arrays ONLY work for servers defined in `.mcp.json` files
- **Servers in `~/.claude.json`**: Always enabled, cannot be controlled via these arrays

Controls for Direct servers (`disabledMcpServers` array):
- **What**: Toggle switches for servers from `~/.claude.json` root `.mcpServers` or `.projects[cwd].mcpServers`
- **Where**: ONLY in `~/.claude.json` (root OR `.projects[cwd]` section, NOT in settings files)
- **Format**:
```json
{
  "projects": {
    "/path/to/project": {
      "disabledMcpServers": ["time", "fetch"]
    }
  }
}
```
- **Precedence**: `.projects[cwd]` section provides project-specific overrides
- **Scope**: Project-specific control without moving server definition
- **Tool behavior**: Writes to `.projects[cwd].disabledMcpServers` with automatic backup

Controls for Plugin servers (`enabledPlugins` object):
- **What**: Toggle switches for marketplace plugin servers
- **Where**: ONLY in `.claude/settings*.json` files (NOT in `~/.claude.json`)
- **Format**:
```json
{
  "enabledPlugins": {
    "mcp-fetch@claudecode-marketplace": true,
    "mcp-time@claudecode-marketplace": false
  }
}
```
- **Precedence**: Project settings override user settings (objects merge)
- **CRITICAL ISSUE**: Setting to `false` makes plugin disappear from UI entirely (user cannot re-enable without editing config)

### Server Types

The tool categorizes servers into four types based on their source:

1. **MCPJSON Servers** (from `.mcp.json` files)
   - **Controllable**: Yes, via `enabledMcpjsonServers`/`disabledMcpjsonServers`
   - **Sources**: `~/.mcp.json` (user scope), `./.mcp.json` (project scope)
   - **UI Indicator**: `[ON]` or `[OFF]` with green/red color
   - **Master Switch**: Can be bulk controlled via `enableAllProjectMcpServers` flag

2. **Direct-Global Servers** (from `~/.claude.json` root `.mcpServers`)
   - **Controllable**: Yes, via `disabledMcpServers` array in `~/.claude.json` `.projects[cwd]` section
   - **Sources**: `~/.claude.json` root level `.mcpServers` object
   - **UI Indicator**: `[ON]` or `[OFF]` with indicator showing "direct-global"
   - **Control Method**: Write to `~/.claude.json` `.projects[cwd].disabledMcpServers`
   - **Alternative**: Can be migrated to `./.mcp.json` for full project ownership
   - **Note**: `disabledMcpServers` can ONLY exist in `~/.claude.json`, NOT in settings files

3. **Direct-Local Servers** (from `~/.claude.json` `.projects[cwd].mcpServers`)
   - **Controllable**: Yes, via `disabledMcpServers` array in same `.projects[cwd]` section
   - **Sources**: `~/.claude.json` `.projects[cwd].mcpServers` object
   - **UI Indicator**: `[ON]` or `[OFF]` with indicator showing "direct-local"
   - **Control Method**: Write to `~/.claude.json` `.projects[cwd].disabledMcpServers`
   - **Alternative**: Can be migrated to `./.mcp.json` for full project ownership

4. **Plugin Servers** (from Claude Code Marketplace)
   - **Controllable**: Yes, via `enabledPlugins` object
   - **Sources**: `~/.claude/plugins/marketplaces/{MARKETPLACE}/.claude-plugin/marketplace.json`
   - **UI Indicator**: `[ON]` or `[OFF]` with plugin badge
   - **Control Location**: Only works in `.claude/settings*.json` files (NOT in `~/.claude.json`)
   - **Critical Issue**: Setting to `false` makes plugin disappear from UI entirely (see Plugin Control section)

### Dual Precedence Resolution

The tool applies precedence SEPARATELY for definitions and state:

**Definition Precedence** (where server config comes from):
- If `fetch` defined in both user and project scopes → use project definition
- Local > Project > User scope

**State Precedence** (whether server is on/off):
- If `fetch` enabled in user scope, disabled in project scope → use project state (disabled)
- Local > Project > User scope
- Independent of where server is defined

**Example**:
```
User scope: fetch defined + enabled
Project scope: fetch defined with different args + disabled
Result: Uses project definition (different args) + disabled state
Display: [OFF] fetch (project)
```

### Data Flow

1. Script checks for dependencies (`fzf`, `jq`)
2. Discovers all 7 configuration sources
3. Parses both settings arrays and MCP server definitions
4. Merges servers with precedence resolution
5. Presents unified list in `fzf` TUI with scope labels: `[ON ] server (scope)`
6. User interacts:
   - `SPACE` - Toggle server on/off (quick-disable for Direct servers)
   - `ALT-M` - Migrate Direct server to project
   - `CTRL-A` - Add new server
   - `CTRL-X` - Remove server
   - `ALT-E` - Enable all servers
   - `ALT-D` - Disable all servers
   - `ENTER` - Save changes
7. Changes saved atomically (MCPJSON → `./.claude/settings.local.json`, Direct → `~/.claude.json`)
8. Launches Claude with updated configuration

## 3-Way Toggle System (v1.4.0)

The tool implements a complete 3-state toggle cycle for all server types, allowing users to cycle through:
**RED → GREEN → ORANGE → RED**

### Three States Explained

**🔴 RED (Disabled)**
- **Display**: `○` (red circle)
- **Config State**: `state=off` in state file
- **enabledMcpjsonServers**: Not listed
- **disabledMcpjsonServers**: Listed
- **disabledMcpServers**: Not needed (already disabled in config)
- **Result**: Server completely disabled, won't appear in Claude

**🟢 GREEN (Enabled - Will Start)**
- **Display**: `●` (green circle)
- **Config State**: `state=on`, `runtime!=stopped` in state file
- **enabledMcpjsonServers**: Listed (or default enabled)
- **disabledMcpjsonServers**: Not listed
- **disabledMcpServers**: NOT listed (key difference from ORANGE)
- **Result**: Server starts when Claude launches

**🟠 ORANGE (Enabled - Runtime Disabled)**
- **Display**: `●` (orange circle)
- **Config State**: `state=on`, `runtime=stopped` in state file
- **enabledMcpjsonServers**: May be listed (config says enabled)
- **disabledMcpjsonServers**: Not listed
- **disabledMcpServers**: Listed in `~/.claude.json` `.projects[cwd]`
- **Result**: Server configured but runtime-disabled, won't start
- **Use Case**: Keep server in config without removing, but temporarily disable

### Toggle Implementation

**Toggle Flow** (lines 1670-1844 in `toggle_server()`):

1. **RED → GREEN**: Turn on config, ensure not in disabledMcpServers
2. **GREEN → ORANGE**: Keep config on, add to disabledMcpServers
3. **ORANGE → RED**: Turn off config, remove from disabledMcpServers

**Helper Functions** (lines 1541-1668):
- `add_to_disabled_mcp_servers()`: Adds server to `~/.claude.json` runtime override list
- `remove_from_disabled_mcp_servers()`: Removes server from runtime override list

### Save Logic Integration

**Critical MCPJSON Distinction** (lines 2041-2049):
```bash
# ORANGE servers excluded from enabled/disabled arrays
if [[ "$state" == "on" ]] && [[ "$runtime" != "stopped" ]]; then
    # GREEN only
    enabled_mcpjson+=("$server")
elif [[ "$state" == "off" ]]; then
    # RED only
    disabled_mcpjson+=("$server")
fi
# ORANGE: neither array, controlled by disabledMcpServers
```

**ORANGE State Detection** (lines 1996-2009):
```bash
# All server types: check runtime==stopped
if [[ "$runtime" == "stopped" ]]; then
    if [[ "$source_type" == "plugin" ]]; then
        disabled_direct+=("plugin:$plugin_base:$plugin_key")
    else
        disabled_direct+=("$server")
    fi
fi
```

### Pre-Launch Message

**Separate Sections** (lines 2888-2928):
- "Will start (N)" - GREEN servers
- "Available but disabled (N)" - ORANGE servers

### Performance: FAST_MODE

**Optimization** (lines 1122-1142):
- Skips `claude mcp list` call (saves 5-8 seconds)
- Detects ORANGE via `disabledMcpServers` only
- Default: `FAST_MODE=true`
- Debug: `FAST_MODE=false ./mcp` (slow, shows actual runtime)

**Trade-off**: Can't distinguish GREEN (actually running) from GREEN (enabled but Claude not running). Both show as GREEN in TUI. ORANGE detection still works perfectly via `disabledMcpServers`.

## Development Commands

### Testing

No automated tests currently exist. Manual testing workflow:
```bash
# Run the script directly
./mcp

# Test with sample settings.json
```

### Validation

```bash
# Check bash syntax
bash -n mcp

# Verify dependencies
command -v fzf jq
```

## Key Technical Patterns

### Multi-Source Discovery

**UPDATED v1.5.0**: Now discovers marketplace plugin `.mcp.json` files in addition to all original sources.

Discovers and parses from 12+ configuration sources in priority order:

```bash
discover_and_parse_all_sources() {
  # ENTERPRISE SCOPE (Priority 4)
  parse_enterprise_mcp_json               # /etc/claude-code/managed-mcp.json

  # USER/PROJECT/LOCAL SCOPES (Priority 1-3)
  parse_claude_json_file                  # ~/.claude.json (root + .projects[cwd])
  parse_mcp_json_file "~/.mcp.json"       # User-scope .mcp.json
  parse_mcp_json_file "./.mcp.json"       # Project-scope .mcp.json (THIS PROJECT!)

  # Settings files (enable/disable arrays)
  parse_settings_file                     # ~/.claude/settings.json, ~/.claude/settings.local.json
  parse_settings_file                     # ./.claude/settings.json, ./.claude/settings.local.json

  # MARKETPLACE PLUGINS (Priority 1, v1.5.0)
  parse_plugin_marketplace_files          # ~/.claude/plugins/marketplaces/**/.mcp.json

  # Plugin enable/disable state
  parse_enabled_plugins                   # All settings files
}
```

**Discovery Output Format** - Three types:
- `def:server:scope:file:type` - Server is defined here
- `enable:server:scope:file` - Server is enabled here
- `disable:server:scope:file` - Server is disabled here

**Example Outputs**:
```
def:project-folder-mcpjson-test:project:./.mcp.json:mcpjson
def:developer-toolkit@wookstar:user:~/.claude/plugins/.../developer-toolkit/.mcp.json:plugin
def:fetch:user:~/.claude.json:direct-global
enable:fetch:project:./.claude/settings.json
```

**Key Points**:
- ✅ Project `.mcp.json` is ALWAYS discovered (line 1004 in mcp script)
- ✅ User home `.mcp.json` is ALWAYS discovered (line 1001)
- ✅ Marketplace plugins now use source-guided discovery (v1.5.0)
- ✅ All 8+ original sources preserved + marketplace enhancement

### Dual Precedence Resolution

Uses two separate associative arrays and numeric priorities:
```bash
get_scope_priority() {
  case "$1" in
    local) echo 3 ;;    # Highest
    project) echo 2 ;;
    user) echo 1 ;;     # Lowest
  esac
}

# Map 1: Server definitions (where configured)
declare -A server_definitions
# server_name -> priority:scope:file

# Map 2: Enable/disable state (whether active)
declare -A server_states
# server_name -> priority:on/off

# Merge: For each defined server, attach its state
# Result: state:server:def_scope:def_file
```

Higher priority wins independently for both definitions and state.

### State File Format

Internal state file stores merged results of dual precedence:
```
on:fetch:project:./.mcp.json:mcpjson
on:time:user:~/.claude.json:direct-global
off:github:project:./.mcp.json:mcpjson
```

Format: `state:server:def_scope:def_file:source_type`
- `state`: on/off (from enable/disable precedence or always-on for direct servers)
- `server`: server name
- `def_scope`: scope where server is DEFINED (local/project/user)
- `def_file`: file where winning server definition lives
- `source_type`: mcpjson, direct-global, or direct-local

**Important**: The scope/file shown is where the server is DEFINED, NOT where it's enabled/disabled. These can differ!

### Atomic File Updates

Always writes to `./.claude/settings.local.json` using temp file pattern:
```bash
TMP_FILE=$(mktemp)
jq --argjson enabled "$ENABLED_JSON" \
   --argjson disabled "$DISABLED_JSON" \
   '.enabledMcpjsonServers = $enabled | .disabledMcpjsonServers = $disabled' \
   "./.claude/settings.local.json" > "$TMP_FILE"
mv "$TMP_FILE" "./.claude/settings.local.json"
```

### Safe Error Handling

Script uses `set -euo pipefail` but disables during `fzf` interaction:
```bash
set +e  # Before fzf
# ... fzf interaction ...
FZF_EXIT=$?
set -e  # After capturing exit code
```

### ANSI Parsing

Selected items from `fzf` include ANSI codes and scope labels that must be stripped:
```bash
sed 's/\x1b\[[0-9;]*m//g'  # Remove ANSI codes
sed 's/^\[ON \] *//'        # Remove state prefix
sed 's/ *(.*)$//'           # Remove scope suffix
```

### Preview Window

Shows detailed source information with dual precedence awareness:
- **Defined In**: Where server configuration comes from (command, args, etc.)
- **Enabled/Disabled In**: Where enable/disable state comes from (if different)
- **All Sources**: Lists all definitions and enable/disable directives when multiple exist
- Marks active definition and active state with ✓
- Current vs pending status
- Write target information

**Example when definition and state come from different files**:
```
Server: fetch
Defined In: ./.claude/settings.json (project)
Enabled In: ~/.claude/settings.json (user)

Current Status: Enabled
```

## Direct Server Control System

### Control Options for Direct Servers

Direct servers (from `~/.claude.json`) have **two control methods**:

**Option A: Quick Disable** (Default, via SPACE key)
- Writes to `~/.claude.json` `.projects[cwd].disabledMcpServers`
- Server definition stays in global config
- Project-specific disable only
- Quick, single-step process
- Modifies global file but in project-scoped section
- **User Action**: Press `SPACE` to toggle

**Option B: Migration** (Alternative, via ALT-M key)
- Moves server definition to `./.mcp.json`
- Controlled via `./.claude/settings.local.json`
- Full project ownership of server
- Multi-step process with validation
- No global file modification after migration
- **User Action**: Press `ALT-M` to initiate migration

### Quick Disable Process (Option A - Default)

When user presses `SPACE` on a Direct server:

1. **Toggle**: Server state toggles ON ↔ OFF in state file
2. **Save**: On ENTER, changes written to `~/.claude.json` `.projects[cwd].disabledMcpServers`
3. **Backup**: Automatic timestamped backup of `~/.claude.json` created
4. **Write**: Atomic update to `.projects[cwd]` section
5. **Validation**: Verify JSON integrity
6. **Rollback**: Restore backup if any step fails

**Result**: Server disabled for this project only, definition remains global

### Migration Process (Option B - Alternative)

When user presses `ALT-M` on a Direct server:

1. **Detection**: Tool detects server is "direct" type
2. **Prompt**: User is shown migration options:
   - `[y]` Migrate to project (full ownership)
   - `[v]` View full server definition first
   - `[n]` Cancel migration
3. **Backup**: Automatic timestamped backup of `~/.claude.json` created
4. **Migration Steps** (if user confirms):
   - Extract server definition from `~/.claude.json`
   - Add server to `./.mcp.json` (creates file if needed)
   - Remove server from `~/.claude.json`
   - Validate both JSON files
   - Mark server as migrated (prevents re-prompting)
   - Reload server list
5. **Control**: Server is now controllable via `disabledMcpjsonServers` in `./.claude/settings.local.json`
6. **Rollback**: If any step fails, automatic rollback to backup

**Result**: Project owns server definition, no global file dependency

### Migration Tracking

- Migrated servers are tracked in `./.claude/.mcp_migrations`
- Format: `server_name:timestamp`
- Prevents re-prompting for already migrated servers
- Migrated servers show as normal controllable servers after migration

### Migration Safety Features

- **Explicit Consent**: User must confirm before any modification
- **Automatic Backups**: Timestamped backup before modifying `~/.claude.json`
- **Atomic Operations**: All file updates use temp files + atomic move
- **JSON Validation**: Validates both source and destination files
- **Rollback on Failure**: Restores backup if any step fails
- **Error Recovery**: Detailed error messages guide user

## Configuration Precedence Reference

### Control Array Precedence (by Location)

The effectiveness of control arrays depends on their location:

| Control Array | Valid Locations | Invalid Locations | Effect |
|---------------|----------------|-------------------|--------|
| `enabledMcpjsonServers` | `.claude/settings*.json` | `~/.claude.json` | Controls .mcp.json servers |
| `disabledMcpjsonServers` | `.claude/settings*.json` | `~/.claude.json` | Controls .mcp.json servers |
| `disabledMcpServers` | `~/.claude.json` (root or `.projects[cwd]`) | `.claude/settings*.json` | Controls Direct servers |
| `enabledPlugins` | `.claude/settings*.json` | `~/.claude.json` | Controls marketplace plugins |
| `enableAllProjectMcpServers` | `.claude/settings*.json` | `~/.claude.json` | Master switch for .mcp.json servers |

### Scope Precedence (Highest to Lowest)

When the same control exists in multiple scopes:

| Priority | Scope | Files | Overrides |
|----------|-------|-------|-----------|
| 3 (Highest) | **Local** | `./.claude/settings.local.json` | Project + User |
| 2 | **Project** | `./.claude/settings.json` | User only |
| 1 (Lowest) | **User** | `~/.claude/settings.json`, `~/.claude/settings.local.json` | None |

**Special Case**: `disabledMcpServers` in `~/.claude.json`:
- Root level = user scope (priority 1)
- `.projects[cwd]` = local scope (priority 3)

### Server Definition Precedence

When the same server is defined in multiple locations:

| Priority | Location | File | Notes |
|----------|----------|------|-------|
| 3 (Highest) | Local/Project | `./.claude/settings.local.json`, `./.mcp.json` | Project override |
| 2 | Project | `./.claude/settings.json`, `./.mcp.json` | Shared project config |
| 1 (Lowest) | User | `~/.claude.json`, `~/.mcp.json`, `~/.claude/settings.json` | Global default |

**Important**: Definition precedence and control precedence are resolved **independently**.

### Precedence Resolution Examples

**Example 1: MCPJSON Server**
```
User scope: fetch enabled in ~/.claude/settings.json
Project scope: fetch disabled in ./.claude/settings.json
Result: DISABLED (project scope wins)
```

**Example 2: Direct Server**
```
User scope: time defined in ~/.claude.json root .mcpServers
Local scope: time disabled in ~/.claude.json .projects[cwd].disabledMcpServers
Result: DISABLED (local scope disabledMcpServers wins)
```

**Example 3: Plugin Server**
```
User scope: mcp-fetch@claudecode-marketplace = true in ~/.claude/settings.json
Project scope: mcp-fetch@claudecode-marketplace = false in ./.claude/settings.json
Result: DISABLED (project scope wins, but plugin disappears from UI)
```

**Example 4: Mixed Definition and Control**
```
Definition: stripe defined in ~/.claude.json (user scope)
Control: stripe disabled in ./.claude/settings.local.json (local scope)
Result: Uses user definition, but DISABLED by local control
Display: [OFF] stripe (user, mcpjson)
```

## Plugin Control and Marketplace Integration

### Plugin Server Discovery

**NEW in v1.5.0**: Enhanced discovery now finds ALL plugins with `.mcp.json` files, not just those explicitly marked as `category: "mcpServers"` in marketplace metadata.

Plugin servers are discovered from marketplace installations using TWO methods:

**Method 1: Root-level mcpServers (v1.5.0)**
- **Location**: `~/.claude/plugins/marketplaces/{MARKETPLACE}/.claude-plugin/marketplace.json`
- **Mechanism**: Checks for root-level `mcpServers` object directly in marketplace.json
- **Example**:
  ```json
  {
    "mcpServers": {
      "fetch": { "command": "uvx", "args": ["mcp-server-fetch"] }
    },
    "plugins": [...]
  }
  ```
- **Output Format**: `server@marketplace` (e.g., `fetch@wookstar-claude-code-plugins`)

**Method 2: Source-guided Plugin Discovery (v1.5.0)**
- **Location**: `~/.claude/plugins/marketplaces/{MARKETPLACE}/{PLUGIN_SOURCE}/.mcp.json`
- **Mechanism**: For EACH plugin in marketplace.json, follows the `.source` field to find `.mcp.json` files
- **Coverage**: Discovers ALL plugins with MCP servers, regardless of category
- **Example Path**: `wookstar-claude-code-plugins/developer-toolkit/.mcp.json`
- **Security**: Validates `.source` paths to prevent traversal attacks (blocks `..` and absolute paths)
- **Output Format**: `plugin-name@marketplace` (e.g., `developer-toolkit@wookstar-claude-code-plugins`)

**Naming Convention**: Plugin servers identified by `{plugin-name}@{marketplace-name}` format
- Examples: `developer-toolkit@wookstar-claude-code-plugins`, `mcp-fetch@wookstar-claude-code-plugins`
- Format ensures compatibility with `enabledPlugins` control mechanism

**Implementation Details (parse_plugin_marketplace_files, lines 617-695)**:

Discovery Order:
1. Find all `marketplace.json` files using: `find ... -path "*/.claude-plugin/marketplace.json"`
2. For EACH marketplace.json:
   - **First Pass**: Check for root-level `mcpServers` object
     - Extract server names from mcpServers keys
     - Output: `def:server@marketplace:user:marketplace.json:plugin`
   - **Second Pass**: Iterate through `.plugins[]` array
     - Read each plugin's `.name` and `.source` fields
     - Validate `.source` path (reject `..` and absolute paths)
     - Construct path: `{marketplace_base}/{source}/.mcp.json`
     - If file exists and contains `mcpServers` object:
       - Output: `def:plugin-name@marketplace:user:.mcp.json:plugin`

Security Features:
- Path traversal protection via regex: `[[ "$plugin_source" =~ \.\. ]]`
- Absolute path rejection: `[[ "$plugin_source" =~ ^/ ]]`
- JSON validation before parsing
- Proper error logging with `msg_warning()`

Performance:
- O(n) complexity: Single find + direct path construction
- No recursive scanning (uses `.source` field for deterministic lookups)
- Average discovery time: <100ms for 10+ plugins

Key Architectural Decision:
- Uses PLUGIN NAME (not server names from .mcp.json) for output
- This ensures compatibility with `enabledPlugins` control mechanism
- Example: `developer-toolkit/.mcp.json` has server "chrome-devtools"
  - Output uses: `developer-toolkit@marketplace` (not `chrome-devtools@...`)
  - Control via: `enabledPlugins["developer-toolkit@marketplace"] = true`

### Plugin Control Mechanism

**Control Object**: `enabledPlugins`
```json
{
  "enabledPlugins": {
    "mcp-fetch@claudecode-marketplace": true,
    "mcp-time@claudecode-marketplace": false
  }
}
```

**Where it works**:
- ✅ `./.claude/settings.local.json` (highest priority)
- ✅ `./.claude/settings.json` (project scope)
- ✅ `~/.claude/settings.json` (user scope)
- ❌ `~/.claude.json` (any section) - Has NO effect
- ❌ `~/.claude/settings.local.json` (user-local) - Has NO effect

**Merge Behavior**: `enabledPlugins` objects MERGE across files
- User settings: `{fetch: true, time: true}`
- Project settings: `{fetch: false}`
- Result: `{fetch: false, time: true}` (project overrides fetch, inherits time)

### Critical Plugin UI Disappearance Issue

**The Problem** (Confirmed via testing Oct 2025):

When `enabledPlugins["plugin@marketplace"] = false` is set in working locations:
- ❌ Plugin disappears completely from `claude mcp list`
- ❌ Plugin becomes unavailable in Claude Code UI
- ❌ User cannot re-enable it via UI during session
- ❌ Config file edit required to restore

**Workaround Approaches**:

1. **Omit Instead of Setting False** (Recommended for soft disable):
```json
{
  "enabledPlugins": {
    "mcp-time@claudecode-marketplace": true
    // Don't mention mcp-fetch - inherits from lower-priority config
  }
}
```
- ✅ Allows re-enabling via Claude UI
- ⚠️ Lower-priority configs may still enable it
- ⚠️ Less predictable behavior

2. **Set to False** (For hard disable):
```json
{
  "enabledPlugins": {
    "mcp-fetch@claudecode-marketplace": false
  }
}
```
- ✅ Completely prevents plugin use
- ❌ Plugin disappears from UI
- ❌ Cannot re-enable without config edit

**Tool Implementation Decision**:
- For plugins, tool will use **omit strategy** by default
- User can explicitly request "hard disable" via special command
- Preview will warn about UI disappearance if hard-disabling

### Tested Control Arrays (Oct 2025)

**Complete Control Array Reference**:

| Array | Valid Location | Controls |
|-------|----------------|----------|
| `enabledMcpjsonServers` | Settings files only | `.mcp.json` servers |
| `disabledMcpjsonServers` | Settings files only | `.mcp.json` servers |
| `disabledMcpServers` | `~/.claude.json` ONLY (root or `.projects[cwd]`) | Direct servers and plugins |
| `enabledPlugins` | Settings files only | Plugin servers |
| `enableAllProjectMcpServers` | Settings files only | Master switch |
| `allowedMcpServers` | `managed-settings.json` only | Enterprise allow |
| `deniedMcpServers` | `managed-settings.json` only | Enterprise deny |
| `strictKnownMarketplaces` | `managed-settings.json` only | Marketplace lock |

**Working Arrays**:
- `enabledMcpjsonServers` / `disabledMcpjsonServers` - Controls .mcp.json servers (in settings files)
- `disabledMcpServers` - Controls Direct-Global/Direct-Local servers (ONLY in `~/.claude.json`)
- `enabledPlugins` - Controls marketplace plugins (in settings files only)
- `enableAllProjectMcpServers` - Master switch for all .mcp.json servers

**Critical Location Restrictions**:
- `disabledMcpServers` CANNOT be in settings files (`.claude/settings*.json`)
- `disabledMcpServers` ONLY works in `~/.claude.json` (root or `.projects[cwd]`)
- `disabledMcpjsonServers` ONLY works in settings files
- Tool writes `disabledMcpServers` to `.projects[cwd]` section for project-specific control

**Plugin Server Format in disabledMcpServers**:
When disabling plugin servers via `disabledMcpServers`, use the format:
```
plugin:PLUGIN_NAME:SERVER_NAME
```
Example: `plugin:developer-toolkit:chrome-devtools`

**Testing Reference**: See `MCP_CONTROL_TESTING_REPORT.md` for comprehensive test evidence and precedence rules.

## Important Notes

- **CAN modify global config** - ONLY when user explicitly requests migration
- **Server definitions**: Tool can move definitions during migration (with consent)
- **Scope labels show definition source** - `[ON] fetch (project, mcpjson)` shows controllable server
- **Warning indicator** - `[⚠] time (user, always-on)` shows direct server needs migration
- **Dual precedence** - Definition source and enable/disable state resolved independently
- Configuration updates are atomic (no partial writes)
- Handles empty/malformed JSON gracefully (skips bad files, continues with others)
- MCPJSON servers default to enabled unless explicitly disabled
- Preview window updates on every toggle/change and shows migration instructions for direct servers
- Exit code 130 from `fzf` = user cancelled (ESC/Ctrl-C)
- Creates `.claude/` directory automatically if needed
- **Plugin control**: Uses omit strategy by default to avoid UI disappearance
- **Enterprise servers**: Highest priority (4), immutable, cannot be toggled or overridden

## Enterprise Support (NEW in v1.3.0)

### Overview

The tool now supports enterprise-managed MCP servers and access control policies deployed by IT administrators. Enterprise configurations have the highest precedence and are immutable by users.

### Enterprise Configuration Files

**Managed MCP Servers** (`managed-mcp.json`):
- **Linux**: `/etc/claude-code/managed-mcp.json`
- **macOS**: `/Library/Application Support/ClaudeCode/managed-mcp.json`
- **Windows**: `C:\ProgramData\ClaudeCode\managed-mcp.json`

Contains `mcpServers` object with enterprise-deployed servers that:
- Cannot be disabled or modified by users
- Have highest precedence (priority 4)
- Always shown with 🏢 indicator
- Bypass allowlist restrictions (but NOT denylist)

**Access Policies** (`managed-settings.json`):
- Same locations as above
- Contains `allowedMcpServers` and `deniedMcpServers` arrays
- Controls which non-enterprise servers users can enable

### Access Control Rules

**Truth Table** (from ENTERPRISE_FEATURE_PLAN.md lines 142-154):

| allowedMcpServers | deniedMcpServers | Server | Scope | Result | Reason |
|-------------------|------------------|--------|-------|--------|--------|
| undefined | undefined | any | any | ✅ Allowed | No restrictions |
| undefined | [fetch] | fetch | user | ❌ Blocked | In denylist |
| undefined | [fetch] | fetch | enterprise | ❌ Blocked | Denylist is absolute |
| [] | undefined | any | user | ❌ Blocked | Empty allowlist = lockdown |
| [] | undefined | any | enterprise | ✅ Allowed | Enterprise bypasses allowlist |
| [github] | undefined | github | any | ✅ Allowed | In allowlist |
| [github] | undefined | fetch | user | ❌ Blocked | Not in allowlist |
| [github] | [github] | github | any | ❌ Blocked | Denylist wins |

**Key Rules**:
1. **Denylist is absolute** - Blocks across ALL scopes (including enterprise)
2. **Allowlist applies to user/project only** - Enterprise servers bypass
3. **Empty allowlist = lockdown** - Blocks all non-enterprise servers
4. **Undefined = no restriction** - Allow all
5. **Contradictions** - Denylist takes precedence

### State File Format (Extended)

**Previous format (v1.2.0)**:
```
state:server:scope:file:type
```

**New format (v1.3.0)**:
```
state:server:scope:file:type:flags
```

**Flags**:
- `e` = enterprise-managed (immutable)
- `b` = blocked by denylist
- `r` = restricted (not in allowlist)
- Empty = normal server

**Examples**:
```bash
on:company-api:enterprise:/etc/.../managed-mcp.json:mcpjson:e     # Enterprise
off:filesystem:user:~/.mcp.json:mcpjson:b                         # Blocked
off:random:project:./.mcp.json:mcpjson:r                          # Restricted
on:github:user:~/.mcp.json:mcpjson:                               # Normal
```

### UI Indicators

**Visual Markers**:
- 🏢 ● = Enterprise-managed (cannot modify)
- 🔒 ○ = Blocked by denylist (cannot enable)
- ⚠️ ○ = Not in allowlist (cannot enable)
- ● = Normal enabled
- ○ = Normal disabled

**Enterprise Banner** (shown when policies active):
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 Enterprise Policies Active
   • 2 enterprise-managed servers (cannot be modified)
   • Access restricted to 5 approved servers
   • 1 servers blocked by policy
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Lockdown Mode

**Trigger**: Invalid JSON in `managed-settings.json`

**Behavior**:
- `ENTERPRISE_MODE="lockdown"`
- Only enterprise servers available
- All user/project servers blocked
- Prominent warning displayed
- Fail-safe security default

**Rationale**: If IT cannot parse restrictions, better to block everything than risk exposing blocked servers.

### Toggle Validation

**Three validation points in `toggle_server()`** (lines 1405-1432):

1. **Enterprise-managed check** (flag `e`):
   - Error: "Cannot modify enterprise-managed server"
   - Action: Contact IT administrator

2. **Blocked server check** (flag `b`, trying to enable):
   - Error: "Cannot enable blocked server"
   - Reason: Server in denylist

3. **Restricted server check** (flag `r`, trying to enable):
   - Error: "Cannot enable restricted server"
   - Reason: Not in allowlist

### Precedence Update

**Previous** (v1.2.0):
- Priority 3: Local
- Priority 2: Project
- Priority 1: User

**New** (v1.3.0):
- **Priority 4: Enterprise** (highest, immutable)
- Priority 3: Local
- Priority 2: Project
- Priority 1: User

### Implementation Details

**Platform Detection**:
- Detects WSL (checks both Windows and Linux paths)
- Handles macOS paths with spaces
- Graceful fallback if files don't exist

**Security**:
- Invalid JSON → Lockdown mode
- Denylist absolute priority
- Enterprise servers cannot be overridden
- Clear error messages guide users to IT

**Backward Compatibility**:
- 100% compatible with v1.2.0 state files
- Flags field optional (17 locations check `[[ -z "$flags" ]]`)
- No enterprise files = normal operation
- Zero breaking changes

### Marketplace Restrictions

**`strictKnownMarketplaces`** (NEW):
Restricts which marketplace sources users can install plugins from:

```json
{
  "strictKnownMarketplaces": [
    { "source": "github", "repo": "acme-corp/approved-plugins" }
  ]
}
```

**Behaviour**:
- Empty array `[]` = Lockdown mode (no marketplace additions allowed)
- Undefined = No restrictions (users can add any marketplace)
- Only listed sources are permitted for plugin installation

## Enterprise Feature Completion (Phase G)

### Enhanced Restriction Matching

Phase G extends enterprise restrictions beyond simple server names to support three matching types:

**1. serverName Matching** (Original):
```json
{
  "allowedMcpServers": [{ "serverName": "github" }],
  "deniedMcpServers": [{ "serverName": "fetch" }]
}
```

**2. serverCommand Matching** (NEW):
Match servers by their exact command and arguments array:
```json
{
  "deniedMcpServers": [
    { "serverCommand": ["npx", "-y", "mcp-server-github"] }
  ]
}
```
- Exact array match required (order and values must match)
- Useful for blocking specific executables regardless of server name

**3. serverUrl Matching** (NEW):
Match http/sse transport servers by URL pattern:
```json
{
  "allowedMcpServers": [
    { "serverUrl": "https://*.company.com/*" }
  ]
}
```
- Supports wildcards: `*` matches any characters
- Only applies to servers with `"type": "http"` or `"type": "sse"`

### Exclusive Enterprise Mode

When `managed-mcp.json` exists AND contains a `mcpServers` object:
- `EXCLUSIVE_ENTERPRISE_MODE=true`
- Users cannot add ANY servers
- Only enterprise-defined servers are available
- Banner displays: "Only enterprise-defined servers allowed"

### Marketplace Lockdown

When `strictKnownMarketplaces` is an empty array `[]`:
- `MARKETPLACE_LOCKDOWN=true`
- No new plugins can be installed from any marketplace
- Banner displays: "Plugin marketplace disabled by policy"

### Windows Path Support (WSL)

Phase G adds support for official Windows paths on WSL:
- `/mnt/c/ProgramData/ClaudeCode/...` (existing)
- `/mnt/c/Program Files/ClaudeCode/...` (NEW - official path per Claude Code docs)

Path checking order:
1. `/mnt/c/ProgramData/ClaudeCode/...`
2. `/mnt/c/Program Files/ClaudeCode/...`
3. `/etc/claude-code/...` (Linux fallback on WSL)

### Enhanced Banner Display

The enterprise banner now shows:
- Exclusive control mode status
- Command-based restriction counts
- URL-based restriction counts
- Marketplace restriction status

Example:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 Enterprise Policies Active
   • 2 enterprise-managed servers (cannot be modified)
   • Only enterprise-defined servers allowed
   • Access restricted to 5 approved servers (by name)
   • Command restrictions active (Blocked: 3)
   • URL restrictions active (Allowed: 2)
   • Plugin marketplace restricted to 1 sources
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### New Helper Functions (Phase G)

- `server_matches_command_restriction()` - Check command array against restrictions
- `server_matches_url_restriction()` - Check URL against wildcard patterns
- `get_server_command_json()` - Extract command+args as JSON array
- `get_server_url()` - Extract URL for http/sse servers
- `get_server_transport_type()` - Detect stdio/http/sse transport

### New Global Variables (Phase G)

```bash
EXCLUSIVE_ENTERPRISE_MODE=false  # Only enterprise servers allowed
MARKETPLACE_LOCKDOWN=false       # Marketplace disabled

# Command restrictions (JSON arrays)
declare -a ALLOWED_COMMANDS=()
declare -a DENIED_COMMANDS=()

# URL restrictions (wildcard patterns)
declare -a ALLOWED_URLS=()
declare -a DENIED_URLS=()

# Marketplace restrictions (JSON objects)
declare -a STRICT_MARKETPLACES=()
```

## Native Claude Code CLI Reference

This section documents the native Claude Code CLI commands for MCP server management. These are built-in commands provided by Claude Code itself.

### Session-Only Flags

Control which servers are active for a single Claude session without modifying configuration files:

```bash
# Enable specific servers for this session only
claude --mcp-servers="fetch,filesystem"

# Disable specific servers for this session only
claude --no-mcp-servers="github,postgres"
```

These flags override configuration files for the current session only.

### MCP Management Commands

```bash
# List all configured MCP servers with their status
claude mcp list

# Add a stdio-based MCP server
claude mcp add <name> -- <command> [args...]

# Add an HTTP or SSE transport server
claude mcp add <name> -t http <url>
claude mcp add <name> -t sse <url>

# Add server from JSON definition
claude mcp add-json <name> '<json>'

# Remove an MCP server
claude mcp remove <name>

# Reset project approval prompts for MCP servers
claude mcp reset-project-choices
```

### Configuration Flags

```bash
# Load MCP configuration from a specific file
claude --mcp-config ./custom-mcp.json

# Use ONLY the specified config (ignore other sources)
claude --strict-mcp-config

# Set scope when adding servers (project or user)
claude mcp add <name> --scope project -- <command>
claude mcp add <name> --scope user -- <command>
```

### In-Session Commands

When inside a Claude session, use the `/mcp` command for interactive server management:

```
/mcp
```

This opens an interactive interface for enabling/disabling servers during the current session. Changes made via `/mcp` are session-only and do not persist to configuration files.

## Transport Types

MCP servers support three transport types for communication between Claude Code and the server process.

### Transport Type Reference

| Type | Config Format | Description |
|------|---------------|-------------|
| `stdio` | `{ "command": "...", "args": [...], "env": {...} }` | Default. Subprocess communication via stdin/stdout |
| `http` | `{ "type": "http", "url": "https://...", "headers": {...} }` | HTTP request/response transport |
| `sse` | `{ "type": "sse", "url": "https://...", "headers": {...} }` | Server-Sent Events for streaming |

### stdio Transport (Default)

The default transport type. Server runs as a subprocess:

```json
{
  "mcpServers": {
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"],
      "env": {
        "TIMEOUT": "30"
      }
    }
  }
}
```

### HTTP Transport

For servers accessible via HTTP endpoints:

```json
{
  "mcpServers": {
    "github-api": {
      "type": "http",
      "url": "https://api.example.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}"
      }
    }
  }
}
```

### SSE Transport

For servers using Server-Sent Events:

```json
{
  "mcpServers": {
    "streaming-server": {
      "type": "sse",
      "url": "https://stream.example.com/mcp/",
      "headers": {
        "X-API-Key": "${SSE_API_KEY}"
      }
    }
  }
}
```

## Environment Variable Expansion

MCP server configurations support environment variable expansion using shell-style syntax.

### Expansion Syntax

```
${VAR}           - Expand to environment variable value
${VAR:-default}  - Expand with default if VAR is unset or empty
```

### Supported Fields

Environment variable expansion works in the following configuration fields:
- `command` - The server executable
- `args` - Command arguments array
- `env` - Environment variables passed to server
- `url` - HTTP/SSE endpoint URLs
- `headers` - HTTP headers

### Examples

```json
{
  "mcpServers": {
    "database": {
      "command": "${HOME}/.local/bin/db-server",
      "args": ["--port", "${DB_PORT:-5432}"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}",
        "LOG_LEVEL": "${LOG_LEVEL:-info}"
      }
    },
    "api-gateway": {
      "type": "http",
      "url": "${API_GATEWAY_URL:-https://localhost:8080}/mcp/",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}",
        "X-Environment": "${NODE_ENV:-development}"
      }
    }
  }
}
```

**Note**: If a required environment variable is not set and no default is provided, the server may fail to start. Always provide sensible defaults where possible.

## New Project Flow

When run in a directory without local configuration:
1. Detects global configuration exists
2. Prompts user to:
   - Create local config (copies global as template)
   - Continue with global only (changes still saved locally)
   - Abort
3. If user continues, changes are always saved to `./.claude/settings.local.json`
