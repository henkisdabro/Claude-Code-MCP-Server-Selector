# PowerShell Version - User Scenarios & Permission Handling

This document details how the PowerShell version of MCP Server Selector handles different user scenarios, permissions, and error conditions.

## User Type Detection

### Standard User (Non-Admin)
**Detection:**
- Windows: Not in `Administrators` group
- Linux/macOS: Not running as root

**Default Behavior:**
- Installation scope: `CurrentUser`
- Module path: `$HOME/Documents/PowerShell/Modules`
- Can install: User-level dependencies (Scoop, Winget)
- Cannot install: System-wide dependencies (Chocolatey without elevation)

**Capabilities:**
- ✅ Install module to user profile
- ✅ Modify own PowerShell modules
- ✅ Read/write to `~/.claude/` directory
- ✅ Read/write to project `.claude/` directory (if owned)
- ✅ Install Scoop (no admin required)
- ✅ Install fzf via Scoop/Winget
- ✅ Install PSFzf module (PowerShell Gallery)
- ✅ Change execution policy for CurrentUser scope

### Administrator User
**Detection:**
- Windows: Member of `Administrators` group
- Linux/macOS: Running as root/sudo

**Default Behavior:**
- Installation scope: `AllUsers` (with option for `CurrentUser`)
- Module path: `C:\Program Files\PowerShell\Modules`
- Can install: All dependencies system-wide

**Capabilities:**
- ✅ All standard user capabilities
- ✅ Install module system-wide
- ✅ Use Chocolatey for dependencies
- ✅ Change system execution policy
- ✅ Install for all users

## Installation Scenarios

### Scenario 1: Standard User, Clean Install

**Environment:**
- Windows 10/11, standard user
- PowerShell 7.2+
- No package managers installed
- Execution policy: Restricted (default)

**Installation Flow:**
```powershell
PS> cd Claude-Code-MCP-Server-Selector/src/powershell
PS> .\install.ps1
```

**What Happens:**
1. ✅ Detects PowerShell 7.2
2. ⚠️  Detects Restricted execution policy
3. ❓ Prompts: "Fix execution policy now? (Y/n)"
   - User selects `Y`
   - Sets `RemoteSigned` for `CurrentUser` scope
4. ✅ Detects standard user → uses `CurrentUser` scope
5. ✅ Verifies write permission to `$HOME/Documents/PowerShell/Modules`
6. ✅ Copies module files
7. ✅ Verifies module loads correctly
8. ❓ Prompts: "Install enhanced UI? (y/N)"
   - User selects `n`
   - Uses default Out-GridView (zero dependencies)
9. ✅ Installation complete

**Result:**
- Module installed to user profile
- Works with Out-GridView (GUI)
- No dependencies installed
- No admin required

### Scenario 2: Standard User, Want Enhanced UI

**Environment:**
- Same as Scenario 1
- User wants terminal-based UI (fzf)

**Installation Flow:**
```powershell
PS> .\install.ps1 -InstallEnhancedUI
```

**What Happens:**
1. ✅ Steps 1-7 from Scenario 1
2. ✅ Auto-install enhanced UI dependencies
3. ⚠️  No package manager detected
4. ❓ Prompts: "Install Scoop now? (Y/n)"
   - User selects `Y`
   - Scoop installed (user-level, no admin needed)
5. ✅ Installs fzf via Scoop
6. ✅ Installs PSFzf module from PowerShell Gallery
7. ✅ Refreshes PATH
8. ✅ Installation complete

**Result:**
- Module installed with enhanced UI
- Scoop + fzf + PSFzf all installed
- No admin required

### Scenario 3: Admin User, System-Wide Install

**Environment:**
- Windows 11, administrator
- PowerShell 7.4
- Chocolatey already installed

**Installation Flow:**
```powershell
PS (Admin)> .\install.ps1
```

**What Happens:**
1. ✅ Detects admin privileges
2. ✅ Auto-selects `AllUsers` scope
3. ✅ Installation path: `C:\Program Files\PowerShell\Modules`
4. ✅ Verifies write permission (has admin rights)
5. ✅ Installs module system-wide
6. ❓ Prompts: "Install enhanced UI? (y/N)"
   - User selects `y`
   - Detects Chocolatey
   - Uses Chocolatey to install fzf
7. ✅ Installation complete

**Result:**
- Module available for all users on system
- Enhanced UI installed system-wide
- Used existing Chocolatey

### Scenario 4: Enterprise Environment

**Environment:**
- Corporate Windows 10
- Restricted execution policy (cannot change)
- No admin rights
- PowerShell Gallery blocked by firewall

**Installation Flow:**
```powershell
PS> .\install.ps1 -Scope CurrentUser -SkipDependencyCheck
```

