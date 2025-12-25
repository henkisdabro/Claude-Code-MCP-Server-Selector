# MCP Server Selector Improvement Plan v2.1 - Integration Update

## Overview

This addendum addresses new findings about Claude Code's built-in MCP features (December 2025) and how our tool should integrate with or complement them.

---

## Part 1: Claude Code Built-in MCP Features Analysis

### 1.1 Current Claude Code MCP Commands

| Command | Status | Notes |
|---------|--------|-------|
| `claude mcp add <name> <cmd>` | ✅ Available | Add server to config |
| `claude mcp add-json <name> '<json>'` | ✅ Available | Add with full JSON |
| `claude mcp remove <name>` | ✅ Available | Permanent removal |
| `claude mcp list` | ✅ Available | Show all servers |
| `claude mcp get <name>` | ✅ Available | Server details |
| `claude mcp enable <name>` | ❌ NOT AVAILABLE | Feature request #10447 |
| `claude mcp disable <name>` | ❌ NOT AVAILABLE | Feature request #10447 |
| `claude mcp status` | ❌ NOT AVAILABLE | Feature request #10447 |

### 1.2 In-Session UI Features (v2.0.10+)

| Feature | Description | Persistence |
|---------|-------------|-------------|
| `/mcp` slash command | View all configured MCP servers | Read-only view |
| `@mention` toggle | Enable/disable via @ autocomplete menu | **Session-only** (not saved) |
| Context awareness | Shows which servers consume context tokens | Informational |

**Critical Limitation**: In-session toggles via `@mention` are NOT persisted to config files. When session ends, state is lost.

### 1.3 Known Bugs (Confirmed)

| Bug | Issue | Impact | Our Workaround |
|-----|-------|--------|----------------|
| #13311 | `disabledMcpServers` not enforced at startup | Disabled servers still connect | `--strict-disable` flag |
| #11370 | Disabled servers consume context tokens | ~400-650 tokens per disabled server | Track and warn |
| #7936 | Removed servers still show in `/mcp` | UI confusion | N/A (Claude bug) |
| #14490 | `--strict-mcp-config` doesn't override disabled | Flag ineffective | `--strict-disable` |

---

## Part 2: Our Tool's Unique Value Proposition

### 2.1 What Claude Code Can't Do (Our Gaps to Fill)

| Capability | Claude Built-in | Our Tool |
|------------|-----------------|----------|
| **Persistent enable/disable** | ❌ Session-only | ✅ Writes to config |
| **CLI enable/disable** | ❌ Not available | ✅ TUI + commands |
| **Dual precedence resolution** | ❌ No visibility | ✅ `--debug-precedence` |
| **3-way toggle (RED/GREEN/ORANGE)** | ❌ Binary only | ✅ Full state machine |
| **Direct server migration** | ❌ Manual only | ✅ ALT-M guided |
| **Enterprise policy support** | ❌ Basic | ✅ Full with lockdown |
| **Plugin hard-disable recovery** | ❌ Manual config edit | ✅ `--restore-plugin` |
| **Configuration audit** | ❌ No | ✅ `--audit` |
| **Hook automation** | ❌ Cannot toggle | ✅ Config manipulation |
| **Batch operations** | ❌ One at a time | ✅ ALT-E/ALT-D |
| **Filter by type** | ❌ No | ✅ ALT-1 through ALT-4 |

### 2.2 Integration Opportunities

**Complement, Don't Compete:**
- Our tool for **pre-session configuration**
- Claude's `/mcp` and `@mention` for **in-session adjustments**
- Our tool for **automation via hooks**

---

## Part 3: Recommended Changes

### 3.1 Naming Consideration ⚠️

**Issue**: Our script is named `mcp`, Claude has `/mcp` slash command.

**Options:**
1. **Keep `mcp`** - Different contexts (shell vs in-session), no conflict
2. **Rename to `mcp-select`** - More descriptive, avoids confusion
3. **Rename to `mcpctl`** - Follows systemd conventions (`systemctl`, `journalctl`)

**Recommendation**: Keep `mcp` for now. Consider `mcpctl` alias for v3.0.

### 3.2 New Integration Features

#### 3.2.1 Session-Aware Mode

