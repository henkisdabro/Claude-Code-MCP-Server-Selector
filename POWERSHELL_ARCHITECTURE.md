# PowerShell Native Version - Architecture Design

## Executive Summary

This document outlines the architecture for a **native PowerShell version** of the MCP Server Selector. The goal is to provide a first-class Windows experience with zero dependencies (beyond PowerShell modules).

## Design Decisions

### 1. Module vs Script

**Decision: PowerShell Module (.psm1)**

- Publishable to PowerShell Gallery
- Follows PowerShell best practices
- Easy installation: `Install-Module MCP-Selector`
- Auto-updates via `Update-Module`
- Import-Module for advanced usage

### 2. TUI Framework

**Decision: PSFzf + Fallback to Out-GridView**

**Primary: PSFzf**
- Industry standard for PowerShell fuzzy finding
- Same UX as bash version (consistency)
- Requires: `fzf.exe` (easily installed via `scoop install fzf`)
- Installation: `Install-Module PSFzf`

**Fallback: Out-GridView**
- Native Windows GUI (zero dependencies)
- No installation required
- Different UX but functional
- Use when PSFzf not available

### 3. JSON Handling

**Decision: Native PowerShell Cmdlets**

- `ConvertFrom-Json` - Parse JSON
- `ConvertTo-Json -Depth 10` - Serialize JSON
- Native, fast, zero dependencies

### 4. Repository Structure

**Decision: Monorepo with Separate Directories**

```
Claude-Code-MCP-Server-Selector/
├── mcp                          # Bash script (Linux/macOS)
├── install.sh                   # Bash installer
├── src/
│   └── powershell/
│       ├── MCP-Selector/        # PowerShell module
│       │   ├── MCP-Selector.psd1       # Module manifest
│       │   ├── MCP-Selector.psm1       # Main module
│       │   ├── Private/                # Private functions
│       │   │   ├── Config.ps1          # Config discovery/parsing
│       │   │   ├── Server.ps1          # Server state management
│       │   │   ├── Enterprise.ps1      # Enterprise support
│       │   │   ├── UI.ps1              # UI helpers
│       │   │   └── Util.ps1            # Utilities
│       │   └── Public/                 # Exported functions
│       │       └── Invoke-MCPSelector.ps1
│       └── install.ps1          # PowerShell installer
├── README.md
├── WINDOWS_INSTALL.md
└── POWERSHELL_ARCHITECTURE.md  # This file
```

## Module Architecture

### Core Components

#### 1. Configuration Management (`Private/Config.ps1`)

**Functions:**
- `Get-MCPConfigPaths` - Discover all 8 config sources
- `Get-EnterpriseConfigPaths` - Platform-specific enterprise paths
- `ConvertFrom-MCPSettings` - Parse settings.json files
- `ConvertFrom-MCPJson` - Parse .mcp.json files
- `ConvertFrom-ClaudeJson` - Parse .claude.json files
- `ConvertFrom-PluginMarketplace` - Parse plugin files
- `Resolve-MCPPrecedence` - Dual precedence resolution

**Key Data Structure:**
```powershell
[PSCustomObject]@{
    Name         = "fetch"
    State        = "on"       # on/off
    Runtime      = "running"  # running/stopped/unknown
    SourceType   = "mcpjson"  # mcpjson/direct-global/direct-local/plugin
    DefinitionScope = "project"
    DefinitionFile  = "./.mcp.json"
    EnabledInScope  = "user"   # Where enabled/disabled
    Flags        = "e"         # e=enterprise, b=blocked, r=restricted
    Command      = "uvx"
    Args         = @("mcp-server-fetch")
}
```

#### 2. Server State Management (`Private/Server.ps1`)

**Functions:**
- `Get-MCPServers` - Load and merge all servers
- `Set-MCPServerState` - Toggle server state (3-way)
- `Test-ServerAllowed` - Check enterprise restrictions
- `Add-DisabledMCPServer` - Add to runtime override list
- `Remove-DisabledMCPServer` - Remove from runtime override
- `Get-MCPRuntimeServers` - Query `claude mcp list`

