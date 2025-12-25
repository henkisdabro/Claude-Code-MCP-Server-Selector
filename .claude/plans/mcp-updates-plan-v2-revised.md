# MCP Server Selector Improvement Plan v2.0 (REVISED)

## Revision Notes

This is the revised plan incorporating expert review feedback. Key changes:
- **REMOVED**: mtime tiebreaker, lazy caching, code sharing between platforms
- **ADDED**: Testing in Phase 1, debug commands, rollback mechanisms
- **REORDERED**: Windows deferred until Bash stable

---

## Executive Summary

This plan addresses necessary updates to the MCP Server Selector tool based on:
1. Recent changes to Claude Code's MCP handling (2024-2025)
2. Known bugs and workarounds in Claude's MCP implementation
3. Missing features identified through codebase analysis
4. Cross-platform requirements (Linux/macOS bash + Windows PowerShell)

**Scope**: 5 phases over 10 weeks, delivering bug workarounds, new features, and Windows support.

---

## Part 1: Critical Bug Workarounds

### 1.1 Session Startup `disabledMcpServers` Bug (#13311)

**Problem:** `disabledMcpServers` settings not enforced when Claude session starts.

**Solution:**
```bash
# Auto-detect if bug affects current Claude version
validate_runtime_support() {
    local claude_version=$(claude --version 2>/dev/null | head -1)
    # Cache detection result in ~/.claude/.mcp_compat
    # Show warning if affected version detected
}

# New flag: --strict-disable
# Converts all ORANGE servers to RED before launch
# Ensures complete disable even with bug present
```

**Implementation:**
- Add `validate_runtime_overrides()` function
- Display warning: "Runtime-disabled servers may still connect"
- `--strict-disable` converts ORANGE → RED atomically

### 1.2 Control Arrays Configuration Audit

**Problem:** Control arrays in wrong files cause silent failures.

**Solution: `./mcp --audit`**
```
┌─────────────────────────────────────────────────────────────┐
│ MCP Configuration Audit Report                              │
├─────────────────────────────────────────────────────────────┤
│ Configuration Health: WARNINGS FOUND                        │
│                                                             │
│ === Control Array Issues ===                                │
│ X "disabledMcpServers" in wrong location:                   │
│    Found in: ./.claude/settings.local.json                  │
│    Should be: ~/.claude.json only                           │
│    Impact: Array will be IGNORED by Claude                  │
│                                                             │
│ === Server Definition Conflicts ===                         │
│ ! "fetch" defined in 2 locations:                           │
│    ~/.mcp.json (user, active)                               │
│    ./.mcp.json (project, shadowed)                          │
│                                                             │
│ Run ./mcp --fix-config to auto-repair                       │
└─────────────────────────────────────────────────────────────┘
```

**Commands:**
- `./mcp --audit` - Show config health report
- `./mcp --audit --json` - Machine-readable output
- `./mcp --fix-config` - Auto-repair with confirmation
- `./mcp --fix-config --apply` - Auto-repair without prompts

### 1.3 Plugin UI Disappearance Issue

**Problem:** Setting `enabledPlugins["plugin"] = false` hides plugin from UI.

**Solution: Soft vs Hard Disable**
```
SOFT DISABLE (default):
  - Omit from enabledPlugins object
  - Allows re-enabling via Claude UI
  - May inherit from lower-priority config

HARD DISABLE (ALT-H with confirmation):
  - Set to explicit false
  - Plugin hidden from UI
  - Requires --restore-plugin to recover
```

**Recovery Command:**
```bash
./mcp --restore-plugin "mcp-fetch@marketplace"
# Removes explicit false, allows plugin to appear again
```

---

## Part 2: Algorithm Improvements (SIMPLIFIED)

### 2.1 Precedence Resolution (SIMPLIFIED)

**REMOVED from original plan:**
- ~~File modification time tiebreaker~~ (too fragile)
- ~~Sub-priority factors~~ (over-engineered)

**KEPT: Simple Scope Priority**
```
Priority 4: Enterprise (immutable, highest)
Priority 3: Local (./.claude/settings.local.json)
Priority 2: Project (./.claude/settings.json, ./.mcp.json)
Priority 1: User (~/.claude.json, ~/.mcp.json, lowest)

Rule: Higher priority ALWAYS wins. No exceptions.
Rule: Within same priority, later-parsed file wins.
```