```bash
# Detect if running inside Claude Code session
if [[ -n "$CLAUDE_SESSION_ID" ]]; then
    msg_info "Running inside Claude session"
    msg_warning "Changes will take effect on next session restart"
fi
```

#### 3.2.2 Context Token Estimation

Track approximate context usage per server:

```bash
# Add to server display
show_context_impact() {
    local server="$1"
    local tools_count=$(claude mcp get "$server" 2>/dev/null | jq '.tools | length' 2>/dev/null || echo "?")
    local approx_tokens=$((tools_count * 50))  # ~50 tokens per tool definition
    echo "~${approx_tokens} tokens"
}

# TUI display: [ON] fetch (project, mcpjson) ~450 tokens
```

#### 3.2.3 Sync Status Indicator

Show if in-session state differs from config:

```bash
# Compare claude mcp list output with config
show_sync_status() {
    local config_state="$1"
    local runtime_state=$(claude mcp list 2>/dev/null | grep "$server" | ...)

    if [[ "$config_state" != "$runtime_state" ]]; then
        echo "⚡ out of sync"  # In-session toggle differs
    fi
}
```

#### 3.2.4 Hook Integration Helpers

```bash
# New command: Generate hook-compatible output
./mcp --export-disabled
# Output: fetch,github,stripe
# Use in SessionStart hook to enforce state

# SessionStart hook example
# .claude/settings.json
{
  "hooks": {
    "SessionStart": [{
      "type": "command",
      "command": "./mcp --export-disabled | xargs -I{} echo 'Disabled: {}'"
    }]
  }
}
```

### 3.3 Bug Workaround Improvements

#### 3.3.1 Enhanced --strict-disable

```bash
# Current: Converts ORANGE to RED
# Enhanced: Also warns about context token waste

apply_strict_disable() {
    local orange_count=0
    local token_waste=0

    while read -r line; do
        # ... existing logic ...
        if [[ "$runtime" == "stopped" ]]; then
            orange_count=$((orange_count + 1))
            # Estimate wasted tokens
            token_waste=$((token_waste + 500))  # Average per server
        fi
    done < "$STATE_FILE"

    if [[ $orange_count -gt 0 ]]; then
        msg_warning "Converting $orange_count ORANGE servers to RED"
        msg_warning "This saves ~$token_waste context tokens per session"
    fi
}
```

#### 3.3.2 Audit for Context Waste

```bash
# Add to --audit output
audit_context_waste() {
    echo "=== Context Token Analysis ==="
    local total_tools=0
    local disabled_tools=0

    while read -r line; do
        local state=$(echo "$line" | cut -d: -f1)
        local server=$(echo "$line" | cut -d: -f2)
        local tools=$(claude mcp get "$server" 2>/dev/null | jq '.tools | length' 2>/dev/null || echo 0)

        total_tools=$((total_tools + tools))
        if [[ "$state" == "off" ]]; then
            disabled_tools=$((disabled_tools + tools))
        fi
    done < "$STATE_FILE"

    echo "Total tools defined: $total_tools (~$((total_tools * 50)) tokens)"
    echo "Disabled but loaded: $disabled_tools (~$((disabled_tools * 50)) wasted tokens)"

    if [[ $disabled_tools -gt 0 ]]; then
        echo ""
        echo "⚠️  Bug #11370: Disabled servers still consume context"
        echo "   Workaround: Use --strict-disable to fully remove"
    fi
}
```

### 3.4 New Commands

#### 3.4.1 --export-disabled

For hook automation:

```bash
./mcp --export-disabled
# Output: fetch,github,stripe

./mcp --export-disabled --json
# Output: ["fetch", "github", "stripe"]
```

#### 3.4.2 --sync-check

Compare config vs runtime state:

```bash
./mcp --sync-check
# Output:
# Server        Config    Runtime   Status
# fetch         enabled   disabled  ⚡ OUT OF SYNC
# github        disabled  disabled  ✓ in sync
# stripe        enabled   enabled   ✓ in sync
#
# Note: In-session toggles are not persisted.
# Use this tool to update config, then restart session.
```

#### 3.4.3 --context-report

Show context token usage:

