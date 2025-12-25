# MCP Server Selector Improvement Plan v2.0

## Executive Summary

This plan addresses necessary updates to the MCP Server Selector tool based on:
1. Recent changes to Claude Code's MCP handling (2024-2025)
2. Known bugs and workarounds in Claude's MCP implementation
3. Missing features identified through codebase analysis
4. Cross-platform requirements (Linux/macOS bash + Windows PowerShell)

---

## Part 1: Critical Bug Workarounds

### 1.1 Session Startup `disabledMcpServers` Bug (#13311)

**Problem:** `disabledMcpServers` settings not enforced when Claude session starts. Servers still connect despite being in the disabled list.

**Current Impact:** ORANGE state servers (runtime-disabled) may still connect at session start.

**Workaround Strategy:**
```
┌─────────────────────────────────────────────────────────────┐
│ Pre-Launch Validation Hook                                  │
├─────────────────────────────────────────────────────────────┤
│ 1. Before launching Claude, validate disabledMcpServers     │
│ 2. If ORANGE servers exist, show warning banner             │
│ 3. Suggest user run `/mcp` after launch to enforce          │
│ 4. Add --force-disable flag to remove ORANGE servers        │
│    from config entirely (converts ORANGE → RED)             │
└─────────────────────────────────────────────────────────────┘
```

**Implementation:**
- Add `validate_runtime_overrides()` function
- Check if ORANGE servers exist in state file
- Display warning: "⚠️ Runtime-disabled servers may still connect. Use /mcp in Claude to re-apply."
- New flag: `--strict-disable` converts all ORANGE → RED before launch

### 1.2 Control Arrays Sometimes Non-Functional

**Problem:** `enabledMcpjsonServers` and `disabledMcpjsonServers` sometimes don't work. Often caused by multiple `mcpServers` sections in `~/.claude.json`.

**Detection & Fix Strategy:**
```
┌─────────────────────────────────────────────────────────────┐
│ Config Integrity Checker                                    │
├─────────────────────────────────────────────────────────────┤
│ 1. On startup, parse ~/.claude.json structure               │
│ 2. Detect duplicate mcpServers objects at different levels  │
│ 3. Check for array placement in wrong files                 │
│    - disabledMcpServers ONLY works in ~/.claude.json        │
│    - enabled/disabledMcpjsonServers ONLY in settings files  │
│ 4. Show warnings with remediation steps                     │
│ 5. Offer auto-fix option (--fix-config)                     │
└─────────────────────────────────────────────────────────────┘
```

**Implementation:**
- Add `audit_config_structure()` function
- New command: `./mcp --audit` shows config health report
- New command: `./mcp --fix-config` attempts automatic repair

### 1.3 Plugin UI Disappearance Issue

**Problem:** Setting `enabledPlugins["plugin@marketplace"] = false` makes plugin disappear from `claude mcp list` and UI entirely.

**Current Handling:** Tool uses "omit strategy" by default.

**Enhancement:**
```
┌─────────────────────────────────────────────────────────────┐
│ Soft vs Hard Disable for Plugins                            │
├─────────────────────────────────────────────────────────────┤
│ SOFT DISABLE (default - current behavior):                  │
│   - Omit from enabledPlugins                                │
│   - Allows re-enabling via Claude UI                        │
│   - May inherit from lower-priority config                  │
│                                                             │
│ HARD DISABLE (new option):                                  │
│   - Set to explicit false                                   │
│   - Completely prevents use                                 │
│   - Show warning: "Plugin will be hidden from UI"           │
│   - Keybinding: ALT-H (hard disable)                        │
└─────────────────────────────────────────────────────────────┘
```

**Implementation:**
- Add ALT-H keybinding for hard disable
- Show confirmation dialog with warning
- Track hard-disabled plugins separately in state file
- Display with 🔒 icon in TUI

---

## Part 2: Algorithm & Decision Logic Improvements

### 2.1 Unified Precedence Resolution Algorithm

**Current State:** Two separate associative arrays with >= priority comparison.

**Proposed Enhancement: Weighted Multi-Factor Resolution**

