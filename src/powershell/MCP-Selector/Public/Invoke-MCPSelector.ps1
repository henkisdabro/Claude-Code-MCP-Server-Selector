# Invoke-MCPSelector.ps1 - Main public API for MCP-Selector

function Invoke-MCPSelector {
    <#
    .SYNOPSIS
        Interactive MCP server selector for Claude Code

    .DESCRIPTION
        Launches an interactive UI to enable/disable MCP servers.
        Supports 3-way toggle (RED/GREEN/ORANGE), enterprise policies,
        and multi-source configuration.

    .PARAMETER LaunchClaude
        Automatically launch Claude Code after saving changes

    .PARAMETER TestMode
        Run in test mode (don't launch Claude)

    .PARAMETER FastMode
        Skip runtime detection for faster startup (default: true)

    .PARAMETER Path
        Working directory for project-specific configuration

    .EXAMPLE
        Invoke-MCPSelector
        # Launch interactive selector

    .EXAMPLE
        mcp
        # Short alias

    .EXAMPLE
        Invoke-MCPSelector -Path C:\Projects\MyApp
        # Use specific project directory

    .NOTES
        Requires: PowerShell 7.0+
        Optional: PSFzf module for enhanced TUI
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

    # Change to specified path
    Push-Location $Path

    try {
        # Display header
        Write-Host ""
        Write-ColorOutput -Message "Claude Code MCP Server Selector v2.0.0 (PowerShell)" -ForegroundColor Cyan
        Write-Host ""

        # Load servers
        Write-MCPInfo "Discovering MCP servers..."
        $servers = Get-MCPServers -FastMode:$FastMode
        Write-MCPSuccess "Found $($servers.Count) servers"
        Write-Host ""

        # Check enterprise mode
        if ($script:EnterpriseMode -eq 'lockdown') {
            Write-MCPWarning "⚠️  ENTERPRISE LOCKDOWN MODE"
            Write-Host "Invalid enterprise configuration detected. Only enterprise servers available." -ForegroundColor Yellow
            Write-Host ""
        }
        elseif ($script:EnterpriseMode -eq 'active') {
            $enterpriseCount = ($servers | Where-Object { $_.Flags -match 'e' }).Count
            $restrictedCount = ($servers | Where-Object { $_.Flags -match '[br]' }).Count

            Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
            Write-ColorOutput -Message "🏢 Enterprise Policies Active" -ForegroundColor Cyan
            Write-Host "   • $enterpriseCount enterprise-managed servers (cannot be modified)" -ForegroundColor Gray
            if ($restrictedCount -gt 0) {
                Write-Host "   • $restrictedCount servers blocked/restricted by policy" -ForegroundColor Gray
            }
            Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
            Write-Host ""
        }

        # Launch TUI
        $modified = Show-MCPSelectorUI -Servers $servers

        if ($null -ne $modified) {
            # Save configuration
            Write-MCPInfo "Saving configuration..."
            Save-MCPConfiguration -Servers $modified
            Write-MCPSuccess "Configuration saved"
            Write-Host ""

            # Show summary
            $enabledCount = ($modified | Where-Object { $_.State -eq 'on' -and $_.Runtime -ne 'stopped' }).Count
            $orangeCount = ($modified | Where-Object { $_.State -eq 'on' -and $_.Runtime -eq 'stopped' }).Count

            Write-Host "Summary:" -ForegroundColor Cyan
            Write-Host "  • $enabledCount servers enabled (GREEN)" -ForegroundColor Green
            if ($orangeCount -gt 0) {
                Write-Host "  • $orangeCount servers available but disabled (ORANGE)" -ForegroundColor Yellow
            }
            Write-Host ""

            # Launch Claude
            if ($LaunchClaude -and -not $TestMode) {
                Write-MCPInfo "Launching Claude Code..."
                Start-Sleep -Milliseconds 500

                try {
                    $claudePath = Get-ClaudeBinary
                    & $claudePath @ClaudeArgs
                }
                catch {
                    Write-MCPError "Failed to launch Claude Code: ${_}"
                    exit 1
                }
            }
        }
        else {
            Write-MCPWarning "Cancelled - no changes made"
        }
    }
    finally {
        Pop-Location
    }
}

function Show-MCPSelectorUI {
    <#
    .SYNOPSIS
        Display interactive UI for server selection
    .DESCRIPTION
        Uses PSFzf (terminal) or Out-GridView (GUI) for selection.
        Automatically detects available UI and picks the best option.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [PSCustomObject[]]$Servers
    )

    # Detect available UI options
    $hasPSFzf = $null -ne (Get-Module -ListAvailable -Name PSFzf) -and
                $null -ne (Get-Command fzf -ErrorAction SilentlyContinue)
    $hasOutGridView = $null -ne (Get-Command Out-GridView -ErrorAction SilentlyContinue)

    # Determine which UI to use
    $useUI = if ($hasPSFzf) {
        'PSFzf'
    }
    elseif ($hasOutGridView) {
        'OutGridView'
    }
    else {
        $null
    }

    if ($null -eq $useUI) {
        Write-MCPError "No suitable UI available"
        Write-Host ""
        Write-Host "Available options:" -ForegroundColor Cyan
        Write-Host "  1. Install PSFzf for terminal UI:" -ForegroundColor Gray
        Write-Host "     Install-Module PSFzf" -ForegroundColor Gray
        Write-Host "     scoop install fzf" -ForegroundColor Gray
        Write-Host ""
        Write-Host "  2. Use Out-GridView (requires GUI environment)" -ForegroundColor Gray
        Write-Host ""
        Write-Host "  3. Use bash version via WSL/Git Bash" -ForegroundColor Gray
        Write-Host ""
        return $null
    }

    Write-MCPInfo "Using $useUI interface"

    # Format servers for display
    $displayServers = $Servers | ForEach-Object {
        $indicator = switch ($_.State) {
            'on' {
                if ($_.Runtime -eq 'stopped') {
                    '[ORANGE]'  # Available but disabled
                }
                else {
                    '[GREEN]'   # Enabled
                }
            }
            'off' { '[RED]' }    # Disabled
        }

        $flags = ''
        if ($_.Flags -match 'e') { $flags += '🏢 ' }
        if ($_.Flags -match 'b') { $flags += '🔒 ' }
        if ($_.Flags -match 'r') { $flags += '⚠️ ' }

        [PSCustomObject]@{
            Name       = $_.Name
            Status     = $indicator
            Flags      = $flags
            Scope      = $_.DefinitionScope
            Type       = $_.SourceType
            Command    = $_.Command
            File       = $_.DefinitionFile
            '_Original' = $_  # Hidden property for reference
        }
    }

    # Get selection from appropriate UI
    $selectedDisplay = if ($useUI -eq 'PSFzf') {
        Invoke-PSFzfSelector -Servers $displayServers
    }
    else {
        Invoke-OutGridViewSelector -Servers $displayServers
    }

    if ($null -eq $selectedDisplay) {
        return $null  # User cancelled
    }

    # Update states based on selection
    return Update-ServerStatesFromSelection -AllServers $Servers -SelectedServers $selectedDisplay
}