**NEW: Debug Command**
```bash
./mcp --debug-precedence fetch
# Output:
# Server: fetch
#
# Definition Resolution:
#   Priority 2 (project): ./.mcp.json -> ACTIVE
#   Priority 1 (user): ~/.mcp.json -> shadowed
#
# State Resolution:
#   Priority 3 (local): disabledMcpjsonServers -> OFF
#   Priority 1 (user): enabledMcpjsonServers -> (overridden)
#
# Final: OFF (disabled by local scope)
```

### 2.2 Batch Toggle Operations

**Keep from original plan with safeguards:**
```bash
# In-memory toggle tracking
declare -A pending_toggles
DIRTY_FLAG=false

toggle_server() {
    pending_toggles["$server"]="$new_state"
    DIRTY_FLAG=true
    # Visual update only, no disk write
}

# Write to disk on:
# 1. fzf list reload
# 2. Save operation (ENTER)
# 3. Every 5 toggles (auto-checkpoint)
# 4. Exit (with warning if unsaved)
```

### 2.3 Runtime State Detection

**REMOVED from original plan:**
- ~~Lazy caching with fswatch~~ (race conditions, minimal benefit)
- ~~Background refresh~~ (overwrites user changes)

**KEPT: FAST_MODE (existing behavior)**
```bash
FAST_MODE=true  # Default, skip claude mcp list
# FAST_MODE=false ./mcp  # Debug mode, check actual runtime
```

**NEW: Explicit Refresh**
```bash
# CTRL-R in TUI forces runtime check
# Shows actual running/stopped status
# One-time operation, no caching
```

---

## Part 3: New Features

### 3.1 Server Type Filters

**Keybindings:**
| Key | Filter | Description |
|-----|--------|-------------|
| ALT-1 | `:mcpjson` | MCPJSON servers only |
| ALT-2 | `:direct` | Direct servers only |
| ALT-3 | `:plugin` | Plugin servers only |
| ALT-4 | `:enterprise` | Enterprise servers only |
| ALT-0 | `:all` | Reset filter |
| ALT-B | `:blocked` | Blocked/restricted only |
| ALT-O | `:orange` | Runtime-disabled only |

### 3.2 Version History

**Location:** `./.claude/.settings_history/`

**Commands:**
- `./mcp --history` - Show change history
- `./mcp --restore N` - Restore version N
- `./mcp --diff N` - Show diff between current and version N

**Auto-save:** Before every save operation, keep last 20 versions.

### 3.3 Configuration Templates

**Command:** `./mcp --init [template]`

| Template | Description |
|----------|-------------|
| `minimal` | Empty config |
| `developer` | fetch, filesystem, git |
| `data-science` | Python, Jupyter, databases |
| `web-dev` | Browser, puppeteer, API tools |

### 3.4 Validation Command

**Command:** `./mcp --validate`

```bash
./mcp --validate
# Checks:
# - JSON syntax in all config files
# - Control arrays in correct locations
# - No orphaned server references
# - Enterprise policy compliance
#
# Output: PASS/FAIL with details
```

---

## Part 4: State File Migration (CRITICAL)

### 4.1 Migration Strategy

**Current Format (v1.x):**
```
state:server:scope:file:type:flags
```

**New Format (v2.0):**
```
# schema_version:2.0
state:server:scope:file:type:flags:runtime
```

**Key Changes:**
- Added schema version header (first line)
- Added runtime field (optional, for ORANGE detection)
- Backward compatible (v1.x files still work)

### 4.2 Migration Safety

```bash
migrate_state_file() {
    # 1. Detect version
    local version=$(head -1 "$STATE_FILE" | grep -oP 'schema_version:\K[0-9.]+' || echo "1.0")

    # 2. If already v2.0, skip
    [[ "$version" == "2.0" ]] && return 0

    # 3. Create backup
    cp "$STATE_FILE" "${STATE_FILE}.backup.$(date +%s)"

    # 4. Dry-run migration
    if ! migrate_v1_to_v2 --dry-run; then
        msg_error "Migration dry-run failed"
        return 1
    fi

    # 5. Actual migration
    migrate_v1_to_v2 || {
        # 6. Rollback on failure
        cp "${STATE_FILE}.backup.*" "$STATE_FILE"
        msg_error "Migration failed, rolled back"
        return 1
    }

    # 7. Validate result
    validate_state_file || {
        cp "${STATE_FILE}.backup.*" "$STATE_FILE"
        msg_error "Validation failed, rolled back"
        return 1
    }
}
```