```
┌─────────────────────────────────────────────────────────────┐
│ Enhanced Precedence Model                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Priority Hierarchy (unchanged):                             │
│   4. Enterprise (immutable, highest)                        │
│   3. Local (./.claude/settings.local.json)                  │
│   2. Project (./.claude/settings.json, ./.mcp.json)         │
│   1. User (~/.claude.json, ~/.mcp.json)                     │
│                                                             │
│ NEW: Sub-priority for same-level conflicts                  │
│   - File modification time (newer wins)                     │
│   - Explicit > Implicit (explicit disable > master switch)  │
│   - Specific > General (individual server > bulk operation) │
│                                                             │
│ Decision Matrix:                                            │
│ ┌──────────────┬──────────────┬──────────────┬───────────┐  │
│ │ Definition   │ Enable State │ Disable State│ Result    │  │
│ ├──────────────┼──────────────┼──────────────┼───────────┤  │
│ │ Enterprise   │ Any          │ Any          │ ENABLED   │  │
│ │ Enterprise   │ -            │ Denylist     │ BLOCKED   │  │
│ │ User         │ Local ON     │ -            │ ENABLED   │  │
│ │ User         │ -            │ Project OFF  │ DISABLED  │  │
│ │ Project      │ User ON      │ Local OFF    │ DISABLED  │  │
│ └──────────────┴──────────────┴──────────────┴───────────┘  │
│                                                             │
│ Key Rule: State precedence ALWAYS independent of definition │
└─────────────────────────────────────────────────────────────┘
```

**Implementation Details:**

```bash
# Enhanced state file format (v2.0)
# state:server:def_scope:def_file:source_type:flags:runtime:def_priority:state_priority:state_source

# Example:
# on:fetch:user:~/.mcp.json:mcpjson::running:1:3:./.claude/settings.local.json
#                                           ^def ^state  ^state source file
```

### 2.2 Optimized Plugin Precedence Resolution

**Current Problem:** O(s*p) complexity in `save_state_to_settings()` due to repeated `plugin_enabled_in_lower_scope()` calls.

**Optimization Strategy:**
```
┌─────────────────────────────────────────────────────────────┐
│ Single-Pass Plugin State Aggregation                        │
├─────────────────────────────────────────────────────────────┤
│ BEFORE (current):                                           │
│   for each plugin:                                          │
│     call discover_and_parse_all_sources()  # O(n)           │
│     check if enabled in lower scope        # O(1)           │
│   Total: O(p * n) where p=plugins, n=files                  │
│                                                             │
│ AFTER (optimized):                                          │
│   1. Single pass: build plugin_state_by_scope map           │
│      plugin_state["fetch@mkt"]["user"] = true               │
│      plugin_state["fetch@mkt"]["project"] = false           │
│   2. For each plugin, check map                             │
│   Total: O(n + p) - linear                                  │
└─────────────────────────────────────────────────────────────┘
```

**Implementation:**
```bash
# New associative array structure
declare -A plugin_scope_states
# Key: "plugin_name:scope" Value: "true" or "false"
# Example: plugin_scope_states["fetch@mkt:user"]="true"

# Build once during discover_and_parse_all_sources()
# Query in O(1) during save
```

### 2.3 Lazy Runtime State Detection

**Current:** FAST_MODE skips `claude mcp list` entirely OR slow mode always calls it.