**3-Way Toggle Logic:**
```powershell
function Set-MCPServerState {
    param($Server, [ValidateSet('RED', 'GREEN', 'ORANGE')]$NewState)

    switch ($NewState) {
        'RED' {
            # Config: disabled, Runtime: N/A
            Add-ToDisabledMcpjsonServers $Server
            Remove-FromEnabledMcpjsonServers $Server
            Remove-DisabledMCPServer $Server
        }
        'GREEN' {
            # Config: enabled, Runtime: enabled
            Add-ToEnabledMcpjsonServers $Server
            Remove-FromDisabledMcpjsonServers $Server
            Remove-DisabledMCPServer $Server
        }
        'ORANGE' {
            # Config: enabled, Runtime: disabled
            Add-ToEnabledMcpjsonServers $Server
            Remove-FromDisabledMcpjsonServers $Server
            Add-DisabledMCPServer $Server
        }
    }
}
```

#### 3. Enterprise Support (`Private/Enterprise.ps1`)

**Functions:**
- `Get-EnterpriseMCPConfig` - Load managed-mcp.json
- `Get-EnterpriseRestrictions` - Load managed-settings.json
- `Test-ServerInAllowlist` - Check allowlist
- `Test-ServerInDenylist` - Check denylist
- `Get-EnterpriseMode` - Determine mode (none/active/lockdown)

**Platform Detection:**
```powershell
function Get-EnterpriseMCPPath {
    if ($IsWindows) {
        # Native Windows
        "$env:ProgramData\ClaudeCode\managed-mcp.json"
    } elseif (Test-Path /proc/version) {
        # WSL - check both
        $winPath = "/mnt/c/ProgramData/ClaudeCode/managed-mcp.json"
        $linPath = "/etc/claude-code/managed-mcp.json"
        if (Test-Path $winPath) { return $winPath }
        if (Test-Path $linPath) { return $linPath }
    } elseif ($IsMacOS) {
        "/Library/Application Support/ClaudeCode/managed-mcp.json"
    } else {
        "/etc/claude-code/managed-mcp.json"
    }
}
```

#### 4. UI Components (`Private/UI.ps1`)

**PSFzf Integration:**
```powershell
function Show-MCPSelectorTUI {
    param([PSCustomObject[]]$Servers)

    # Format server list with ANSI colors
    $serverList = $Servers | ForEach-Object {
        $indicator = switch ($_.State) {
            'on' {
                if ($_.Runtime -eq 'stopped') {
                    "$($PSStyle.Foreground.BrightYellow)●$($PSStyle.Reset)"  # ORANGE
                } else {
                    "$($PSStyle.Foreground.Green)●$($PSStyle.Reset)"         # GREEN
                }
            }
            'off' { "$($PSStyle.Foreground.Red)○$($PSStyle.Reset)" }         # RED
        }

        $flags = if ($_.Flags -match 'e') { '🏢 ' } else { '' }

        "$indicator $flags$($_.Name) ($($_.DefinitionScope), $($_.SourceType))"
    }

    # Check if PSFzf available
    if (Get-Command Invoke-Fzf -ErrorAction SilentlyContinue) {
        # Use PSFzf (preferred)
        $selected = $serverList | Invoke-Fzf `
            -Multi `
            -Preview { param($line) Get-MCPServerPreview $line } `
            -Bind @{
                'space:toggle+down'
                'ctrl-a:execute(Add-MCPServer)+reload(Get-MCPServers)'
                'ctrl-x:execute(Remove-MCPServer {})+reload(Get-MCPServers)'
                'alt-m:execute(Move-MCPServerToProject {})+reload(Get-MCPServers)'
            } `
            -Header "SPACE=toggle | ENTER=save | ESC=cancel | CTRL-A=add | CTRL-X=remove"

        return $selected
    } else {
        # Fallback to Out-GridView
        $selected = $serverList | Out-GridView `
            -Title "MCP Server Selector (select servers to enable)" `
            -OutputMode Multiple

        return $selected
    }
}
```

**Preview Window:**
```powershell
function Get-MCPServerPreview {
    param([string]$Line)

    $serverName = Extract-ServerName $Line
    $server = $script:AllServers | Where-Object { $_.Name -eq $serverName }

    $preview = @"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Server: $($server.Name)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Defined In: $($server.DefinitionFile) ($($server.DefinitionScope))
$(if ($server.EnabledInScope -ne $server.DefinitionScope) {
"Controlled In: $($server.EnabledInScope)"
})

Current Status: $(if ($server.State -eq 'on') { 'Enabled ✓' } else { 'Disabled ✗' })
Runtime State: $($server.Runtime)

Command: $($server.Command)
Args: $($server.Args -join ' ')

$(if ($server.Flags -match 'e') { "🏢 Enterprise-managed (cannot modify)" })
$(if ($server.Flags -match 'b') { "🔒 Blocked by enterprise policy" })
$(if ($server.Flags -match 'r') { "⚠️  Not in enterprise allowlist" })
"@

    return $preview
}
```