**What Happens:**
1. ✅ Detects PowerShell version
2. ⚠️  Detects Restricted execution policy
3. ❌ Cannot change execution policy (not allowed by IT)
4. ⚠️  Installation continues with warning
5. ❌ Script execution may fail
6. **Manual Steps Required:**
   - Contact IT to allow execution policy change
   - OR manually copy module files

**Workaround:**
```powershell
# Manual installation without running script
$src = ".\MCP-Selector"
$dst = "$HOME\Documents\PowerShell\Modules\MCP-Selector"
Copy-Item -Recurse $src $dst
Import-Module MCP-Selector
```

### Scenario 5: Permission Denied

**Environment:**
- User profile on network drive (read-only)
- Cannot write to `$HOME/Documents`

**Installation Flow:**
```powershell
PS> .\install.ps1
```

**What Happens:**
1. ✅ Detects PowerShell version
2. ✅ Execution policy OK
3. ✅ Determines `CurrentUser` scope
4. ✅ Path: `\\server\home\user\Documents\PowerShell\Modules`
5. ❌ Write permission test fails
6. ⚠️  Error: "No write permission to \\server\home\user\Documents\PowerShell\Modules"
7. ℹ️  Suggests: "Permission denied to user module directory"

**Workaround:**
```powershell
# Use alternate module path
$altPath = "C:\Users\$env:USERNAME\PowerShellModules"
New-Item -ItemType Directory -Path $altPath -Force
Copy-Item -Recurse .\MCP-Selector $altPath\
$env:PSModulePath += ";$altPath"
Import-Module MCP-Selector
```

## Runtime Scenarios

### Scenario 6: Corrupted Configuration File

**Environment:**
- User has existing `.claude/settings.local.json`
- File has invalid JSON (trailing comma, etc.)

**Runtime Flow:**
```powershell
PS> mcp
```

**What Happens:**
1. ✅ Loads module
2. ✅ Discovers servers
3. ⚠️  Tries to load `.claude/settings.local.json`
4. ❌ JSON parsing fails
5. ✅ **Auto-Recovery:**
   - Creates backup: `.claude/settings.local.json.corrupted-20250111_120000`
   - Starts with fresh empty config
   - Shows warning: "Existing settings file is corrupted, creating backup"
6. ✅ User can still use selector
7. ℹ️  Backup preserved for recovery

**Result:**
- Corrupted file safely backed up
- User can continue working
- No data loss (backup available)

### Scenario 7: No Write Permission to .claude Directory

**Environment:**
- Project directory owned by another user
- User can read but not write to `.claude/`

**Runtime Flow:**
```powershell
PS C:\TeamProject> mcp
```

**What Happens:**
1. ✅ Loads servers (read-only operations work)
2. ✅ Shows UI
3. ✅ User makes selections
4. ❌ Save fails: "No write permission to C:\TeamProject\.claude"
5. ℹ️  Shows troubleshooting steps:
   - Check you have write permission to: C:\TeamProject\.claude
   - Ensure the directory is not read-only
   - Close any applications that might have the file open

**Workaround:**
- Ask project owner to grant write permission
- OR run from personal copy of project
- OR changes won't persist (read-only mode)

### Scenario 8: Missing Claude Code

**Environment:**
- Module installed correctly
- Claude Code CLI not in PATH

**Runtime Flow:**
```powershell
PS> mcp
```

**What Happens:**
1. ✅ Loads module
2. ✅ Shows selector UI
3. ✅ User makes changes and saves
4. ✅ Configuration saved successfully
5. ❌ Attempts to launch Claude Code
6. ❌ Error: "Claude Code binary not found"
7. ℹ️  Message: "Please ensure Claude Code CLI is installed"

**Workaround:**
- Install Claude Code CLI
- Add Claude to PATH
- OR use `-TestMode` flag to skip Claude launch:
  ```powershell
  mcp -TestMode
  ```

## Error Handling Matrix

| Error Condition | Detection | Handling | User Impact |
|----------------|-----------|----------|-------------|
| **PowerShell < 7.0** | Pre-flight | Hard fail with download link | Cannot install |
| **Restricted execution policy** | Pre-flight | Offer to fix, continue with warning | May fail later |
| **No write permission** | Pre-flight | Hard fail with guidance | Cannot install |
| **Missing source files** | Pre-flight | Hard fail with usage instructions | Cannot install |
| **Module already installed** | Pre-flight | Prompt to reinstall | User choice |
| **Corrupted JSON** | Runtime | Auto-backup + fresh start | Continues working |
| **No write permission (save)** | Runtime | Fail with troubleshooting steps | Changes not saved |
| **Missing .claude.json** | Runtime | Warning, skip Direct overrides | MCPJSON still works |
| **PowerShell Gallery blocked** | Dependency install | Show manual install steps | Enhanced UI unavailable |
| **No package manager** | Dependency install | Offer to install Scoop | Auto-recovers |
| **Claude Code not found** | Launch | Error message, config still saved | Manual launch needed |