**Proposed: Smart Caching with Invalidation**
```
┌─────────────────────────────────────────────────────────────┐
│ Runtime State Cache Strategy                                │
├─────────────────────────────────────────────────────────────┤
│ Cache Location: ~/.claude/.mcp_runtime_cache                │
│ Cache TTL: 30 seconds (configurable)                        │
│                                                             │
│ Invalidation Triggers:                                      │
│   - Any config file modification (via inotify/fswatch)      │
│   - User toggle action                                      │
│   - Explicit refresh (CTRL-R)                               │
│                                                             │
│ Fetch Strategy:                                             │
│   1. Check cache age                                        │
│   2. If fresh (<30s), use cached state                      │
│   3. If stale, background refresh + show cached             │
│   4. Update UI when background fetch completes              │
│                                                             │
│ ULTRA-FAST Mode (new):                                      │
│   - Never call claude mcp list                              │
│   - Infer state from config files only                      │
│   - Suitable for CI/automation                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.4 Batch Toggle Operations

**Current:** State file re-sorted after each toggle (O(s*log s) per toggle).

**Optimization:**
```
┌─────────────────────────────────────────────────────────────┐
│ Deferred State File Updates                                 │
├─────────────────────────────────────────────────────────────┤
│ Current Flow:                                               │
│   toggle → update state file → sort → reload fzf            │
│   Per toggle: O(s*log s)                                    │
│   10 toggles: O(10 * s*log s)                               │
│                                                             │
│ Optimized Flow:                                             │
│   toggle → update in-memory map → mark dirty                │
│   ...more toggles...                                        │
│   reload fzf → if dirty, flush map to state file → sort     │
│   10 toggles: O(s*log s) once at reload                     │
│                                                             │
│ Implementation:                                             │
│   - Keep changes in associative array                       │
│   - Write to state file only on:                            │
│     a) fzf list reload                                      │
│     b) save operation                                       │
│     c) exit (cleanup)                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Part 3: New Feature Implementations

### 3.1 Configuration Audit Mode

**Command:** `./mcp --audit`

**Output:**
```
┌─────────────────────────────────────────────────────────────┐
│ MCP Configuration Audit Report                              │
├─────────────────────────────────────────────────────────────┤
│ Configuration Health: ⚠️ WARNINGS FOUND                     │
│                                                             │
│ ═══ Server Definition Conflicts ═══                         │
│ ⚠️ "fetch" defined in 2 locations:                          │
│    └─ ~/.mcp.json (user, active)                            │
│    └─ ./.mcp.json (project, shadowed)                       │
│    Recommendation: Remove from user scope if project-only   │
│                                                             │
│ ═══ Control Array Issues ═══                                │
│ ❌ "disabledMcpServers" in wrong location:                  │
│    └─ Found in: ./.claude/settings.local.json               │
│    └─ Should be: ~/.claude.json only                        │
│    Impact: Array will be IGNORED by Claude                  │
│                                                             │
│ ═══ Unused Configurations ═══                               │
│ ℹ️ "github" in disabledMcpjsonServers but not defined       │
│    └─ Location: ./.claude/settings.local.json               │
│    Recommendation: Remove orphaned reference                │
│                                                             │
│ ═══ Plugin Control Issues ═══                               │
│ ⚠️ "mcp-time@marketplace" set to explicit false             │
│    └─ Impact: Plugin hidden from Claude UI                  │
│    Recommendation: Omit instead of false, or use --hard     │
│                                                             │
│ ═══ Enterprise Policy Compliance ═══                        │
│ ✅ All servers comply with enterprise policies              │
│                                                             │
│ ═══ Summary ═══                                             │
│ Total Servers: 15                                           │
│ Conflicts: 1                                                │
│ Misplacements: 1                                            │
│ Orphaned refs: 1                                            │
│ Plugin issues: 1                                            │
│                                                             │
│ Run ./mcp --fix-config to auto-repair issues                │
└─────────────────────────────────────────────────────────────┘
```

**Implementation Functions:**
- `audit_definition_conflicts()` - Find duplicate server definitions
- `audit_control_array_placement()` - Verify arrays in correct files
- `audit_orphaned_references()` - Find refs to undefined servers
- `audit_plugin_control_issues()` - Check for UI-disappearing false values
- `audit_enterprise_compliance()` - Verify against policies

### 3.2 Configuration Auto-Fix

**Command:** `./mcp --fix-config`

**Capabilities:**
1. Move `disabledMcpServers` from settings files to `~/.claude.json`
2. Remove orphaned server references
3. Consolidate duplicate definitions (prompt for which to keep)
4. Convert explicit plugin `false` to omission (with backup)

**Safety:**
- Creates timestamped backup of ALL modified files
- Dry-run by default (`--fix-config --apply` to execute)
- Interactive confirmation for each change

### 3.3 Server Type Filters in TUI