#### 5. Utilities (`Private/Util.ps1`)

**Functions:**
- `ConvertFrom-ANSIString` - Strip ANSI codes
- `Get-VisualWidth` - Calculate display width
- `New-AtomicFileSave` - Atomic JSON save with backup
- `Test-JSONValid` - Validate JSON
- `Get-ClaudeBinary` - Find claude.exe/claude

### Public API

#### Main Function (`Public/Invoke-MCPSelector.ps1`)

```powershell
function Invoke-MCPSelector {
    <#
    .SYNOPSIS
        Interactive MCP server selector for Claude Code

    .DESCRIPTION
        Launches an interactive TUI to enable/disable MCP servers.
        Supports 3-way toggle (RED/GREEN/ORANGE), enterprise policies,
        and multi-source configuration.

    .PARAMETER LaunchClaude
        Automatically launch Claude Code after saving changes

    .PARAMETER TestMode
        Run in test mode (don't launch Claude)

    .PARAMETER FastMode
        Skip runtime detection for faster startup

    .PARAMETER Path
        Working directory for project-specific configuration

    .EXAMPLE
        Invoke-MCPSelector
        # Launch interactive selector

    .EXAMPLE
        mcp
        # Short alias (configured in module manifest)

    .EXAMPLE
        Invoke-MCPSelector -Path C:\Projects\MyApp
        # Use specific project directory

    .NOTES
        Requires: PowerShell 7.0+, PSFzf module (optional)
    #>

    [CmdletBinding()]
    param(
        [switch]$LaunchClaude = $true,
        [switch]$TestMode,
        [switch]$FastMode = $true,
        [string]$Path = (Get-Location).Path,
        [Parameter(ValueFromRemainingArguments)]
        [string[]]$ClaudeArgs
    )

    # Main workflow
    Push-Location $Path
    try {
        # Check dependencies
        Test-Dependencies

        # Discover and load servers
        Write-Progress "Discovering MCP servers..."
        $servers = Get-MCPServers -FastMode:$FastMode

        # Launch TUI
        $result = Show-MCPSelectorTUI -Servers $servers

        if ($result) {
            # Save changes
            Save-MCPConfiguration -Servers $result

            # Launch Claude
            if ($LaunchClaude -and -not $TestMode) {
                $claudePath = Get-ClaudeBinary
                & $claudePath @ClaudeArgs
            }
        }
    } finally {
        Pop-Location
    }
}

# Aliases
Set-Alias -Name mcp -Value Invoke-MCPSelector
Set-Alias -Name claudemcp -Value Invoke-MCPSelector

Export-ModuleMember -Function Invoke-MCPSelector -Alias mcp, claudemcp
```

## Module Manifest (`MCP-Selector.psd1`)

```powershell
@{
    ModuleVersion     = '2.0.0'
    GUID              = '12345678-1234-1234-1234-123456789abc'
    Author            = 'MCP Selector Contributors'
    Description       = 'Interactive MCP server selector for Claude Code (PowerShell Native)'
    PowerShellVersion = '7.0'

    FunctionsToExport = @('Invoke-MCPSelector')
    AliasesToExport   = @('mcp', 'claudemcp')

    PrivateData = @{
        PSData = @{
            Tags         = @('Claude', 'MCP', 'TUI', 'DevTools')
            ProjectUri   = 'https://github.com/henkisdabro/Claude-Code-MCP-Server-Selector'
            LicenseUri   = 'https://github.com/henkisdabro/Claude-Code-MCP-Server-Selector/blob/main/LICENSE'
            RequireLicenseAcceptance = $false
        }
    }
}
```

## Installation & Distribution

### PowerShell Gallery (Recommended)

```powershell
# Install from PowerShell Gallery
Install-Module MCP-Selector -Scope CurrentUser

# Import and use
Import-Module MCP-Selector
mcp
```

### Manual Installation

