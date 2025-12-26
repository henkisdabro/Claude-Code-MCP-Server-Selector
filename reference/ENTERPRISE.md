# Enterprise Features Reference

Detailed documentation for enterprise-managed MCP configurations.

## Overview

Enterprise configurations have highest precedence (priority 4) and are immutable by users.

## Configuration Files

### Managed MCP Servers

| Platform | Path |
|----------|------|
| Linux | `/etc/claude-code/managed-mcp.json` |
| macOS | `/Library/Application Support/ClaudeCode/managed-mcp.json` |
| Windows | `C:\ProgramData\ClaudeCode\managed-mcp.json` |
| WSL | `/mnt/c/ProgramData/ClaudeCode/...` or `/mnt/c/Program Files/ClaudeCode/...` |

### Access Policies

Same paths but `managed-settings.json`.

## Access Control Rules

### Truth Table

| allowedMcpServers | deniedMcpServers | Server | Scope | Result | Reason |
|-------------------|------------------|--------|-------|--------|--------|
| undefined | undefined | any | any | Allowed | No restrictions |
| undefined | [fetch] | fetch | user | Blocked | In denylist |
| undefined | [fetch] | fetch | enterprise | Blocked | Denylist is absolute |
| [] | undefined | any | user | Blocked | Empty allowlist = lockdown |
| [] | undefined | any | enterprise | Allowed | Enterprise bypasses allowlist |
| [github] | undefined | github | any | Allowed | In allowlist |
| [github] | undefined | fetch | user | Blocked | Not in allowlist |
| [github] | [github] | github | any | Blocked | Denylist wins |

### Key Rules

1. **Denylist is absolute** - Blocks across ALL scopes (including enterprise)
2. **Allowlist applies to user/project only** - Enterprise servers bypass
3. **Empty allowlist = lockdown** - Blocks all non-enterprise servers
4. **Undefined = no restriction** - Allow all
5. **Contradictions** - Denylist takes precedence

## Phase G: Enhanced Restriction Matching

### serverName Matching (Original)

```json
{
  "allowedMcpServers": [{ "serverName": "github" }],
  "deniedMcpServers": [{ "serverName": "fetch" }]
}
```

### serverCommand Matching

Match by exact command and arguments array:

```json
{
  "deniedMcpServers": [
    { "serverCommand": ["npx", "-y", "mcp-server-github"] }
  ]
}
```

Exact array match required (order and values must match).

### serverUrl Matching

Match http/sse transport servers by URL pattern:

```json
{
  "allowedMcpServers": [
    { "serverUrl": "https://*.company.com/*" }
  ]
}
```

Supports wildcards: `*` matches any characters.

## Exclusive Enterprise Mode

When `managed-mcp.json` exists AND contains `mcpServers`:

- `EXCLUSIVE_ENTERPRISE_MODE=true`
- Users cannot add ANY servers
- Only enterprise-defined servers available

## Marketplace Lockdown

When `strictKnownMarketplaces` is empty array `[]`:

- `MARKETPLACE_LOCKDOWN=true`
- No plugins can be installed from any marketplace

Format:

```json
{
  "strictKnownMarketplaces": [
    { "source": "github", "repo": "acme-corp/approved-plugins" }
  ]
}
```

## Lockdown Mode

**Trigger**: Invalid JSON in `managed-settings.json`

**Behaviour**:

- `ENTERPRISE_MODE="lockdown"`
- Only enterprise servers available
- All user/project servers blocked
- Fail-safe security default

## UI Indicators

| Indicator | Meaning |
|-----------|---------|
| `*` (building emoji) | Enterprise-managed (immutable) |
| `o` (lock emoji) | Blocked by denylist |
| `o` (warning emoji) | Not in allowlist |

## State File Format

Enterprise servers use extended format:

```
state:server:scope:file:type:flags
```

Flags:

- `e` = enterprise-managed (immutable)
- `b` = blocked by denylist
- `r` = restricted (not in allowlist)

## Toggle Validation

Three validation points in `toggle_server()`:

1. **Enterprise-managed check** (flag `e`):
   - Error: "Cannot modify enterprise-managed server"

2. **Blocked server check** (flag `b`, trying to enable):
   - Error: "Cannot enable blocked server"

3. **Restricted server check** (flag `r`, trying to enable):
   - Error: "Cannot enable restricted server"

## Backward Compatibility

- 100% compatible with pre-enterprise state files
- Flags field optional (checked with `[[ -z "$flags" ]]`)
- No enterprise files = normal operation