**New Keybindings:**
| Key | Filter | Description |
|-----|--------|-------------|
| ALT-1 | `:mcpjson` | Show only MCPJSON servers |
| ALT-2 | `:direct` | Show only Direct servers |
| ALT-3 | `:plugin` | Show only Plugin servers |
| ALT-4 | `:enterprise` | Show only Enterprise servers |
| ALT-0 | `:all` | Reset filter (show all) |
| ALT-B | `:blocked` | Show blocked/restricted only |
| ALT-O | `:orange` | Show ORANGE (runtime-disabled) only |

**Implementation:**
- Add filter state variable
- Modify `generate_fzf_list()` to apply filter
- Update header to show active filter

### 3.4 Version History for Settings

**Location:** `./.claude/.settings_history/`

**Structure:**
```
.claude/.settings_history/
├── settings.local.json.001.20250101_120000
├── settings.local.json.002.20250101_130000
├── settings.local.json.003.20250101_140000
└── .history_index  # Maps version numbers to descriptions
```

**Commands:**
- `./mcp --history` - Show change history
- `./mcp --restore N` - Restore version N
- `./mcp --diff N` - Show diff between current and version N

**Auto-save triggers:**
- Before any save operation
- Keep last 20 versions (configurable)

### 3.5 Configuration Templates

**Command:** `./mcp --init [template]`

**Available Templates:**
| Template | Description |
|----------|-------------|
| `minimal` | Empty config, ready for customization |
| `developer` | Common dev tools (fetch, filesystem, git) |
| `enterprise` | Locked-down config for corporate use |
| `data-science` | Python, Jupyter, databases |
| `web-dev` | Browser, puppeteer, API tools |

**Implementation:**
- Templates stored in `~/.claude/templates/` or bundled
- `./mcp --init developer` creates `./.mcp.json` with template
- Prompts before overwriting existing config

---

## Part 4: Windows PowerShell Implementation

### 4.1 Architecture Overview

**File:** `mcp.ps1` (PowerShell Core 7.0+ compatible)

**Key Differences from Bash:**
| Aspect | Bash | PowerShell |
|--------|------|------------|
| Associative arrays | `declare -A` | `[hashtable]` or `[ordered]` |
| JSON parsing | `jq` | `ConvertFrom-Json` (native) |
| TUI | `fzf` | `fzf` (via winget) or `Out-ConsoleGridView` |
| Temp files | `mktemp` | `[System.IO.Path]::GetTempFileName()` |
| Atomic move | `mv` | `Move-Item -Force` |
| Path handling | `/path/to/file` | `$env:USERPROFILE\.claude\` |

### 4.2 Configuration Paths (Windows Native)

```powershell
# User scope
$UserConfig = "$env:USERPROFILE\.claude.json"
$UserSettings = "$env:USERPROFILE\.claude\settings.json"
$UserSettingsLocal = "$env:USERPROFILE\.claude\settings.local.json"
$UserMcp = "$env:USERPROFILE\.mcp.json"

# Project scope (current directory)
$ProjectMcp = ".\.mcp.json"
$ProjectSettings = ".\.claude\settings.json"
$ProjectSettingsLocal = ".\.claude\settings.local.json"

# Enterprise scope
$EnterpriseMcp = "$env:ProgramData\ClaudeCode\managed-mcp.json"
$EnterpriseSettings = "$env:ProgramData\ClaudeCode\managed-settings.json"
```

### 4.3 Core Functions (PowerShell)

```powershell
# Entry point
function Start-McpSelector {
    param(
        [switch]$Audit,
        [switch]$FixConfig,
        [string]$Init,
        [switch]$StrictDisable
    )

    Test-Dependencies
    $state = Get-MergedServerState
    if ($Audit) { Show-ConfigAudit; return }
    Start-FzfTui -State $state
    Save-StateToSettings
    Start-Process "claude" -ArgumentList $args
}

