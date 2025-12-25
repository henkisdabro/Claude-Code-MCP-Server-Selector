# Known Claude Code MCP Bugs and Workarounds

This document tracks known bugs in Claude Code's MCP server handling and the workarounds provided by the MCP Server Selector tool.

## Bug #13311: disabledMcpServers Not Enforced at Session Start

**GitHub Issue**: [anthropics/claude-code#13311](https://github.com/anthropics/claude-code/issues/13311)

**Symptom**: Servers listed in `disabledMcpServers` array in `~/.claude.json` are shown as disabled in the UI, but Claude can still use them when starting a new session.

**Impact**:
- Disabled servers connect on session start
- Claude can call tools from "disabled" servers
- User expectation of disabled state is violated

**Affected Configuration**:
```json
// ~/.claude.json
{
  "projects": {
    "/path/to/project": {
      "disabledMcpServers": ["server-name"]
    }
  }
}
```

**Workaround**:
```bash
# Convert ORANGE (runtime-disabled) servers to RED (config-disabled)
./mcp --strict-disable

# Or use before launching Claude
./mcp --strict-disable && claude
```

**Detection**:
```bash
# Check if this bug is affecting your setup
./mcp --sync-check
```

---

## Bug #11370: Disabled Servers Still Consume Context Tokens

**GitHub Issue**: [anthropics/claude-code#11370](https://github.com/anthropics/claude-code/issues/11370)

**Symptom**: Even when MCP servers are disabled, their tool definitions are still loaded into the context window, consuming ~400-650 tokens per disabled server.

**Impact**:
- Reduced effective context window
- Wasted tokens on unused tool definitions
- Higher costs for no benefit

**Workaround**:
```bash
# See how many tokens are being wasted
./mcp --context-report

# Fully remove disabled servers from context
./mcp --strict-disable

# Or permanently remove servers you don't need
claude mcp remove <server-name>
```

---

## Bug #7936: Removed Servers Still Show in /mcp Command

**GitHub Issue**: [anthropics/claude-code#7936](https://github.com/anthropics/claude-code/issues/7936)

**Symptom**: After removing an MCP server using `claude mcp remove`, the server still appears in the `/mcp` slash command UI.

**Impact**:
- UI confusion
- Users think removal didn't work
- CLI reports no servers, but UI shows them

**Root Cause**: The `/mcp` command aggregates servers from both global and project-specific configurations, while `claude mcp remove` only removes from the global scope.

**Workaround**:
- Restart the Claude Code session after removing servers
- Use this tool to manage servers instead (handles all scopes correctly)

---

## Bug #14490: --strict-mcp-config Doesn't Override disabledMcpServers

**GitHub Issue**: [anthropics/claude-code#14490](https://github.com/anthropics/claude-code/issues/14490)

**Symptom**: The `--strict-mcp-config` flag doesn't properly override `disabledMcpServers` settings.

**Impact**:
- Cannot use CLI flag to ensure disabled state
- Related to Bug #13311

**Workaround**:
```bash
# Use our --strict-disable instead
./mcp --strict-disable
```

---

## Plugin UI Disappearance Issue

**Not a Bug** (by design, but unexpected behavior)

**Symptom**: When you set `enabledPlugins["plugin@marketplace"] = false` in a settings file, the plugin completely disappears from the Claude Code UI and cannot be re-enabled without editing the config file.

**Impact**:
- Plugin becomes invisible in UI
- User cannot re-enable via UI
- Must edit config manually to restore

**Our Solution**:
- **Soft disable** (default): Omit plugin from enabledPlugins (allows UI re-enable)
- **Hard disable** (ALT-H): Set explicit false (hides from UI)

**Recovery**:
```bash
# Restore a hard-disabled plugin
./mcp --restore-plugin "plugin-name@marketplace"
```

---

## In-Session Toggles Not Persisted

**Not a Bug** (by design)

**Symptom**: Toggling MCP servers via the `@mention` interface or `/mcp` command during a session only affects that session. Changes are lost when the session ends.

**Impact**:
- Users expect changes to persist
- Must reconfigure each session
- No way to save in-session preferences

**Workaround**:
```bash
# Use this tool for persistent configuration
./mcp

# Or configure hooks to apply state on session start
# .claude/settings.json
{
  "hooks": {
    "SessionStart": [{
      "type": "command",
      "command": "./mcp --strict-disable --quiet"
    }]
  }
}
```

---

## Missing CLI Enable/Disable Commands

**Feature Request** (not a bug)

**GitHub Issue**: [anthropics/claude-code#10447](https://github.com/anthropics/claude-code/issues/10447)

**Symptom**: There are no `claude mcp enable` or `claude mcp disable` CLI commands.

**Impact**:
- Cannot automate MCP state in hooks
- Must use in-session UI for toggles
- Cannot script MCP management

**Workaround**:
This tool provides CLI-equivalent functionality:
```bash
# Interactive TUI for enable/disable
./mcp

# Export disabled servers for hooks
./mcp --export-disabled --quiet

# Check sync status
./mcp --sync-check
```

---

## Tool Detection Commands

Use these commands to detect which bugs may be affecting your setup:

```bash
# Full configuration audit
./mcp --audit

# Check for sync issues (Bug #13311)
./mcp --sync-check

# See context token waste (Bug #11370)
./mcp --context-report

# Debug specific server state
./mcp --debug-precedence <server-name>
```

---

## Reporting New Bugs

If you discover a new bug in Claude Code's MCP handling:

1. Check the [Claude Code GitHub Issues](https://github.com/anthropics/claude-code/issues) to see if it's already reported
2. If new, file an issue with:
   - Steps to reproduce
   - Expected vs actual behavior
   - Configuration files (redacted)
   - Claude Code version (`claude --version`)
3. Update this file with the workaround once available

---

## Version Compatibility

| Claude Code Version | Known Issues |
|---------------------|--------------|
| < 2.0.10 | No in-session toggles |
| 2.0.10+ | #13311, #11370, #7936 |
| Latest | All above + UI improvements |

This tool is tested against Claude Code v2.0.10 and later.