### 4.3 Rollback Command

```bash
./mcp --rollback
# Lists available backups
# Allows selection and restore
# Validates after restore
```

---

## Part 5: Windows PowerShell Implementation

### 5.1 Architecture Decision

**CHANGED from original plan:**
- ~~Shared code between Bash and PowerShell~~
- **NEW:** Separate implementations, shared protocol only

**Rationale:**
- JSON parsing differs (jq vs ConvertFrom-Json)
- Path handling differs significantly
- Error handling semantics differ
- Trying to share code introduces bugs

### 5.2 Shared Protocol

**State File Format:** Identical between platforms
**Config File Locations:** Platform-specific paths
**Behavior:** Identical outputs for identical inputs

### 5.3 PowerShell Implementation Outline

```powershell
# mcp.ps1 - Windows PowerShell version

param(
    [switch]$Audit,
    [switch]$FixConfig,
    [string]$Init,
    [switch]$StrictDisable,
    [switch]$Validate,
    [string]$DebugPrecedence
)

# Configuration paths (Windows)
$script:ConfigPaths = @{
    UserConfig = "$env:USERPROFILE\.claude.json"
    UserSettings = "$env:USERPROFILE\.claude\settings.json"
    ProjectMcp = ".\.mcp.json"
    EnterpriseMcp = "$env:ProgramData\ClaudeCode\managed-mcp.json"
}

# Core functions (reimplemented for PowerShell)
function Get-ServerState { ... }
function Set-ServerToggle { ... }
function Save-StateToSettings { ... }
function Show-FzfTui { ... }
```

### 5.4 Windows-Specific Considerations

| Consideration | Solution |
|---------------|----------|
| Paths with spaces | Use `Join-Path` consistently |
| CRLF line endings | Normalize on read |
| Execution policy | Document requirement clearly |
| fzf availability | Install via winget |
| UNC paths | Detect and warn |

---

## Part 6: Testing Infrastructure

### 6.1 Test Framework

**Bash:** bats-core
**PowerShell:** Pester

### 6.2 Test Structure

```
tests/
├── unit/
│   ├── test_precedence.bats        # Precedence resolution
│   ├── test_toggle.bats            # 3-way toggle
│   ├── test_migration.bats         # State file migration
│   └── test_enterprise.bats        # Enterprise policies
├── integration/
│   ├── test_discovery.bats         # Full source discovery
│   ├── test_save_cycle.bats        # Save and reload
│   └── test_audit.bats             # Audit functionality
├── fixtures/
│   ├── claude.json.*               # Test config files
│   ├── settings.json.*
│   └── managed-mcp.json.*
└── powershell/
    └── *.Tests.ps1                 # Pester tests
```

### 6.3 CI/CD Pipeline

```yaml
# .github/workflows/test.yml
name: MCP Selector Tests
on: [push, pull_request]

jobs:
  test-bash:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        run: sudo apt-get install -y jq && npm install -g bats
      - name: Run tests
        run: bats tests/unit/*.bats tests/integration/*.bats

  test-powershell:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: Invoke-Pester tests/powershell/*.Tests.ps1
```

---

## Part 7: Implementation Phases (REVISED)

### Phase 1: Bug Workarounds + Testing Foundation (Week 1-2)

**Priority: CRITICAL**

| Task | Effort | Notes |
|------|--------|-------|
| `--audit` command | 4h | Config health check |
| `--fix-config` command | 4h | Auto-repair |
| `--validate` command | 2h | Quick validation |
| `--strict-disable` flag | 2h | ORANGE → RED |
| `--debug-precedence` command | 2h | Resolution debugging |
| ALT-H hard disable with warning | 2h | Plugin control |
| `--restore-plugin` command | 1h | Recovery |
| Basic test infrastructure | 4h | bats-core setup |
| Precedence unit tests | 4h | 80% coverage target |
| State migration with rollback | 4h | Safe upgrade path |

**Deliverables:**
- All bug workarounds functional
- Test suite running in CI
- State file migration tested

### Phase 2: Features + Core Tests (Week 3-4)

**Priority: HIGH**

| Task | Effort | Notes |
|------|--------|-------|
| Server type filters (ALT-1 to ALT-4) | 4h | Filter by type |
| Version history for settings | 4h | 20-version history |
| Batch toggle with checkpoints | 4h | In-memory + auto-save |
| CTRL-R explicit refresh | 2h | Force runtime check |
| Toggle unit tests | 4h | 3-way state machine |
| Integration tests | 4h | Full cycle testing |