## Dependency Installation Matrix

| Package Manager | User Type | Auto-Install | Notes |
|----------------|-----------|--------------|-------|
| **Winget** | Standard | N/A (built-in Win11+) | Preferred for Win11+ |
| **Scoop** | Standard | ✅ Yes | Auto-installed if needed |
| **Scoop** | Admin | ✅ Yes | User-level install |
| **Chocolatey** | Standard | ❌ No | Requires admin |
| **Chocolatey** | Admin | N/A (assumes installed) | Used if available |
| **Homebrew** | Any (macOS/Linux) | N/A | Used if available |

## Permission Requirements Summary

### Installation Phase
| Operation | Standard User | Admin User |
|-----------|--------------|------------|
| Install to CurrentUser scope | ✅ | ✅ |
| Install to AllUsers scope | ❌ | ✅ |
| Change CurrentUser execution policy | ✅ | ✅ |
| Change system execution policy | ❌ | ✅ |
| Install Scoop | ✅ | ✅ |
| Install Chocolatey packages | ❌ | ✅ |
| Install from PowerShell Gallery | ✅ | ✅ |

### Runtime Phase
| Operation | Required Permission | Fallback |
|-----------|-------------------|----------|
| Read config files | Read access to ~/.claude/, ./.claude/ | None - fails if no read |
| Write to ./.claude/settings.local.json | Write to project .claude/ dir | Error with guidance |
| Write to ~/.claude.json | Write to home directory | Warning (MCPJSON still works) |
| Create .claude/ directory | Write to project root | Error with guidance |
| Create backups | Write to config directory | Skip backups |
| Launch Claude Code | Claude in PATH | Error (config still saved) |

## Best Practices

### For Standard Users
1. Use default installation: `.\install.ps1`
2. Let it install Scoop if needed
3. Use Out-GridView (works everywhere)
4. Optionally add enhanced UI later

### For Administrators
1. Decide if system-wide or user-only:
   - System-wide: `.\install.ps1` (default)
   - User-only: `.\install.ps1 -Scope CurrentUser`
2. Can use Chocolatey if already installed
3. Consider installing for all users

### For Enterprise Environments
1. Pre-install PowerShell 7+
2. Set execution policy to RemoteSigned
3. Ensure PowerShell Gallery access
4. OR provide offline installation:
   ```powershell
   # Copy module to network share
   \\server\share\PowerShell\Modules\MCP-Selector\
   # Users import from share
   $env:PSModulePath += ";\\server\share\PowerShell\Modules"
   ```

### For Restricted Environments
1. Manual installation method (copy files)
2. Use `-SkipDependencyCheck` flag
3. Stick with Out-GridView (no dependencies)
4. Document workarounds for users

## Troubleshooting Guide

### "Execution policy is Restricted"
**Solution:**
```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### "No write permission to Documents/PowerShell/Modules"
**Solution:**
```powershell
# Use alternate path
.\install.ps1 -Scope CurrentUser
# If still fails, check folder permissions or use manual install
```

### "Module failed to load"
**Solution:**
```powershell
# Check module was copied correctly
Get-ChildItem "$HOME\Documents\PowerShell\Modules\MCP-Selector"

# Try manual import
Import-Module MCP-Selector -Verbose
```

### "Failed to save configuration"
**Solution:**
```powershell
# Check write permission
Test-Path .\.claude -PathType Container
# Check folder is not read-only
Get-ItemProperty .\.claude | Select-Object Attributes
```

### "PowerShell Gallery blocked"
**Solution:**
```powershell
# Manual PSFzf install
# Download from https://github.com/kelleyma49/PSFzf
# Extract to $HOME\Documents\PowerShell\Modules\PSFzf
```

## Summary

The PowerShell version is designed to work in **all scenarios**:
- ✅ Standard users (most common)
- ✅ Administrator users
- ✅ Restricted execution policies (with guidance)
- ✅ Enterprise environments
- ✅ Offline/air-gapped systems (manual install)
- ✅ Corrupted configurations (auto-recovery)
- ✅ Permission issues (clear error messages)
- ✅ Missing dependencies (auto-install or fallback)

Every error condition provides:
- **Clear explanation** of what went wrong
- **Specific guidance** on how to fix it
- **Fallback options** when automatic fixes aren't possible
- **Preservation of data** (backups, non-destructive operations)
