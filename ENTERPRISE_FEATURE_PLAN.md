# Enterprise MCP Support - Feature Implementation Plan

**Status**: Planning Complete - Ready for Implementation
**Estimated Effort**: 3.5-4 hours
**Complexity**: Medium
**Risk Level**: Low (with proper validation)
**Target Branch**: `feat/enterprise-mcp-support`

---

## Executive Summary

This document outlines the implementation plan for adding enterprise MCP server support to the Claude Code MCP Server Selector tool. The feature will enable IT administrators to:

- Deploy centralized MCP servers via `managed-mcp.json`
- Restrict which servers users can enable via allowlists/denylists
- Maintain full backward compatibility for non-enterprise users

**Key Design Principles:**
- ✅ Zero breaking changes for existing users
- ✅ Graceful degradation if enterprise files don't exist
- ✅ Fail-safe security defaults
- ✅ Clear visual feedback for enterprise policies

---

## Background: Official Claude Code Documentation

From the official docs, Claude Code supports enterprise configurations at these paths:

**Enterprise MCP Servers (`managed-mcp.json`):**
- macOS: `/Library/Application Support/ClaudeCode/managed-mcp.json`
- Linux: `/etc/claude-code/managed-mcp.json`
- Windows: `C:\ProgramData\ClaudeCode\managed-mcp.json`

**Enterprise Restrictions (`managed-settings.json`):**
- macOS: `/Library/Application Support/ClaudeCode/managed-settings.json`
- Linux: `/etc/claude-code/managed-settings.json`
- Windows: `C:\ProgramData\ClaudeCode\managed-settings.json`

**Restriction Format:**
```json
{
  "allowedMcpServers": [
    { "serverName": "github" },
    { "serverName": "sentry" }
  ],
  "deniedMcpServers": [
    { "serverName": "filesystem" }
  ]
}
```

**Restriction Behavior:**
- `allowedMcpServers` undefined = no restrictions (allow all)
- `allowedMcpServers` = `[]` = complete lockdown (deny all)
- `deniedMcpServers` takes absolute precedence (blocks across all scopes)

---

## Critical Issues Found in Original Plan

### Issue #1: Platform Path Detection is Naive

**Problem:**
- WSL detection: Runs as Linux but may need Windows paths
- Path spaces: macOS paths have spaces - quoting issues
- Permission errors: `/etc/claude-code/` may require root access

**Solution:**
```bash
get_enterprise_mcp_path() {
  # Detect WSL first - check both Windows and Linux paths
  if grep -qi microsoft /proc/version 2>/dev/null; then
    local win_path="/mnt/c/ProgramData/ClaudeCode/managed-mcp.json"
    local lin_path="/etc/claude-code/managed-mcp.json"
    [[ -f "$win_path" ]] && echo "$win_path" && return
    [[ -f "$lin_path" ]] && echo "$lin_path" && return
  elif [[ "$(uname -s)" == "Darwin" ]]; then
    echo "/Library/Application Support/ClaudeCode/managed-mcp.json"
  else
    echo "/etc/claude-code/managed-mcp.json"
  fi
}

get_enterprise_settings_path() {
  # Same logic for managed-settings.json
}
```

---

### Issue #2: Precedence Logic is Oversimplified

**Problem:** Original plan said "Enterprise = priority 4" without considering:
- Can local settings override enterprise servers?
- Can enterprise servers be disabled?
- What if enterprise and project define same server with different args?

**Solution:** Three-tier precedence model with immutability rules

**Enterprise Server Rules:**
- ✅ Enterprise servers have highest precedence (priority 4)
- ❌ Enterprise servers CANNOT be overridden by project/user configs
- ❌ Enterprise servers CANNOT be disabled (immutable state)
- ✅ Enterprise servers shown with special indicator

**Updated Precedence Table:**

| Priority | Scope | Definition Source | State Control | Can Override Enterprise? |
|----------|-------|-------------------|---------------|-------------------------|
| **4** (Highest) | **Enterprise** | managed-mcp.json | Always ON (immutable) | N/A |
| **3** | **Local** | ./.claude/settings.local.json | Can toggle non-enterprise | ❌ No |
| **2** | **Project** | ./.mcp.json, settings.json | Can toggle non-enterprise | ❌ No |
| **1** (Lowest) | **User** | ~/.mcp.json, settings | Can toggle non-enterprise | ❌ No |

**Implementation:**
```bash
get_scope_priority() {
  case "$1" in
    enterprise) echo 4 ;;  # NEW: Highest priority, immutable
    local) echo 3 ;;
    project) echo 2 ;;
    user) echo 1 ;;
  esac
}
```

---

### Issue #3: Allowlist/Denylist Logic Missing Truth Table

**Problem:** Original plan said "check denylist, check allowlist" without defining behavior for edge cases:
- What if `allowedMcpServers` is undefined vs `[]`?
- Does denylist block enterprise servers?
- What happens with contradictory rules?

**Solution:** Complete truth table with clear precedence

**Truth Table:**

| allowedMcpServers | deniedMcpServers | Server | Scope | Result | Reason |
|-------------------|------------------|--------|-------|--------|--------|
| undefined | undefined | any | any | ✅ Allowed | No restrictions active |
| undefined | [] | any | any | ✅ Allowed | Empty deny = allow all |
| undefined | ["fetch"] | fetch | user/project | ❌ Blocked | In denylist |
| undefined | ["fetch"] | fetch | enterprise | ❌ Blocked | Denylist blocks ALL scopes |
| [] | undefined | any | user/project | ❌ Blocked | Empty allow = deny all |
| [] | undefined | any | enterprise | ✅ Allowed | Enterprise servers bypass allowlist |
| ["github"] | undefined | github | any | ✅ Allowed | In allowlist |
| ["github"] | undefined | fetch | user/project | ❌ Blocked | Not in allowlist |
| ["github"] | undefined | fetch | enterprise | ✅ Allowed | Enterprise servers bypass allowlist |
| ["github"] | ["github"] | github | any | ❌ **Denylist wins** | Contradiction resolved |