# Discovery and parsing
function Get-MergedServerState {
    $definitions = @{}
    $states = @{}

    # Parse all sources
    Get-EnterpriseConfig | ForEach-Object { Merge-Definition $_ $definitions }
    Get-UserConfig | ForEach-Object { Merge-Definition $_ $definitions }
    Get-ProjectConfig | ForEach-Object { Merge-Definition $_ $definitions }
    Get-LocalConfig | ForEach-Object { Merge-Definition $_ $definitions }

    Get-SettingsStates | ForEach-Object { Merge-State $_ $states }

    # Combine definitions and states
    $result = @()
    foreach ($server in $definitions.Keys) {
        $def = $definitions[$server]
        $state = $states[$server] ?? "on"
        $result += [PSCustomObject]@{
            Name = $server
            State = $state.Split(':')[1]
            Scope = $def.Split(':')[1]
            File = $def.Split(':')[2]
            Type = $def.Split(':')[3]
            Flags = $def.Split(':')[4]
        }
    }
    return $result
}

# Toggle with 3-way state
function Set-ServerToggle {
    param([string]$ServerName, [object]$CurrentState)

    $current = $CurrentState.State
    $runtime = $CurrentState.Runtime

    switch ($true) {
        # RED → GREEN
        ($current -eq 'off') {
            $CurrentState.State = 'on'
            Remove-FromDisabledMcpServers $ServerName
        }
        # GREEN → ORANGE
        (($current -eq 'on') -and ($runtime -ne 'stopped')) {
            Add-ToDisabledMcpServers $ServerName
            $CurrentState.Runtime = 'stopped'
        }
        # ORANGE → RED
        (($current -eq 'on') -and ($runtime -eq 'stopped')) {
            $CurrentState.State = 'off'
            Remove-FromDisabledMcpServers $ServerName
        }
    }
}
```

### 4.4 TUI Options for Windows

**Option 1: fzf (Recommended)**
- Install via: `winget install fzf`
- Same keybindings as Linux version
- Full feature parity

**Option 2: Out-ConsoleGridView (Fallback)**
- Part of Microsoft.PowerShell.ConsoleGuiTools
- `Install-Module Microsoft.PowerShell.ConsoleGuiTools`
- Limited compared to fzf but no external dependencies

**Option 3: Native PowerShell Menu**
- Custom implementation using `$host.UI.RawUI`
- Most compatible but least feature-rich

### 4.5 Cross-Platform Shared Logic

**Shared Configuration:** `mcp-shared.json`
```json
{
  "version": "2.0",
  "scopePriorities": {
    "enterprise": 4,
    "local": 3,
    "project": 2,
    "user": 1
  },
  "controlArrayLocations": {
    "enabledMcpjsonServers": ["settings"],
    "disabledMcpjsonServers": ["settings"],
    "disabledMcpServers": ["claude.json"],
    "enabledPlugins": ["settings"]
  },
  "templates": {
    "minimal": {},
    "developer": { ... }
  }
}
```

**Strategy:** Extract business logic to JSON config, keep platform-specific code minimal.

---

## Part 5: Testing Infrastructure

### 5.1 Test Framework Selection

**Bash:** bats-core (Bash Automated Testing System)
**PowerShell:** Pester

### 5.2 Test Categories

```
tests/
├── unit/
│   ├── test_parse_settings.bats
│   ├── test_parse_mcp_json.bats
│   ├── test_parse_claude_json.bats
│   ├── test_precedence_resolution.bats
│   ├── test_toggle_logic.bats
│   └── test_enterprise_validation.bats
├── integration/
│   ├── test_full_discovery.bats
│   ├── test_save_cycle.bats
│   ├── test_migration.bats
│   └── test_audit.bats
├── fixtures/
│   ├── claude.json.basic
│   ├── claude.json.with_projects
│   ├── settings.json.enabled
│   ├── settings.json.disabled
│   ├── managed-mcp.json.enterprise
│   └── managed-settings.json.policies
└── powershell/
    ├── Test-ParseSettings.Tests.ps1
    ├── Test-PrecedenceResolution.Tests.ps1
    └── ...
