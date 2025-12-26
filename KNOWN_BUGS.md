# Known Claude Code MCP Bugs and Workarounds

This document tracks known bugs in Claude Code's MCP server handling and the workarounds provided by the MCP Server Selector tool.

---

## Bug #6320: Disabled Servers Still Consume Context Tokens

**GitHub Issue**: [anthropics/claude-code#6320](https://github.com/anthropics/claude-code/issues/6320)

**Status**: OPEN (as of v2.0.76)

**Symptom**: Even when MCP servers are disabled, their tool definitions are still loaded into the context window, consuming ~400-650 tokens per disabled server. Disabled servers appear in `/context` under plugins.

**Impact**:
- Reduced effective context window
- Wasted tokens on unused tool definitions
- Higher costs for no benefit

**Note**: Issue #11370 was closed as a duplicate of this issue.

**Workaround**:
```bash
# See how many tokens are being wasted
./mcp --context-report

# Permanently remove servers you don't need
claude mcp remove <server-name>
```

---

## Plugin UI Disappearance Issue

**Not a Bug** (by design, but unexpected behaviour)

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
# Enable/disable specific servers
./mcp enable <server-name>
./mcp disable <server-name>

# Interactive TUI for enable/disable
./mcp

# Export disabled servers for hooks
./mcp --export-disabled --quiet
```

---

## Tool Detection Commands

Use these commands to detect which bugs may be affecting your setup:

```bash
# Full configuration audit
./mcp --audit

# Check for sync issues
./mcp --sync-check

# See context token waste (Bug #6320)
./mcp --context-report

# Debug specific server state
./mcp --debug-precedence <server-name>
```

---

## Fixed Bugs (Historical Reference)

These bugs have been fixed in recent Claude Code versions but are documented here for historical reference.

### Bug #13311: disabledMcpServers Not Enforced at Session Start

**GitHub Issue**: [anthropics/claude-code#13311](https://github.com/anthropics/claude-code/issues/13311)

**Status**: FIXED in v2.0.76

**Original Symptom**: Servers listed in `disabledMcpServers` array were shown as disabled in the UI, but Claude could still use them when starting a new session.

### Bug #7936: Removed Servers Still Show in /mcp Command

**GitHub Issue**: [anthropics/claude-code#7936](https://github.com/anthropics/claude-code/issues/7936)

**Status**: FIXED in v2.0.76

**Original Symptom**: After removing an MCP server using `claude mcp remove`, the server still appeared in the `/mcp` slash command UI.

### Bug #14490: --strict-mcp-config Doesn't Override disabledMcpServers

**GitHub Issue**: [anthropics/claude-code#14490](https://github.com/anthropics/claude-code/issues/14490)

**Status**: FIXED in v2.0.76

**Original Symptom**: The `--strict-mcp-config` flag didn't properly override `disabledMcpServers` settings.

---

## Reporting New Bugs

If you discover a new bug in Claude Code's MCP handling:

1. Check the [Claude Code GitHub Issues](https://github.com/anthropics/claude-code/issues) to see if it's already reported
2. If new, file an issue with:
   - Steps to reproduce
   - Expected vs actual behaviour
   - Configuration files (redacted)
   - Claude Code version (`claude --version`)
3. Update this file with the workaround once available

---

## Version Compatibility

| Claude Code Version | Known Issues |
|---------------------|--------------|
| < 2.0.10 | No in-session toggles |
| 2.0.10 - 2.0.75 | #13311, #6320, #7936, #14490 |
| 2.0.76+ | #6320 only (context tokens) |

This tool is tested against Claude Code v2.0.76.