**Key Rules:**
1. **Denylist is absolute** - blocks servers across ALL scopes (including enterprise)
2. **Allowlist applies to user/project only** - enterprise servers bypass allowlist
3. **Empty allowlist `[]` = lockdown** - deny all non-enterprise servers
4. **Undefined = no restriction** - allow all servers
5. **Contradictions** - denylist takes precedence

**Implementation:**
```bash
is_server_allowed() {
  local server="$1"
  local scope="$2"  # enterprise/local/project/user

  # Rule 1: Check denylist first (absolute block)
  if server_in_denylist "$server"; then
    return 1  # Blocked (applies to ALL scopes)
  fi

  # Rule 2: Enterprise servers bypass allowlist
  if [[ "$scope" == "enterprise" ]]; then
    return 0  # Always allowed
  fi

  # Rule 3: Check allowlist (only for non-enterprise)
  if allowlist_is_defined; then
    if server_in_allowlist "$server"; then
      return 0  # Allowed
    else
      return 1  # Blocked (not in allowlist)
    fi
  fi

  # Rule 4: No restrictions
  return 0  # Allowed
}
```

---

### Issue #4: State File Format Doesn't Support Enterprise Metadata

**Problem:** Current format is `state:server:scope:file:type` but we need to track:
- Is server enterprise-managed? (can't toggle)
- Is server policy-blocked? (can't enable)
- Is server read-only? (can view but not change)

**Solution:** Extend state file format with flags field

**New Format:**
```
state:server:scope:file:type:flags
```

**Flag Values:**
- `e` = enterprise-managed (immutable)
- `b` = blocked by denylist
- `r` = read-only (view only, no toggle)

**Examples:**
```bash
on:fetch:enterprise:/Library/.../managed-mcp.json:mcpjson:e       # Enterprise
off:time:user:~/.mcp.json:mcpjson:b                                # Blocked
on:github:user:~/.claude.json:direct:                              # Normal
```

**Parsing Example:**
```bash
while IFS=: read -r state server scope file type flags; do
  # Check flags
  if [[ "$flags" == *"e"* ]]; then
    # Enterprise server - show special indicator, prevent toggle
  elif [[ "$flags" == *"b"* ]]; then
    # Blocked server - show lock indicator, prevent enable
  fi
done < "$STATE_FILE"
```

---

### Issue #5: Toggle/Save Logic Doesn't Handle Restrictions

**Problem:** When should we prevent toggling? Options:
- Option A: Show error immediately (feels responsive)
- Option B: Toggle in state file, fail on save (confusing)
- Option C: SPACE does nothing (feels broken)

**Solution:** Multi-point validation with immediate feedback

**Validation Points:**

**Point 1: During Toggle (Immediate Feedback)**
```bash
toggle_server() {
  local server=$(extract_server_name "$1")
  local flags=$(get_server_flags "$server")
  local current_state=$(get_server_state "$server")

  # Check if enterprise-managed
  if [[ "$flags" == *"e"* ]]; then
    show_error_overlay "⚠️ Cannot toggle: Enterprise-managed server"
    show_error_overlay "Contact your IT administrator to change this server."
    return 1
  fi

  # Check if trying to enable a blocked server
  if [[ "$flags" == *"b"* ]] && [[ "$current_state" == "off" ]]; then
    show_error_overlay "🔒 Cannot enable: Blocked by enterprise policy"
    show_error_overlay "This server is in the denylist. Contact admin for access."
    return 1
  fi

  # Check if trying to disable when allowlist forbids
  if [[ "$current_state" == "on" ]] && ! is_server_allowed "$server"; then
    show_error_overlay "🔒 Cannot disable: Required by enterprise policy"
    show_error_overlay "This server is mandated by your organization."
    return 1
  fi

  # Proceed with toggle
  toggle_state_in_file "$server"
}

show_error_overlay() {
  # Display error message in fzf preview or as notification
  echo -e "${COLOR_RED}${MARK_ERROR}${COLOR_RESET} $*" >&2
  sleep 1
}
```

**Point 2: During Save (Safety Net)**
```bash
save_state_to_settings() {
  # Filter out enterprise/blocked servers that shouldn't be written
  while IFS=: read -r state server scope file type flags; do
    # Skip enterprise servers (managed externally)
    if [[ "$flags" == *"e"* ]]; then
      continue
    fi

    # Skip blocked servers being enabled
    if [[ "$flags" == *"b"* ]] && [[ "$state" == "on" ]]; then
      msg_warning "Skipping blocked server: $server"
      continue
    fi

    # Validate against current policy
    if ! is_server_allowed "$server" && [[ "$state" == "on" ]]; then
      msg_warning "Skipping policy-restricted server: $server"
      continue
    fi

    # Write to appropriate config file
    write_server_state "$server" "$state"
  done < "$STATE_FILE"
}
```

---

### Issue #6: UI Indicators Missing Critical Cases

**Problem:** Original plan only had:
- `● server │ enterprise` (enterprise-managed)
- `⊘ server │ blocked` (policy-blocked)

Missing cases:
- Enterprise server in denylist (contradiction)
- Server in allowlist but not defined (phantom)
- Server blocked but trying to enable (error state)

**Solution:** Complete indicator set with all states

**UI Indicators:**

| Visual | Indicator | Meaning | Can Toggle? | Preview Message |
|--------|-----------|---------|-------------|-----------------|
| 🏢 | `🏢 ● server │ mcpjson │ enterprise` | Enterprise-managed, enabled | ❌ No | "Managed by IT. Cannot be modified.<br>Contact admin: it@company.com" |
| 🔒 | `🔒 ○ server │ mcpjson │ user (blocked)` | Blocked by denylist | ❌ No | "Blocked by enterprise policy.<br>Server in deniedMcpServers list." |
| ⚠️ | `⚠️ ○ server │ mcpjson │ user (not allowed)` | Not in allowlist | ❌ No | "Not in allowlist.<br>Contact admin to request access." |
| ✓ | `● server │ mcpjson │ project` | Normal, enabled | ✅ Yes | Standard preview |
| ○ | `○ server │ mcpjson │ user` | Normal, disabled | ✅ Yes | Standard preview |

**Implementation:**
```bash
get_server_indicator() {
  local server="$1"
  local state="$2"
  local flags="$3"
  local scope="$4"

  # Enterprise-managed
  if [[ "$flags" == *"e"* ]]; then
    echo "🏢 ●"
    return
  fi

  # Blocked by denylist
  if [[ "$flags" == *"b"* ]]; then
    echo "🔒 ○"
    return
  fi

  # Not in allowlist
  if ! is_server_allowed "$server" "$scope"; then
    echo "⚠️ ○"
    return
  fi

  # Normal state
  if [[ "$state" == "on" ]]; then
    echo "●"
  else
    echo "○"
  fi
}
```

---

### Issue #7: Error Handling Could Create Security Holes

**Problem:** Original plan said "warn but continue for invalid JSON"

**Security Risk:**
```
Scenario: IT wants to block "filesystem" server (security risk)
→ Admin creates managed-settings.json with deniedMcpServers: ["filesystem"]
→ File has JSON syntax error (missing comma)
→ Tool warns and continues
→ Result: filesystem server NOT blocked → SECURITY BREACH!
```

**Solution:** Fail-safe defaults with lockdown mode

**Lockdown Mode Rules:**
1. Invalid enterprise JSON → Enable lockdown mode
2. Lockdown mode → Block ALL non-enterprise servers
3. Lockdown mode → Show prominent warning banner
4. Lockdown mode → Only allow enterprise servers

**Implementation:**
```bash
# Global flags
ENTERPRISE_MODE="none"  # none|active|lockdown

parse_enterprise_restrictions() {
  local file="$(get_enterprise_settings_path)"

  # No file = no restrictions
  if [[ ! -f "$file" ]]; then
    ENTERPRISE_MODE="none"
    return 0
  fi

  # Validate JSON
  if ! jq empty "$file" 2>/dev/null; then
    # FAIL-SAFE: Invalid JSON = lockdown mode
    msg_error "Enterprise settings file has invalid JSON"
    msg_error "Enforcing lockdown mode for security"
    ENTERPRISE_MODE="lockdown"
    return 1
  fi

  # Parse restrictions
  ALLOWED_SERVERS=$(jq -r '.allowedMcpServers[]?.serverName // empty' "$file" 2>/dev/null)
  DENIED_SERVERS=$(jq -r '.deniedMcpServers[]?.serverName // empty' "$file" 2>/dev/null)

  ENTERPRISE_MODE="active"
  return 0
}

is_server_allowed_with_lockdown() {
  local server="$1"
  local scope="$2"

  # Lockdown mode - only allow enterprise servers
  if [[ "$ENTERPRISE_MODE" == "lockdown" ]]; then
    if [[ "$scope" == "enterprise" ]]; then
      return 0  # Allow
    else
      return 1  # Block everything else
    fi
  fi

  # Normal validation
  is_server_allowed "$server" "$scope"
}
```

**Lockdown Mode UI:**
```bash
if [[ "$ENTERPRISE_MODE" == "lockdown" ]]; then
  echo -e "${COLOR_RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLOR_RESET}"
  echo -e "${COLOR_RED}⚠️  LOCKDOWN MODE ACTIVE${COLOR_RESET}"
  echo -e "${COLOR_RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLOR_RESET}"
  echo -e "${COLOR_YELLOW}Enterprise settings file is invalid.${COLOR_RESET}"
  echo -e "${COLOR_YELLOW}Only enterprise-managed servers are available.${COLOR_RESET}"
  echo -e "${COLOR_YELLOW}Contact your IT administrator to resolve.${COLOR_RESET}"
  echo -e "${COLOR_RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLOR_RESET}"
  echo ""
fi
```

---

### Issue #8: No Discovery Notification

**Problem:** User has no idea enterprise policies are active!

**Scenario:**
```
User runs tool
→ Sees some servers marked "enterprise"
→ Tries to disable one, gets error
→ Confused: "Why can't I toggle this?"
→ No indication policies are in effect
```

**Solution:** Add status banner to TUI header

**Banner Implementation:**
```bash
show_enterprise_banner() {
  local enterprise_count="${1:-0}"
  local restriction_type="${2:-none}"

  # No enterprise config = no banner
  if [[ "$ENTERPRISE_MODE" == "none" ]]; then
    return 0
  fi

  echo -e "${COLOR_YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLOR_RESET}"
  echo -e "${COLOR_YELLOW}🏢 Enterprise Policies Active${COLOR_RESET}"

  # Show enterprise server count
  if [[ $enterprise_count -gt 0 ]]; then
    echo -e "   • ${COLOR_CYAN}${enterprise_count}${COLOR_RESET} enterprise-managed servers"
  fi

  # Show restriction type
  case "$restriction_type" in
    allowlist)
      echo -e "   • ${COLOR_YELLOW}Access restricted to approved servers only${COLOR_RESET}"
      ;;
    denylist)
      local denied_count=$(echo "$DENIED_SERVERS" | wc -l)
      echo -e "   • ${COLOR_RED}${denied_count} servers blocked by policy${COLOR_RESET}"
      ;;
    both)
      echo -e "   • ${COLOR_YELLOW}Allowlist and denylist restrictions active${COLOR_RESET}"
      ;;
  esac

  # Lockdown mode warning
  if [[ "$ENTERPRISE_MODE" == "lockdown" ]]; then
    echo -e "   • ${COLOR_RED}⚠️  LOCKDOWN MODE - Invalid config detected${COLOR_RESET}"
  fi

  echo -e "${COLOR_YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLOR_RESET}"
  echo ""
}

# Call in main TUI function
launch_fzf_tui() {
  clear
  show_enterprise_banner "$ENTERPRISE_SERVER_COUNT" "$RESTRICTION_TYPE"
  # ... rest of TUI
}
```

---

### Issue #9: Performance Not Considered

**Problem:** Parsing enterprise files on every startup could be slow

**Worst Case:**
- managed-mcp.json: 100 enterprise servers
- managed-settings.json: allowlist with 500 entries
- Validation: Check each of 7 files against 500-entry allowlist
- Result: 100ms+ startup delay

**Solution:** Lazy loading with mtime-based caching

**Cache Strategy:**
```bash
ENTERPRISE_CACHE_FILE="./.claude/.enterprise_cache"
ENTERPRISE_CACHE_VERSION="1"

# Cache file format:
# Line 1: VERSION:MTIME_MCP:MTIME_SETTINGS
# Line 2+: Cached parsed data

load_enterprise_config_cached() {
  local mcp_file="$(get_enterprise_mcp_path)"
  local settings_file="$(get_enterprise_settings_path)"

  # Get current mtimes
  local mcp_mtime="0"
  local settings_mtime="0"
  [[ -f "$mcp_file" ]] && mcp_mtime=$(stat -c %Y "$mcp_file" 2>/dev/null || stat -f %m "$mcp_file" 2>/dev/null || echo "0")
  [[ -f "$settings_file" ]] && settings_mtime=$(stat -c %Y "$settings_file" 2>/dev/null || stat -f %m "$settings_file" 2>/dev/null || echo "0")

  # Check cache validity
  if [[ -f "$ENTERPRISE_CACHE_FILE" ]]; then
    local cache_header=$(head -1 "$ENTERPRISE_CACHE_FILE")
    IFS=: read -r cache_ver cache_mcp cache_settings <<< "$cache_header"

    # Cache valid if version matches and mtimes match
    if [[ "$cache_ver" == "$ENTERPRISE_CACHE_VERSION" ]] && \
       [[ "$cache_mcp" == "$mcp_mtime" ]] && \
       [[ "$cache_settings" == "$settings_mtime" ]]; then
      # Use cached data
      tail -n +2 "$ENTERPRISE_CACHE_FILE"
      return 0
    fi
  fi

  # Parse fresh and cache
  {
    echo "$ENTERPRISE_CACHE_VERSION:$mcp_mtime:$settings_mtime"
    parse_enterprise_mcp_json
    parse_enterprise_restrictions
  } > "$ENTERPRISE_CACHE_FILE"

  # Output fresh data
  tail -n +2 "$ENTERPRISE_CACHE_FILE"
}
```

**Performance Improvement:**
- First run: Parse everything (~100ms)
- Subsequent runs: Load cache (~5ms)
- Cache invalidates automatically on file changes
- Per-project cache (different projects may have different restrictions)

---

## Revised Implementation Plan

### Phase 0: Pre-Implementation (Safety First)

**Duration:** 15 minutes

**Tasks:**
1. Create feature branch: `feat/enterprise-mcp-support`
2. Document all edge cases in code comments
3. Set up test matrix spreadsheet

**Checklist:**
- [ ] Branch created and checked out
- [ ] ENTERPRISE_FEATURE_PLAN.md reviewed
- [ ] Test scenarios documented

---

### Phase 1: Platform Detection & Constants

**Duration:** 15 minutes

**Implementation:**
```bash
# Add to constants section (after line 17)

# Enterprise configuration paths (platform-dependent)
get_enterprise_mcp_path() {
  # Detect WSL first
  if grep -qi microsoft /proc/version 2>/dev/null; then
    # WSL - check both Windows and Linux paths
    local win_path="/mnt/c/ProgramData/ClaudeCode/managed-mcp.json"
    local lin_path="/etc/claude-code/managed-mcp.json"
    [[ -f "$win_path" ]] && echo "$win_path" && return
    [[ -f "$lin_path" ]] && echo "$lin_path" && return
    return 1
  elif [[ "$(uname -s)" == "Darwin" ]]; then
    echo "/Library/Application Support/ClaudeCode/managed-mcp.json"
  else
    echo "/etc/claude-code/managed-mcp.json"
  fi
}

get_enterprise_settings_path() {
  # Same logic for managed-settings.json
  if grep -qi microsoft /proc/version 2>/dev/null; then
    local win_path="/mnt/c/ProgramData/ClaudeCode/managed-settings.json"
    local lin_path="/etc/claude-code/managed-settings.json"
    [[ -f "$win_path" ]] && echo "$win_path" && return
    [[ -f "$lin_path" ]] && echo "$lin_path" && return
    return 1
  elif [[ "$(uname -s)" == "Darwin" ]]; then
    echo "/Library/Application Support/ClaudeCode/managed-settings.json"
  else
    echo "/etc/claude-code/managed-settings.json"
  fi
}

# Enterprise mode flags
ENTERPRISE_MODE="none"        # none|active|lockdown
ENTERPRISE_SERVER_COUNT=0
RESTRICTION_TYPE="none"       # none|allowlist|denylist|both

# Restriction data
declare -a ALLOWED_SERVERS
declare -a DENIED_SERVERS
```

**Testing:**
- [ ] Test on Linux (non-WSL)
- [ ] Test on macOS (with spaces in path)
- [ ] Test on WSL (check both paths)
- [ ] Test when no enterprise files exist

---

### Phase 2: Parsing Functions with Fail-Safe

**Duration:** 30 minutes

**Implementation:**
```bash
# ============================================================================
# ENTERPRISE CONFIGURATION PARSING
# ============================================================================

parse_enterprise_mcp_json() {
  local file="$(get_enterprise_mcp_path)"

  # No file = no enterprise servers
  if [[ ! -f "$file" ]]; then
    return 0
  fi

  # Validate JSON
  if ! jq empty "$file" 2>/dev/null; then
    msg_warning "Enterprise MCP file has invalid JSON: $file"
    return 1
  fi

  # Parse mcpServers object
  local servers
  servers=$(jq -r '.mcpServers | keys[]' "$file" 2>/dev/null)

  if [[ -z "$servers" ]]; then
    return 0
  fi

  # Output in state file format with enterprise flag
  while IFS= read -r server; do
    echo "def:${server}:enterprise:${file}:mcpjson:e"
    ((ENTERPRISE_SERVER_COUNT++))
  done <<< "$servers"
}

parse_enterprise_restrictions() {
  local file="$(get_enterprise_settings_path)"

  # No file = no restrictions
  if [[ ! -f "$file" ]]; then
    ENTERPRISE_MODE="none"
    return 0
  fi

  # Validate JSON
  if ! jq empty "$file" 2>/dev/null; then
    # FAIL-SAFE: Invalid JSON = lockdown mode
    msg_error "Enterprise settings file has invalid JSON"
    msg_error "Enforcing lockdown mode for security"
    ENTERPRISE_MODE="lockdown"
    return 1
  fi

  # Parse allowedMcpServers
  local allowed_raw
  allowed_raw=$(jq -r '.allowedMcpServers[]?.serverName // empty' "$file" 2>/dev/null)
  if [[ -n "$allowed_raw" ]]; then
    mapfile -t ALLOWED_SERVERS <<< "$allowed_raw"
  fi

  # Parse deniedMcpServers
  local denied_raw
  denied_raw=$(jq -r '.deniedMcpServers[]?.serverName // empty' "$file" 2>/dev/null)
  if [[ -n "$denied_raw" ]]; then
    mapfile -t DENIED_SERVERS <<< "$denied_raw"
  fi

  # Determine restriction type
  if [[ ${#ALLOWED_SERVERS[@]} -gt 0 ]] && [[ ${#DENIED_SERVERS[@]} -gt 0 ]]; then
    RESTRICTION_TYPE="both"
  elif [[ ${#ALLOWED_SERVERS[@]} -gt 0 ]]; then
    RESTRICTION_TYPE="allowlist"
  elif [[ ${#DENIED_SERVERS[@]} -gt 0 ]]; then
    RESTRICTION_TYPE="denylist"
  else
    RESTRICTION_TYPE="none"
  fi

  ENTERPRISE_MODE="active"
  return 0
}

# Helper: Check if server is in allowlist
server_in_allowlist() {
  local server="$1"

  # No allowlist = all allowed
  if [[ ${#ALLOWED_SERVERS[@]} -eq 0 ]]; then
    return 0
  fi

  # Check membership
  for allowed in "${ALLOWED_SERVERS[@]}"; do
    if [[ "$allowed" == "$server" ]]; then
      return 0
    fi
  done

  return 1
}

# Helper: Check if server is in denylist
server_in_denylist() {
  local server="$1"

  # No denylist = none denied
  if [[ ${#DENIED_SERVERS[@]} -eq 0 ]]; then
    return 1
  fi

  # Check membership
  for denied in "${DENIED_SERVERS[@]}"; do
    if [[ "$denied" == "$server" ]]; then
      return 0
    fi
  done

  return 1
}

# Main validation function (implements truth table)
is_server_allowed() {
  local server="$1"
  local scope="${2:-user}"

  # Lockdown mode - only allow enterprise servers
  if [[ "$ENTERPRISE_MODE" == "lockdown" ]]; then
    if [[ "$scope" == "enterprise" ]]; then
      return 0  # Allow
    else
      return 1  # Block everything else
    fi
  fi

  # Rule 1: Check denylist first (absolute block across all scopes)
  if server_in_denylist "$server"; then
    return 1  # Blocked
  fi

  # Rule 2: Enterprise servers bypass allowlist
  if [[ "$scope" == "enterprise" ]]; then
    return 0  # Always allowed
  fi

  # Rule 3: Check allowlist (only for non-enterprise servers)
  # If allowlist is defined (even if empty), it acts as a whitelist
  if [[ ${#ALLOWED_SERVERS[@]} -gt 0 ]] || \
     jq -e '.allowedMcpServers' "$(get_enterprise_settings_path)" &>/dev/null; then
    if server_in_allowlist "$server"; then
      return 0  # Allowed
    else
      return 1  # Blocked (not in allowlist)
    fi
  fi

  # Rule 4: No restrictions
  return 0  # Allowed
}
```

**Testing:**
- [ ] Test with no enterprise files (should return 0)
- [ ] Test with valid managed-mcp.json
- [ ] Test with invalid JSON (should trigger lockdown)
- [ ] Test allowlist logic (all truth table rows)
- [ ] Test denylist precedence

---

### Phase 3: State File Extension

**Duration:** 20 minutes

**Changes:**

**Current Format:**
```
state:server:scope:file:type
```

**New Format:**
```
state:server:scope:file:type:flags
```

**Flag Values:**
- `e` = enterprise-managed (immutable)
- `b` = blocked by policy (denylist)
- `r` = restricted (not in allowlist)

**Updated Parsing:**
```bash
# Update all state file readers to handle optional flags field
while IFS=: read -r state server scope file type flags; do
  # flags may be empty for non-enterprise servers
  [[ -z "$flags" ]] && flags=""

  # Process based on flags
  if [[ "$flags" == *"e"* ]]; then
    # Enterprise server
  elif [[ "$flags" == *"b"* ]]; then
    # Blocked server
  fi
done < "$STATE_FILE"
```

**Writing State File:**
```bash
# When writing, add flags based on validation
echo "${state}:${server}:${scope}:${file}:${type}:${flags}" >> "$STATE_FILE"
```

**Testing:**
- [ ] Test backward compat (files without flags)
- [ ] Test flag parsing (e, b, r)
- [ ] Test multiple flags (e.g., "eb")

---

### Phase 4: Precedence Integration

**Duration:** 30 minutes

**Update Priority Function:**
```bash
get_scope_priority() {
  case "$1" in
    enterprise) echo 4 ;;  # NEW: Highest priority
    local) echo 3 ;;
    project) echo 2 ;;
    user) echo 1 ;;
    *) echo 0 ;;
  esac
}
```

**Update Discovery to Include Enterprise:**
```bash
discover_and_parse_all_sources() {
  # NEW: Parse enterprise first (highest priority)
  parse_enterprise_restrictions
  parse_enterprise_mcp_json

  # Existing parsing...
  parse_settings_file "$HOME/.claude/settings.local.json" "local"
  # ... etc
}
```

**Update Merge Logic:**
```bash
# When merging, enterprise servers override conflicts
if [[ "$scope" == "enterprise" ]] && [[ -n "${server_definitions[$server]}" ]]; then
  # Enterprise definition overrides existing
  msg_warning "Enterprise server '$server' overrides lower-priority definition"
fi
```

**Testing:**
- [ ] Test enterprise precedence over local
- [ ] Test enterprise precedence over project
- [ ] Test enterprise + project same server (enterprise wins)

---

### Phase 5: Toggle Validation

**Duration:** 45 minutes

**Update Toggle Function:**
```bash
toggle_server() {
  local line="$1"

  # Parse components including flags
  IFS=: read -r state server scope file type flags <<< "$(echo "$line" | sed 's/\x1b\[[0-9;]*m//g' | sed 's/^[^:]*://')"

  # Validation Point 1: Check if enterprise-managed
  if [[ "$flags" == *"e"* ]]; then
    show_toggle_error "Cannot modify enterprise-managed server" \
                      "This server is managed by your IT department." \
                      "Contact your administrator to request changes."
    return 1
  fi

  # Validation Point 2: Check if trying to enable blocked server
  if [[ "$state" == "off" ]] && server_in_denylist "$server"; then
    show_toggle_error "Cannot enable blocked server" \
                      "This server is blocked by enterprise policy." \
                      "Contact your administrator if you need access."
    return 1
  fi

  # Validation Point 3: Check allowlist when enabling
  if [[ "$state" == "off" ]] && ! is_server_allowed "$server" "$scope"; then
    show_toggle_error "Cannot enable restricted server" \
                      "This server is not in the approved list." \
                      "Contact your administrator to request access."
    return 1
  fi

  # Proceed with toggle
  toggle_state_in_file "$server"
}

show_toggle_error() {
  local title="$1"
  local reason="$2"
  local action="$3"

  # Display error in preview or as overlay
  {
    echo ""
    echo -e "${COLOR_RED}${MARK_ERROR} ${title}${COLOR_RESET}"
    echo ""
    echo -e "${COLOR_YELLOW}${reason}${COLOR_RESET}"
    echo -e "${COLOR_CYAN}${action}${COLOR_RESET}"
    echo ""
  } >&2

  sleep 2  # Give user time to read
}
```

**Testing:**
- [ ] Test toggle enterprise server (should block)
- [ ] Test toggle blocked server (should block)
- [ ] Test toggle non-allowed server (should block)
- [ ] Test toggle normal server (should work)

---

### Phase 6: UI Updates

**Duration:** 45 minutes

**Enterprise Banner:**
```bash
show_enterprise_banner() {
  # Only show if enterprise config exists
  if [[ "$ENTERPRISE_MODE" == "none" ]]; then
    return 0
  fi

  echo -e "${COLOR_YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLOR_RESET}"
  echo -e "${COLOR_YELLOW}🏢 Enterprise Policies Active${COLOR_RESET}"

  if [[ $ENTERPRISE_SERVER_COUNT -gt 0 ]]; then
    echo -e "   • ${COLOR_CYAN}${ENTERPRISE_SERVER_COUNT}${COLOR_RESET} enterprise-managed servers"
  fi

  case "$RESTRICTION_TYPE" in
    allowlist)
      echo -e "   • ${COLOR_YELLOW}Access restricted to ${#ALLOWED_SERVERS[@]} approved servers${COLOR_RESET}"
      ;;
    denylist)
      echo -e "   • ${COLOR_RED}${#DENIED_SERVERS[@]} servers blocked by policy${COLOR_RESET}"
      ;;
    both)
      echo -e "   • ${COLOR_YELLOW}Allowlist (${#ALLOWED_SERVERS[@]}) and denylist (${#DENIED_SERVERS[@]}) active${COLOR_RESET}"
      ;;
  esac

  if [[ "$ENTERPRISE_MODE" == "lockdown" ]]; then
    echo -e "   • ${COLOR_RED}⚠️  LOCKDOWN MODE - Invalid config detected${COLOR_RESET}"
  fi

  echo -e "${COLOR_YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLOR_RESET}"
  echo ""
}
```

**Updated Indicators:**
```bash
format_server_list() {
  # ... existing code ...

  # Determine indicator based on flags
  local indicator=""
  if [[ "$flags" == *"e"* ]]; then
    indicator="🏢 ●"
    symbol_color="${COLOR_CYAN}"
  elif [[ "$flags" == *"b"* ]]; then
    indicator="🔒 ○"
    symbol_color="${COLOR_RED}"
  elif [[ "$state" == "on" ]]; then
    indicator="●"
    symbol_color="${COLOR_GREEN}"
  else
    indicator="○"
    symbol_color="${COLOR_RED}"
  fi

  # Build row
  local row="${symbol_color}${indicator}${COLOR_RESET} ${server}..."
  echo -e "$row"
}
```

**Updated Preview:**
```bash
generate_preview() {
  # ... existing code ...

  # Add enterprise-specific messages
  if [[ "$flags" == *"e"* ]]; then
    echo ""
    echo -e "${COLOR_CYAN}Enterprise-Managed Server${COLOR_RESET}"
    echo "This server is managed by your IT department and cannot be modified."
    echo ""
    echo "To request changes, contact your administrator."
  elif [[ "$flags" == *"b"* ]]; then
    echo ""
    echo -e "${COLOR_RED}Blocked by Enterprise Policy${COLOR_RESET}"
    echo "This server is in the denied servers list."
    echo ""
    echo "To request access, contact your administrator."
  fi
}
```

**Testing:**
- [ ] Test banner with no enterprise (should not show)
- [ ] Test banner with enterprise servers
- [ ] Test banner with restrictions
- [ ] Test lockdown mode banner
- [ ] Test all indicator types (🏢, 🔒, ●, ○)

---

### Phase 7: Comprehensive Testing

**Duration:** 60 minutes

**Test Matrix (20 scenarios):**

| # | Scenario | Expected Result | Status |
|---|----------|-----------------|--------|
| 1 | No enterprise files | Works as before | [ ] |
| 2 | Empty managed-mcp.json | No enterprise servers | [ ] |
| 3 | Valid enterprise servers | Shows 🏢 indicators | [ ] |
| 4 | Toggle enterprise server | Error: "Cannot modify" | [ ] |
| 5 | Invalid managed-mcp.json | Warning, continues | [ ] |
| 6 | Invalid managed-settings.json | Lockdown mode activated | [ ] |
| 7 | Lockdown mode active | Only enterprise servers work | [ ] |
| 8 | Server in denylist | Shows 🔒, cannot enable | [ ] |
| 9 | Server not in allowlist | Shows ⚠️, cannot enable | [ ] |
| 10 | allowlist = [] | All non-enterprise blocked | [ ] |
| 11 | Server in both allow+deny | Denylist wins (blocked) | [ ] |
| 12 | Enterprise server in denylist | Blocked (denylist absolute) | [ ] |
| 13 | WSL with Windows path | Detects correctly | [ ] |
| 14 | macOS with spaces in path | No quote issues | [ ] |
| 15 | Permission denied on /etc | Graceful failure | [ ] |
| 16 | Enterprise + project same server | Enterprise wins | [ ] |
| 17 | Toggle allowed server | Works normally | [ ] |
| 18 | Save with blocked servers | Skips blocked servers | [ ] |
| 19 | Banner with all restrictions | Shows complete info | [ ] |
| 20 | Backward compat (no flags) | Works with old state files | [ ] |

**Manual Testing Script:**
```bash
#!/bin/bash
# test_enterprise.sh - Manual test helper

echo "Enterprise Feature Test Suite"
echo "=============================="
echo ""

# Test 1: No enterprise files
echo "Test 1: No enterprise files"
./mcp
# Expected: Works normally, no banner

# Test 2: Create test enterprise file
echo "Test 2: Create test enterprise file"
sudo mkdir -p "/etc/claude-code"
sudo tee "/etc/claude-code/managed-mcp.json" > /dev/null <<'EOF'
{
  "mcpServers": {
    "test-enterprise": {
      "command": "echo",
      "args": ["test"]
    }
  }
}
EOF
./mcp
# Expected: Shows enterprise banner, 🏢 indicator

# Test 3: Add denylist
echo "Test 3: Add denylist"
sudo tee "/etc/claude-code/managed-settings.json" > /dev/null <<'EOF'
{
  "deniedMcpServers": [
    { "serverName": "filesystem" }
  ]
}
EOF
./mcp
# Expected: filesystem shows 🔒, cannot enable

# ... more test scenarios
```

---

### Phase 8: Documentation

**Duration:** 30 minutes

**README Updates:**

1. Add enterprise section to "Configuration Precedence"
2. Update scope table to include enterprise priority 4
3. Add enterprise indicators to UI table
4. Add troubleshooting for lockdown mode
5. Add admin guide section

**New Section: Enterprise Configuration**
```markdown
## Enterprise Configuration

### For IT Administrators

Deploy centralized MCP servers and restrictions:

**Deploy Enterprise Servers:**
```json
# /Library/Application Support/ClaudeCode/managed-mcp.json (macOS)
# /etc/claude-code/managed-mcp.json (Linux)
{
  "mcpServers": {
    "company-api": {
      "command": "npx",
      "args": ["@company/mcp-server"]
    }
  }
}
```

**Restrict User Access:**
```json
# managed-settings.json
{
  "allowedMcpServers": [
    { "serverName": "github" },
    { "serverName": "sentry" }
  ],
  "deniedMcpServers": [
    { "serverName": "filesystem" }
  ]
}
```

**Rules:**
- Enterprise servers cannot be disabled by users
- Denylist blocks servers across all scopes (highest priority)
- Allowlist restricts non-enterprise servers
- Invalid JSON triggers lockdown mode (fail-safe)

### For Users in Enterprise Environments

If you see enterprise indicators:
- 🏢 = Enterprise-managed (contact IT to change)
- 🔒 = Blocked by policy (contact IT for access)
- ⚠️ = Not in approved list (contact IT to request)

**Lockdown Mode:**
If you see "LOCKDOWN MODE ACTIVE", your IT department's configuration
file has an error. Only enterprise servers will be available until
the configuration is fixed. Contact your administrator.
```

---

## Testing Strategy

### Unit Tests (If Implementing)

```bash
# Test: Platform detection
test_get_enterprise_mcp_path_macos() {
  # Mock uname to return Darwin
  # Assert path is /Library/Application Support/...
}

test_get_enterprise_mcp_path_wsl() {
  # Mock /proc/version with microsoft
  # Assert tries Windows path first
}

# Test: Allowlist/denylist logic
test_is_server_allowed_no_restrictions() {
  ALLOWED_SERVERS=()
  DENIED_SERVERS=()
  assert is_server_allowed "fetch" "user"
}

test_is_server_allowed_in_denylist() {
  DENIED_SERVERS=("fetch")
  assert_fails is_server_allowed "fetch" "user"
}

test_is_server_allowed_denylist_beats_allowlist() {
  ALLOWED_SERVERS=("fetch")
  DENIED_SERVERS=("fetch")
  assert_fails is_server_allowed "fetch" "user"
}

# ... more unit tests
```

### Integration Tests

```bash
# Test: End-to-end with enterprise file
test_e2e_enterprise_server() {
  # Setup: Create test enterprise file
  # Run: ./mcp
  # Assert: Server appears with 🏢 indicator
  # Assert: Cannot toggle enterprise server
}

# Test: Lockdown mode activation
test_e2e_lockdown_mode() {
  # Setup: Create invalid JSON in managed-settings.json
  # Run: ./mcp
  # Assert: Lockdown banner shown
  # Assert: Only enterprise servers available
}
```

---

## Risk Assessment

### Low Risk Items
- ✅ Reading enterprise files (read-only operation)
- ✅ Adding new scope level (extends existing system)
- ✅ Adding flags to state file (backward compatible)

### Medium Risk Items
- ⚠️ Validation logic in toggle (needs thorough testing)
- ⚠️ Lockdown mode (ensure it doesn't break normal flow)
- ⚠️ WSL path detection (multiple environments)

### High Risk Items
- ❌ None identified (with proper testing)

---

## Rollback Plan

If issues are discovered after merge:

1. **Quick rollback**: Revert merge commit
2. **Feature flag**: Add `ENABLE_ENTERPRISE=0` env var to disable
3. **Fix forward**: Address issues in hotfix branch

**Feature Flag Implementation:**
```bash
# Add to constants
ENABLE_ENTERPRISE="${ENABLE_ENTERPRISE:-1}"

# Wrap enterprise code
if [[ "$ENABLE_ENTERPRISE" == "1" ]]; then
  parse_enterprise_restrictions
  parse_enterprise_mcp_json
fi
```

---

## Timeline Estimate

| Phase | Duration | Cumulative |
|-------|----------|------------|
| 0. Pre-implementation | 15 min | 0.25 hrs |
| 1. Platform detection | 15 min | 0.5 hrs |
| 2. Parsing functions | 30 min | 1.0 hrs |
| 3. State file extension | 20 min | 1.33 hrs |
| 4. Precedence integration | 30 min | 1.83 hrs |
| 5. Toggle validation | 45 min | 2.58 hrs |
| 6. UI updates | 45 min | 3.33 hrs |
| 7. Testing | 60 min | 4.33 hrs |
| 8. Documentation | 30 min | **4.83 hrs** |

**Total: ~5 hours** (including testing and documentation)

---

## Success Criteria

Feature is complete when:

- [ ] All 20 test scenarios pass
- [ ] No breaking changes for non-enterprise users
- [ ] Documentation updated
- [ ] Code review completed
- [ ] Manual testing on macOS, Linux, WSL
- [ ] Performance acceptable (<100ms startup overhead)

---

## Future Enhancements

**Not in scope for initial release:**

1. **Plugin support** - Enterprise-managed plugins
2. **Audit logging** - Track server enable/disable events
3. **Policy sync** - Auto-update restrictions from central server
4. **User notifications** - Alert when policies change
5. **Grace period** - Allow temporary access to blocked servers

These can be added in future iterations based on user feedback.

---

## References

- [Official Claude Code MCP Documentation](https://docs.claude.ai/)
- [Claude Code Enterprise Settings](https://docs.claude.ai/) (managed configurations)
- Original feature request: User message in conversation

---

**Document Version:** 1.0
**Last Updated:** 2025-01-07
**Author:** Claude (Sonnet 4.5) with peer review analysis
**Status:** Ready for implementation