```

### 5.3 Test Matrix

| Scenario | Bash | PowerShell | Priority |
|----------|------|------------|----------|
| Basic discovery | ✅ | ✅ | P0 |
| Precedence resolution | ✅ | ✅ | P0 |
| 3-way toggle | ✅ | ✅ | P0 |
| Enterprise policies | ✅ | ✅ | P0 |
| Migration flow | ✅ | ✅ | P1 |
| Plugin discovery | ✅ | ✅ | P1 |
| Atomic writes | ✅ | ✅ | P1 |
| Backup/restore | ✅ | ✅ | P1 |
| Audit mode | ✅ | ✅ | P2 |
| Config auto-fix | ✅ | ✅ | P2 |

### 5.4 CI/CD Integration

**GitHub Actions Workflow:**
```yaml
name: MCP Selector Tests
on: [push, pull_request]

jobs:
  test-bash:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        run: |
          sudo apt-get install -y jq
          npm install -g bats
      - name: Run tests
        run: bats tests/unit/*.bats tests/integration/*.bats

  test-powershell:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Pester
        run: Install-Module Pester -Force -Scope CurrentUser
      - name: Run tests
        run: Invoke-Pester tests/powershell/*.Tests.ps1
```

---

## Part 6: Implementation Phases

### Phase 1: Critical Bug Workarounds (Week 1-2)
- [ ] Implement `validate_runtime_overrides()` for session startup bug
- [ ] Add `audit_config_structure()` for control array detection
- [ ] Add `--strict-disable` flag
- [ ] Add ALT-H hard-disable for plugins with warning
- [ ] Update documentation with known issues

### Phase 2: Algorithm Optimizations (Week 3-4)
- [ ] Implement single-pass plugin state aggregation
- [ ] Add lazy runtime state caching
- [ ] Implement batch toggle operations
- [ ] Profile and benchmark improvements

### Phase 3: New Features (Week 5-6)
- [ ] Configuration audit mode (`--audit`)
- [ ] Server type filters (ALT-1 through ALT-4)
- [ ] Version history for settings
- [ ] Configuration templates (`--init`)

### Phase 4: Windows PowerShell (Week 7-8)
- [ ] Port core functions to PowerShell
- [ ] Implement fzf integration on Windows
- [ ] Adapt path handling for Windows
- [ ] Cross-platform testing

### Phase 5: Testing & Polish (Week 9-10)
- [ ] Implement bats-core test suite
- [ ] Implement Pester test suite
- [ ] Set up GitHub Actions CI/CD
- [ ] Update README and documentation

---

## Part 7: Decision Logic Deep Dive

### 7.1 Complete State Transition Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Server State Transitions                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐      SPACE      ┌──────────────┐      SPACE               │
│  │   🔴 RED     │ ─────────────▶  │   🟢 GREEN   │ ─────────────▶           │
│  │   (OFF)      │                 │   (ON)       │                           │
│  │              │                 │              │     ┌──────────────┐      │
│  │ Config: off  │                 │ Config: on   │     │  🟠 ORANGE   │      │
│  │ Runtime: -   │                 │ Runtime: run │     │  (RUNTIME    │      │
│  │              │                 │              │     │   DISABLED)  │      │
│  └──────────────┘                 └──────────────┘     │              │      │
│         ▲                                              │ Config: on   │      │
│         │                                              │ Runtime: stop│      │
│         │           SPACE                              │              │      │
│         └───────────────────────────────────────────── └──────────────┘      │
│                                                              │               │
│                                                              │ SPACE         │
│                                                              ▼               │
│                                                        (loops to RED)        │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ CONFIG WRITES:                                                               │
│                                                                              │
│ RED → GREEN:                                                                 │
│   1. Add to enabledMcpjsonServers (if MCPJSON)                               │
│   2. Remove from disabledMcpjsonServers (if MCPJSON)                         │
│   3. Remove from disabledMcpServers in ~/.claude.json                        │
│                                                                              │
│ GREEN → ORANGE:                                                              │
│   1. Keep enabledMcpjsonServers unchanged (or add if not present)            │
│   2. Add to disabledMcpServers in ~/.claude.json .projects[cwd]              │
│   3. Server stays "configured" but won't run                                 │
│                                                                              │
│ ORANGE → RED:                                                                │
│   1. Remove from enabledMcpjsonServers (if MCPJSON)                          │
│   2. Add to disabledMcpjsonServers (if MCPJSON)                              │
│   3. Remove from disabledMcpServers                                          │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ SPECIAL CASES:                                                               │
│                                                                              │
│ Enterprise (flag=e):  Cannot toggle - always enabled, show 🏢               │
│ Blocked (flag=b):     Cannot enable - show 🔒                                │
│ Restricted (flag=r):  Cannot enable - show ⚠️                                │
│ Plugin (type=plugin): Uses enabledPlugins instead of MCP arrays              │
│ Direct (type=direct): Uses only disabledMcpServers, not MCP arrays           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Precedence Resolution Flowchart

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Precedence Resolution Algorithm                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  INPUT: Server name "fetch"                                                  │
│                                                                              │
│  STEP 1: Find All Definitions                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Enterprise: /etc/claude-code/managed-mcp.json → fetch (priority 4)  │    │
│  │ User:       ~/.mcp.json                       → fetch (priority 1)  │    │
│  │ Project:    ./.mcp.json                       → fetch (priority 2)  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  STEP 2: Select Winning Definition                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Compare priorities: 4 > 2 > 1                                        │    │
│  │ Winner: Enterprise (priority 4)                                      │    │
│  │ If equal priority: Use last-parsed (settings.local > settings)       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  STEP 3: Find All Enable/Disable Directives                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ User settings:    enabledMcpjsonServers: ["fetch"] (priority 1)     │    │
│  │ Project settings: disabledMcpjsonServers: ["fetch"] (priority 2)    │    │
│  │ Local settings:   (not mentioned)                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  STEP 4: Select Winning State                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Compare: Project disable (2) > User enable (1)                       │    │
│  │ Winner: DISABLED (from project scope)                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  STEP 5: Apply Enterprise Overrides                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Check: Is server enterprise-managed (flag=e)?                        │    │
│  │   YES → Force ENABLED, ignore all user/project states                │    │
│  │   NO  → Use resolved state                                           │    │
│  │                                                                       │    │
│  │ Check: Is server in denylist?                                         │    │
│  │   YES → Force BLOCKED (flag=b), even if enterprise                   │    │
│  │   NO  → Continue                                                      │    │
│  │                                                                       │    │
│  │ Check: Is allowlist defined AND server NOT in it?                    │    │
│  │   YES → Force RESTRICTED (flag=r), unless enterprise                 │    │
│  │   NO  → Continue                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  STEP 6: Check Runtime Override                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Check: Is server in ~/.claude.json .projects[cwd].disabledMcpServers?│   │
│  │   YES → Set runtime=stopped (ORANGE state)                           │    │
│  │   NO  → Set runtime=running (if enabled) or unknown                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  OUTPUT: state:fetch:enterprise:/etc/.../managed-mcp.json:mcpjson:e:running │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Save Logic Decision Tree

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Save State Decision Tree                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  FOR EACH server in state file:                                              │
│                                                                              │
│  ┌─────────────────┐                                                         │
│  │ What is the     │                                                         │
│  │ source_type?    │                                                         │
│  └────────┬────────┘                                                         │
│           │                                                                  │
│     ┌─────┴─────┬─────────────┬─────────────┐                               │
│     ▼           ▼             ▼             ▼                               │
│  ┌──────┐   ┌───────┐   ┌──────────┐   ┌────────┐                           │
│  │mcpjson│   │plugin │   │direct-   │   │direct- │                           │
│  │      │   │       │   │global    │   │local   │                           │
│  └───┬──┘   └───┬───┘   └────┬─────┘   └────┬───┘                           │
│      │          │            │              │                               │
│      ▼          ▼            │              │                               │
│  ┌──────────────────────┐    └──────┬───────┘                               │
│  │ Check state+runtime  │           │                                       │
│  └──────────┬───────────┘           ▼                                       │
│             │                ┌───────────────────┐                          │
│     ┌───────┼───────┐        │ Only use         │                          │
│     ▼       ▼       ▼        │ disabledMcpServers│                          │
│  ┌─────┐ ┌─────┐ ┌─────┐     │ in ~/.claude.json │                          │
│  │GREEN│ │ORANGE│ │RED │     └─────────┬─────────┘                          │
│  └──┬──┘ └──┬──┘ └──┬──┘               │                                    │
│     │       │       │                  │                                    │
│     │       │       │           ┌──────┴──────┐                             │
│     │       │       │           ▼             ▼                             │
│     │       │       │     state=on       state=off                          │
│     │       │       │     runtime!=stop  OR any runtime                     │
│     │       │       │         │              │                              │
│     │       │       │         ▼              ▼                              │
│     │       │       │     Remove from    Add to                             │
│     │       │       │     disabled       disabled                           │
│     │       │       │                                                       │
│     ▼       ▼       ▼                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ MCPJSON/Plugin: Write to ./.claude/settings.local.json              │   │
│  │                                                                      │   │
│  │ GREEN:  Add to enabledMcpjsonServers                                 │   │
│  │         Remove from disabledMcpjsonServers                           │   │
│  │                                                                      │   │
│  │ ORANGE: Neither array (controlled by disabledMcpServers only)        │   │
│  │         Write to ~/.claude.json .projects[cwd].disabledMcpServers    │   │
│  │                                                                      │   │
│  │ RED:    Remove from enabledMcpjsonServers                            │   │
│  │         Add to disabledMcpjsonServers                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ PLUGIN SPECIAL CASE:                                                 │   │
│  │                                                                      │   │
│  │ If disabling plugin:                                                 │   │
│  │   1. Check if enabled in lower-priority scope                        │   │
│  │      YES → Write explicit false (to override)                        │   │
│  │      NO  → Omit from enabledPlugins (soft disable)                   │   │
│  │                                                                      │   │
│  │   2. If user chose "hard disable" (ALT-H):                           │   │
│  │      Always write explicit false (with UI warning)                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 8: Migration Path

### 8.1 Backward Compatibility

**State File Format:**
- v1.x format: `state:server:scope:file:type:flags`
- v2.0 format: `state:server:scope:file:type:flags:runtime:def_priority:state_priority:state_source`
- Detection: Check field count, migrate on first load
- v1.x files will be auto-upgraded silently

**Configuration:**
- No changes to user config files
- All changes are additive
- Existing settings continue to work

### 8.2 Version Detection

```bash
# Add to mcp script header
MCP_STATE_VERSION="2.0"

detect_state_version() {
    local first_line=$(head -1 "$STATE_FILE")
    local field_count=$(echo "$first_line" | tr ':' '\n' | wc -l)

    if [[ $field_count -le 7 ]]; then
        echo "1.x"
    else
        echo "2.0"
    fi
}

migrate_state_if_needed() {
    local version=$(detect_state_version)
    if [[ "$version" == "1.x" ]]; then
        # Rebuild state file with new format
        discover_and_parse_all_sources > "$STATE_FILE"
    fi
}
```

---

## Appendix A: File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `mcp` | Modify | Add all bash improvements |
| `mcp.ps1` | Create | New Windows PowerShell version |
| `mcp-shared.json` | Create | Shared configuration/templates |
| `tests/` | Create | Test suite directory |
| `.github/workflows/test.yml` | Create | CI/CD pipeline |
| `README.md` | Update | Document new features |
| `CHANGELOG.md` | Create | Version history |

## Appendix B: Dependencies

**Bash Version:**
- Current: Bash 4.0+
- Recommended: Bash 5.0+ (better associative array handling)

**External Tools:**
- `jq` 1.6+ (unchanged)
- `fzf` 0.40+ (unchanged)

**PowerShell:**
- PowerShell Core 7.0+ (cross-platform)
- Or Windows PowerShell 5.1+ (Windows only)

## Appendix C: Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing configs | High | Extensive backward compat testing |
| Claude API changes | Medium | Abstract Claude interactions |
| Performance regression | Low | Benchmark before/after |
| Windows edge cases | Medium | Comprehensive Windows testing |
| Enterprise policy conflicts | High | Lockdown mode + clear errors |