```bash
./mcp --context-report
# Output:
# MCP Server Context Usage Report
# ================================
#
# ENABLED SERVERS:
#   fetch          8 tools   ~400 tokens
#   filesystem    12 tools   ~600 tokens
#   github        15 tools   ~750 tokens
#   ─────────────────────────────────────
#   Total:        35 tools  ~1750 tokens
#
# DISABLED BUT LOADING (Bug #11370):
#   stripe         6 tools   ~300 tokens (wasted)
#
# Recommendation: Use --strict-disable to save ~300 tokens
```

---

## Part 4: Updated Phase Plan

### Phase 1 (COMPLETED)
- ✅ --audit, --validate, --fix-config
- ✅ --strict-disable, --debug-precedence
- ✅ --restore-plugin, --rollback
- ✅ ALT-H hard disable, ALT-1 to ALT-4 filters
- ✅ Test infrastructure

### Phase 2 (UPDATED)

| Task | Effort | Priority | Notes |
|------|--------|----------|-------|
| --export-disabled | 2h | HIGH | Hook automation |
| --sync-check | 3h | HIGH | Session vs config comparison |
| --context-report | 2h | MEDIUM | Token usage visibility |
| Version history (--history) | 4h | MEDIUM | Original plan |
| Batch toggle with checkpoints | 4h | MEDIUM | Original plan |
| Context token display in TUI | 2h | LOW | Show per-server impact |

### Phase 3 (UPDATED)

| Task | Effort | Priority | Notes |
|------|--------|----------|-------|
| Session-aware warnings | 2h | HIGH | Detect Claude session |
| Hook integration docs | 4h | HIGH | SessionStart examples |
| KNOWN_BUGS.md | 4h | HIGH | Document #13311, #11370, etc |
| Configuration templates | 4h | MEDIUM | Original plan |
| README update | 4h | MEDIUM | New features |

### Phase 4-5: Windows + Optimization
(No changes from v2.0)

---

## Part 5: Documentation Updates

### 5.1 KNOWN_BUGS.md (New)

```markdown
# Known Claude Code MCP Bugs and Workarounds

## Bug #13311: disabledMcpServers Not Enforced

**Symptom**: Servers in `disabledMcpServers` still connect on session start.

**Workaround**:
```bash
./mcp --strict-disable
```
Converts ORANGE (runtime-disabled) to RED (config-disabled) before launch.

## Bug #11370: Disabled Servers Consume Context

**Symptom**: Each disabled server wastes ~400-650 context tokens.

**Workaround**:
```bash
./mcp --context-report  # See wasted tokens
./mcp --strict-disable  # Remove from context
```

## Bug #7936: Removed Servers Show in /mcp

**Symptom**: After `claude mcp remove`, server still appears in `/mcp` UI.

**Workaround**: Restart Claude Code session.
```

### 5.2 HOOKS_INTEGRATION.md (New)

```markdown
# Hook Integration Guide

## Enforcing MCP State on Session Start

```json
{
  "hooks": {
    "SessionStart": [{
      "type": "command",
      "command": "./mcp --strict-disable --quiet"
    }]
  }
}
```

## Validating Config Before Session

```json
{
  "hooks": {
    "SessionStart": [{
      "type": "command",
      "command": "./mcp --validate || exit 1"
    }]
  }
}
```
```

---

## Appendix: Feature Request Tracking

| Feature | GitHub Issue | Status | Our Alternative |
|---------|--------------|--------|-----------------|
| CLI enable/disable | #10447 | Open | Our TUI + commands |
| Runtime toggle persistence | #6309 | Open | Our config writes |
| /mcp enable/disable UI | #7068 | Partial | Our TUI |
| MCP toggle toggle | #4879 | Open | Our 3-way toggle |
| Hook-based MCP control | #10447 | Open | --export-disabled |

---

## Summary

Our tool fills critical gaps in Claude Code's MCP management:

1. **Persistent configuration** (vs session-only)
2. **CLI automation** (vs no enable/disable commands)
3. **Bug workarounds** (vs broken features)
4. **Enterprise support** (vs basic handling)
5. **Hook integration** (vs no automation support)

The new integration features ensure we complement Claude's built-in features rather than competing with them.