**Deliverables:**
- All TUI enhancements functional
- 80%+ test coverage
- Performance benchmarks

### Phase 3: Polish + Documentation (Week 5-6)

**Priority: MEDIUM**

| Task | Effort | Notes |
|------|--------|-------|
| Configuration templates | 4h | 4 built-in templates |
| `--history` and `--restore` | 4h | Version management |
| Improved error messages | 4h | Clear, actionable |
| KNOWN_ISSUES.md | 2h | Document workarounds |
| README update | 4h | New features documented |
| CHANGELOG.md | 2h | Version history |

**Deliverables:**
- Complete documentation
- All features polished
- Ready for Windows port

### Phase 4: Windows PowerShell (Week 7-8)

**Priority: MEDIUM** (after Bash stable)

| Task | Effort | Notes |
|------|--------|-------|
| Core discovery functions | 8h | PowerShell native |
| Precedence resolution | 4h | Same algorithm |
| Toggle and save logic | 4h | Same behavior |
| fzf integration | 4h | Windows fzf |
| Cross-platform tests | 4h | Validate identical output |
| Windows CI job | 2h | GitHub Actions |

**Deliverables:**
- Functional mcp.ps1
- Cross-platform test suite
- Windows documentation

### Phase 5: Optimization + Hardening (Week 9-10)

**Priority: LOW** (only if benchmarks show need)

| Task | Effort | Notes |
|------|--------|-------|
| Performance profiling | 4h | Identify bottlenecks |
| Memory optimization | 4h | Large config handling |
| Edge case hardening | 4h | 100+ servers, symlinks |
| Security audit | 4h | Temp files, permissions |
| Production testing | 4h | Real-world validation |

**Deliverables:**
- Performance report
- Security audit results
- Production-ready release

---

## Part 8: Risk Mitigation

### Critical Risks

| Risk | Mitigation |
|------|------------|
| State migration corruption | Backup + dry-run + rollback mechanism |
| Precedence regression | 80%+ test coverage + --debug-precedence |
| Windows port complexity | Separate implementation, shared protocol |
| Claude API changes | Abstract Claude calls, version detection |

### Monitoring

- Track Claude Code version compatibility
- Document workarounds in KNOWN_ISSUES.md
- Automated tests catch regressions

---

## Appendix A: Files Changed

| File | Action | Phase |
|------|--------|-------|
| `mcp` | Modify | 1-3 |
| `mcp.ps1` | Create | 4 |
| `tests/` | Create | 1-2 |
| `.github/workflows/test.yml` | Create | 1 |
| `KNOWN_ISSUES.md` | Create | 3 |
| `CHANGELOG.md` | Create | 3 |
| `README.md` | Update | 3 |

## Appendix B: Command Reference (New)

```bash
# Bug workarounds
./mcp --audit              # Config health check
./mcp --audit --json       # Machine-readable output
./mcp --fix-config         # Auto-repair (interactive)
./mcp --fix-config --apply # Auto-repair (non-interactive)
./mcp --strict-disable     # Convert ORANGE → RED
./mcp --validate           # Quick validation

# Debugging
./mcp --debug-precedence fetch  # Show resolution for server

# Recovery
./mcp --restore-plugin "name@marketplace"  # Un-hard-disable plugin
./mcp --rollback           # Restore from backup

# History
./mcp --history            # Show settings history
./mcp --restore N          # Restore version N
./mcp --diff N             # Diff with version N

# Templates
./mcp --init minimal       # Create minimal config
./mcp --init developer     # Create developer config
```

## Appendix C: TUI Keybindings (Updated)

| Key | Action |
|-----|--------|
| SPACE | 3-way toggle (RED → GREEN → ORANGE) |
| ALT-M | Migrate Direct server to project |
| ALT-H | Hard disable plugin (with warning) |
| ALT-E | Enable all servers |
| ALT-D | Disable all servers |
| ALT-1 | Filter: MCPJSON only |
| ALT-2 | Filter: Direct only |
| ALT-3 | Filter: Plugin only |
| ALT-4 | Filter: Enterprise only |
| ALT-0 | Filter: Show all |
| ALT-B | Filter: Blocked only |
| ALT-O | Filter: ORANGE only |
| CTRL-A | Add new server |
| CTRL-X | Remove server |
| CTRL-R | Refresh runtime status |
| ENTER | Save and launch Claude |
| ESC | Cancel without saving |