function Invoke-PSFzfSelector {
    <#
    .SYNOPSIS
        PSFzf-based terminal UI for server selection
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [PSCustomObject[]]$Servers
    )

    Import-Module PSFzf -ErrorAction Stop

    Write-Host "Launching PSFzf selector..." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Instructions:" -ForegroundColor Yellow
    Write-Host "  • TAB to select/deselect servers" -ForegroundColor Gray
    Write-Host "  • Type to filter by name" -ForegroundColor Gray
    Write-Host "  • ENTER to confirm selection" -ForegroundColor Gray
    Write-Host "  • ESC to cancel" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Status Legend:" -ForegroundColor Yellow
    Write-Host "  [GREEN]  = Will start when Claude launches" -ForegroundColor Green
    Write-Host "  [ORANGE] = Available but runtime-disabled" -ForegroundColor Yellow
    Write-Host "  [RED]    = Completely disabled" -ForegroundColor Red
    Write-Host ""

    # Build display strings with proper formatting
    $displayLines = $Servers | ForEach-Object {
        $flagsPart = if ($_.Flags) { "$($_.Flags) " } else { "" }
        $line = "$($_.Status) $flagsPart$($_.Name) ($($_.Scope), $($_.Type))"
        [PSCustomObject]@{
            Display = $line
            Server  = $_
            Name    = $_.Name  # Store name for easy lookup
        }
    }

    # Get currently enabled servers for pre-selection
    $currentlyEnabled = $Servers | Where-Object {
        $_.'_Original'.State -eq 'on' -and $_.'_Original'.Runtime -ne 'stopped'
    } | ForEach-Object { $_.Name }

    try {
        # Use Invoke-Fzf with multi-select
        $selected = $displayLines.Display | Invoke-Fzf `
            -Multi `
            -Prompt "Select servers to ENABLE (TAB to select, ENTER to confirm): " `
            -Height 40% `
            -Layout reverse `
            -Border `
            -Ansi

        # Check if user cancelled (ESC key)
        if ($null -eq $selected) {
            # User pressed ESC - treat as cancellation
            return $null
        }

        # User pressed ENTER - even with empty selection is valid (disable all)
        # Convert to array to handle single item properly
        $selectedArray = @($selected)

        # Match selected display lines back to server objects
        $selectedServers = foreach ($selectedLine in $selectedArray) {
            # Find the displayLine object that matches this display string
            $displayLine = $displayLines | Where-Object { $_.Display -eq $selectedLine } | Select-Object -First 1
            if ($displayLine) {
                # Return the server object
                $displayLine.Server
            }
        }

        # Return selected servers (or empty array if none selected)
        return @($selectedServers)
    }
    catch {
        Write-MCPError "PSFzf selection failed: ${_}"
        return $null
    }
}

