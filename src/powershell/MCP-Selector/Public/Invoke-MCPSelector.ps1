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
                    Write-MCPError "Failed to launch Claude Code: $_"
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
        Uses Out-GridView for selection (native, zero dependencies)
        Future: PSFzf integration for enhanced experience
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [PSCustomObject[]]$Servers
    )

    # TODO: Implement PSFzf integration (requires PSFzf module + fzf.exe)
    # For now, using Out-GridView (native Windows, zero dependencies)

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

    # Check if Out-GridView is available
    $hasOutGridView = Get-Command Out-GridView -ErrorAction SilentlyContinue

    if (-not $hasOutGridView) {
        Write-MCPError "Out-GridView not available"
        Write-Host ""
        Write-Host "Out-GridView requires:" -ForegroundColor Yellow
        Write-Host "  • Windows Desktop Experience (not Server Core)" -ForegroundColor Gray
        Write-Host "  • GUI environment (not SSH/headless)" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Alternatives:" -ForegroundColor Cyan
        Write-Host "  1. Install PSFzf for terminal UI:" -ForegroundColor Gray
        Write-Host "     Install-Module PSFzf" -ForegroundColor Gray
        Write-Host "     scoop install fzf" -ForegroundColor Gray
        Write-Host ""
        Write-Host "  2. Use bash version via WSL/Git Bash" -ForegroundColor Gray
        Write-Host ""
        return $null
    }

    Write-Host "Launching interactive selector..." -ForegroundColor Cyan
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
        $selected = $displayServers | Out-GridView `
            -Title "MCP Server Selector - Select servers to ENABLE (Ctrl+Click for multiple)" `
            -OutputMode Multiple `
            -ErrorAction Stop
    }
    catch {
        Write-MCPError "Out-GridView failed: $_"
        Write-Host ""
        Write-Host "This may happen if:" -ForegroundColor Yellow
        Write-Host "  • Running over SSH without X11 forwarding" -ForegroundColor Gray
        Write-Host "  • Running on Windows Server Core" -ForegroundColor Gray
        Write-Host "  • Display not available" -ForegroundColor Gray
        Write-Host ""
        return $null
    }

    if ($null -eq $selected) {
        return $null  # User cancelled
    }

    # Update server states based on selection
    $selectedNames = @($selected.Name)

    foreach ($server in $Servers) {
        if ($server.Flags -match 'e') {
            # Skip enterprise servers (cannot modify)
            continue
        }

        if ($selectedNames -contains $server.Name) {
            # Selected = enable (GREEN)
            Set-MCPServerState -Server $server -NewState 'GREEN'
        }
        else {
            # Not selected = disable (RED)
            Set-MCPServerState -Server $server -NewState 'RED'
        }
    }

    return $Servers
}

# Define aliases
Set-Alias -Name mcp -Value Invoke-MCPSelector -Scope Global
Set-Alias -Name claudemcp -Value Invoke-MCPSelector -Scope Global