```powershell
# Clone and import
git clone https://github.com/henkisdabro/Claude-Code-MCP-Server-Selector.git
Import-Module ./Claude-Code-MCP-Server-Selector/src/powershell/MCP-Selector

# Or install locally
Copy-Item -Recurse ./src/powershell/MCP-Selector "$env:USERPROFILE\Documents\PowerShell\Modules\"
```

### Installer Script (`src/powershell/install.ps1`)

```powershell
<#
.SYNOPSIS
    Install MCP-Selector PowerShell module
#>

[CmdletBinding()]
param(
    [switch]$InstallDependencies
)

Write-Host "MCP Server Selector - PowerShell Installation" -ForegroundColor Cyan
Write-Host ""

# Check PowerShell version
if ($PSVersionTable.PSVersion.Major -lt 7) {
    Write-Error "PowerShell 7.0 or higher required. Install from: https://aka.ms/powershell"
    exit 1
}

# Check for PSFzf (optional)
if (-not (Get-Module PSFzf -ListAvailable)) {
    Write-Warning "PSFzf module not found (optional, provides better UX)"

    if ($InstallDependencies) {
        Write-Host "Installing PSFzf..." -ForegroundColor Yellow
        Install-Module PSFzf -Scope CurrentUser -Force
    } else {
        Write-Host ""
        Write-Host "To install PSFzf:" -ForegroundColor Cyan
        Write-Host "  Install-Module PSFzf -Scope CurrentUser"
        Write-Host ""
        Write-Host "PSFzf requires fzf.exe (install with: scoop install fzf)"
        Write-Host ""
    }
}

# Install module
Write-Host "Installing MCP-Selector module..." -ForegroundColor Cyan
$modulePath = "$env:USERPROFILE\Documents\PowerShell\Modules\MCP-Selector"

if (Test-Path $modulePath) {
    Write-Warning "Removing existing installation..."
    Remove-Item $modulePath -Recurse -Force
}

Copy-Item -Recurse "$PSScriptRoot/MCP-Selector" $modulePath

Write-Host "✓ Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Usage:" -ForegroundColor Cyan
Write-Host "  mcp        # Launch selector"
Write-Host "  claudemcp  # Alternative alias"
Write-Host ""
```

## Dependencies

### Required
- PowerShell 7.0+ (cross-platform)
- Claude Code CLI

### Optional
- **PSFzf module** - Better TUI experience
- **fzf.exe** - Required by PSFzf (install via `scoop install fzf`)

### Fallback
- **Out-GridView** - Built-in GUI selector (no dependencies)

## Platform Support

- ✅ **Windows** (native PowerShell)
- ✅ **WSL** (PowerShell Core)
- ✅ **Linux** (PowerShell Core)
- ✅ **macOS** (PowerShell Core)

## Migration Path

### For Existing Users

1. **Bash version** continues to work
2. **PowerShell version** can coexist
3. **Same configuration files** (100% compatible)
4. **User choice** - use whichever they prefer

### For New Windows Users

- Install PowerShell module (recommended)
- Or use bash version via Git Bash (fallback)

## Performance Considerations

- **FAST_MODE** by default (skip `claude mcp list`)
- **Caching** - cache config discovery results
- **Lazy loading** - load plugin data only when needed
- **Parallel processing** - use `ForEach-Object -Parallel` for multi-file parsing

## Testing Strategy

```powershell
# Pester tests
Describe "MCP-Selector" {
    Context "Configuration Discovery" {
        It "Finds all config sources" {
            $configs = Get-MCPConfigPaths
            $configs.Count | Should -BeGreaterThan 0
        }
    }

    Context "Server State Management" {
        It "Toggles server state correctly" {
            # Test 3-way toggle cycle
        }
    }

    Context "Enterprise Support" {
        It "Respects denylist" {
            # Test enterprise restrictions
        }
    }
}
```

## Next Steps

1. ✅ Design complete
2. ⏳ Implement core module structure
3. ⏳ Implement configuration parsing
4. ⏳ Implement PSFzf TUI
5. ⏳ Implement state management
6. ⏳ Testing and validation
7. ⏳ Documentation
8. ⏳ Publish to PowerShell Gallery

## Open Questions

1. **Module name** - `MCP-Selector` or `ClaudeCode.MCPSelector`?
2. **Versioning** - Start at 2.0.0 (parity with bash) or 1.0.0?
3. **Publishing** - Wait for full feature parity or release incrementally?