function Invoke-OutGridViewSelector {
    <#
    .SYNOPSIS
        Out-GridView-based GUI for server selection
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [PSCustomObject[]]$Servers
    )

    Write-Host "Launching Out-GridView..." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Instructions:" -ForegroundColor Yellow
    Write-Host "  1. Select servers you want ENABLED (hold Ctrl for multiple)" -ForegroundColor Gray
    Write-Host "  2. Click OK to save changes" -ForegroundColor Gray
    Write-Host "  3. Click Cancel to abort without saving" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Status Legend:" -ForegroundColor Yellow
    Write-Host "  [GREEN]  = Will start when Claude launches" -ForegroundColor Green
    Write-Host "  [ORANGE] = Available but runtime-disabled" -ForegroundColor Yellow
    Write-Host "  [RED]    = Completely disabled" -ForegroundColor Red
    Write-Host ""

    # Show grid
    try {
        $selected = $Servers | Out-GridView `
            -Title "MCP Server Selector - Select servers to ENABLE (Ctrl+Click for multiple)" `
            -OutputMode Multiple `
            -ErrorAction Stop
    }
    catch {
        Write-MCPError "Out-GridView failed: ${_}"
        Write-Host ""

        # Check specific error conditions
        if ($_.Exception.Message -match 'remote session') {
            Write-Host "Out-GridView cannot run in a remote PowerShell session." -ForegroundColor Yellow
            Write-Host ""
            Write-Host "You are likely running PowerShell through:" -ForegroundColor Cyan
            Write-Host "  • SSH session" -ForegroundColor Gray
            Write-Host "  • Windows Terminal Server / RDP without local session" -ForegroundColor Gray
            Write-Host "  • PowerShell job or background task" -ForegroundColor Gray
            Write-Host "  • SYSTEM user context (scheduled task, service)" -ForegroundColor Gray
            Write-Host ""
            Write-Host "Solutions:" -ForegroundColor Cyan
            Write-Host "  1. Run from a direct PowerShell window on the local machine" -ForegroundColor Gray
            Write-Host "  2. Install PSFzf: Install-Module PSFzf (terminal-based, works anywhere)" -ForegroundColor Gray
            Write-Host "  3. Use the bash version with fzf" -ForegroundColor Gray
            Write-Host ""
        }
        else {
            Write-Host "This may happen if:" -ForegroundColor Yellow
            Write-Host "  • Running on Windows Server Core (no GUI)" -ForegroundColor Gray
            Write-Host "  • Display not available" -ForegroundColor Gray
            Write-Host "  • Running in headless environment" -ForegroundColor Gray
            Write-Host ""
        }

        return $null
    }

    if ($null -eq $selected) {
        return $null  # User cancelled
    }

    # Return selected servers
    return $selected
}

function Update-ServerStatesFromSelection {
    <#
    .SYNOPSIS
        Updates server states based on user selection
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [PSCustomObject[]]$AllServers,

        [Parameter(Mandatory)]
        [AllowEmptyCollection()]
        [PSCustomObject[]]$SelectedServers
    )

    # Extract names from selected display servers
    # Display servers have '_Original' property pointing to the actual server
    $selectedNames = @($SelectedServers | ForEach-Object {
        if ($_.PSObject.Properties['_Original']) {
            $_._Original.Name
        }
        else {
            $_.Name
        }
    })

    # Update state of each server based on selection
    foreach ($server in $AllServers) {
        if ($server.Flags -match 'e') {
            # Skip enterprise servers (cannot modify)
            continue
        }

        if ($selectedNames -contains $server.Name) {
            # Selected = enable (GREEN)
            $server.State = 'on'
            $server.Runtime = $null  # Clear runtime-disabled flag
        }
        else {
            # Not selected = disable (RED)
            $server.State = 'off'
            $server.Runtime = $null
        }
    }

    return $AllServers
}

# Define aliases
Set-Alias -Name mcp -Value Invoke-MCPSelector -Scope Global
Set-Alias -Name claudemcp -Value Invoke-MCPSelector -Scope Global
