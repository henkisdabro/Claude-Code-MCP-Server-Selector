# Configuration Reference

Detailed documentation of configuration sources, control arrays, and precedence rules.

## Configuration Sources

### Enterprise Scope (Priority 4 - Highest, Immutable)

- `/etc/claude-code/managed-mcp.json` (Linux)
- `/Library/Application Support/ClaudeCode/managed-mcp.json` (macOS)
- `/mnt/c/ProgramData/ClaudeCode/managed-mcp.json` (WSL)
- `/mnt/c/Program Files/ClaudeCode/managed-mcp.json` (WSL - official path)

### Local Scope (Priority 3)

- `./.claude/settings.local.json` - Project-local settings (gitignored)

### Project Scope (Priority 2)

- `./.claude/settings.json` - Project-shared settings
- `./.mcp.json` - Project MCP server definitions

### User Scope (Priority 1 - Lowest)

- `~/.claude/settings.local.json` - User-local settings
- `~/.claude/settings.json` - User-global settings
- `~/.claude.json` - Main user configuration
- `~/.mcp.json` - User MCP server definitions

### Plugin Sources (User Scope)

- `~/.claude/plugins/marketplaces/{MARKETPLACE}/.claude-plugin/marketplace.json`
- `~/.claude/plugins/marketplaces/{MARKETPLACE}/{PLUGIN}/.mcp.json`

## Two Separate Concepts

### Concept 1: Server Definitions

The `mcpServers` object defines WHAT servers exist and HOW to run them.

```json
{
  "mcpServers": {
    "fetch": { "command": "uvx", "args": ["mcp-server-fetch"] },
    "time": { "command": "uvx", "args": ["mcp-server-time"] }
  }
}
```

Can exist in: Any configuration file.

### Concept 2: Enable/Disable State

Control arrays determine WHETHER servers are active.

## Control Arrays Reference

| Array | Valid Locations | Invalid Locations | Controls |
|-------|-----------------|-------------------|----------|
| `enabledMcpjsonServers` | `.claude/settings*.json` | `~/.claude.json` | .mcp.json servers |
| `disabledMcpjsonServers` | `.claude/settings*.json` | `~/.claude.json` | .mcp.json servers |
| `disabledMcpServers` | `~/.claude.json` only | `.claude/settings*.json` | Direct servers |
| `enabledPlugins` | `.claude/settings*.json` | `~/.claude.json` | Plugin servers |
| `enableAllProjectMcpServers` | `.claude/settings*.json` | `~/.claude.json` | Master switch |
| `allowedMcpServers` | `managed-settings.json` | All others | Enterprise allow |
| `deniedMcpServers` | `managed-settings.json` | All others | Enterprise deny |
| `strictKnownMarketplaces` | `managed-settings.json` | All others | Marketplace lock |

## Server Types

### MCPJSON Servers

- **Source**: `.mcp.json` files
- **Control**: `enabledMcpjsonServers` / `disabledMcpjsonServers`
- **Master Switch**: `enableAllProjectMcpServers`

```json
{
  "enabledMcpjsonServers": ["fetch", "time"],
  "disabledMcpjsonServers": ["github"],
  "enableAllProjectMcpServers": true
}
```

### Direct Servers

- **Source**: `~/.claude.json` root `.mcpServers` or `.projects[cwd].mcpServers`
- **Control**: `disabledMcpServers` in `~/.claude.json`
- **Important**: `disabledMcpServers` ONLY works in `~/.claude.json`

```json
{
  "projects": {
    "/path/to/project": {
      "disabledMcpServers": ["time", "fetch"]
    }
  }
}
```

### Plugin Servers

- **Source**: Marketplace installations
- **Control**: `enabledPlugins` object in settings files
- **Format**: `plugin-name@marketplace-name`

```json
{
  "enabledPlugins": {
    "developer-toolkit@wookstar-claude-code-plugins": true,
    "mcp-fetch@claudecode-marketplace": false
  }
}
```

**Critical Issue**: Setting to `false` makes plugin disappear from UI entirely.

**Workaround**: Omit instead of setting false for soft disable.

### Plugin Format in disabledMcpServers

When disabling plugin servers via `disabledMcpServers`:

```
plugin:PLUGIN_NAME:SERVER_NAME
```

Example: `plugin:developer-toolkit:chrome-devtools`

## Scope Precedence

| Priority | Scope | Files |
|----------|-------|-------|
| 4 | **Enterprise** | `managed-*.json` |
| 3 | **Local** | `./.claude/settings.local.json` |
| 2 | **Project** | `./.claude/settings.json` |
| 1 | **User** | `~/.claude/settings*.json` |

**Special Case**: `disabledMcpServers` in `~/.claude.json`:

- Root level = user scope (priority 1)
- `.projects[cwd]` = local scope (priority 3)

## Dual Precedence Resolution

Definition and state are resolved INDEPENDENTLY.

### Definition Precedence

When same server defined in multiple files:

```
Local ./.mcp.json > Project ./.mcp.json > User ~/.mcp.json
```

### State Precedence

When same server enabled/disabled in multiple files:

```
Local settings > Project settings > User settings
```

### Example

```
User scope: fetch defined + enabled
Project scope: fetch defined with different args + disabled
Result: Uses project definition + disabled state
```

## Transport Types

| Type | Config Format | Description |
|------|---------------|-------------|
| `stdio` | `{ "command": "...", "args": [...] }` | Default, subprocess |
| `http` | `{ "type": "http", "url": "..." }` | HTTP transport |
| `sse` | `{ "type": "sse", "url": "..." }` | Server-Sent Events |

## Environment Variable Expansion

Supported syntax:

```
${VAR}           - Expand variable
${VAR:-default}  - Expand with default
```

Supported fields: `command`, `args`, `env`, `url`, `headers`

Example:

```json
{
  "mcpServers": {
    "database": {
      "command": "${HOME}/.local/bin/db-server",
      "args": ["--port", "${DB_PORT:-5432}"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    }
  }
}
```

## Native Claude Code CLI Reference

### Session-Only Flags

```bash
claude --mcp-servers="fetch,filesystem"    # Enable for session
claude --no-mcp-servers="github,postgres"  # Disable for session
```

### MCP Management Commands

```bash
claude mcp list                            # List all servers
claude mcp add <name> -- <command> [args]  # Add stdio server
claude mcp add <name> -t http <url>        # Add HTTP server
claude mcp add-json <name> '<json>'        # Add from JSON
claude mcp remove <name>                   # Remove server
claude mcp reset-project-choices           # Reset approvals
```

### Configuration Flags

```bash
claude --mcp-config ./custom-mcp.json      # Use specific config
claude --strict-mcp-config                 # Only use specified config
claude mcp add <name> --scope project      # Set scope when adding
```
