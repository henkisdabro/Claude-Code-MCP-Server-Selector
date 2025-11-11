<#
.SYNOPSIS
    Install MCP-Selector PowerShell module

.DESCRIPTION
    Installs the MCP-Selector module to your PowerShell modules directory.
    Optionally installs PSFzf for enhanced TUI experience.

.PARAMETER InstallPSFzf
    Also install PSFzf module for enhanced interactive experience

.PARAMETER Scope
    Installation scope (CurrentUser or AllUsers)

.EXAMPLE
    .\install.ps1
    # Basic installation with Out-GridView UI

.EXAMPLE
    .\install.ps1 -InstallPSFzf
    # Install with PSFzf for enhanced TUI

.NOTES
    Requires PowerShell 7.0+
#>

[CmdletBinding()]
param(
    [switch]$InstallPSFzf,

    [ValidateSet('CurrentUser', 'AllUsers')]
    [string]$Scope = 'CurrentUser'
)

# ============================================================================
# CONSTANTS
# ============================================================================

$ErrorActionPreference = 'Stop'
$ModuleName = 'MCP-Selector'
$MinPSVersion = [Version]'7.0'

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

function Write-ColorMessage {
    param(
        [string]$Message,
        [string]$Color = 'White',
        [string]$Prefix = ''
    )

    $colorMap = @{
        'Cyan'   = "$($PSStyle.Foreground.Cyan)"
        'Green'  = "$($PSStyle.Foreground.Green)"
        'Yellow' = "$($PSStyle.Foreground.Yellow)"
        'Red'    = "$($PSStyle.Foreground.Red)"
        'White'  = "$($PSStyle.Reset)"
    }

    $c = $colorMap[$Color] ?? $PSStyle.Reset
    Write-Host "$Prefix$c$Message$($PSStyle.Reset)"
}

function Write-Info    { param($msg) Write-ColorMessage -Message "→ $msg" -Color Cyan }
function Write-Success { param($msg) Write-ColorMessage -Message "✓ $msg" -Color Green }
function Write-Warning { param($msg) Write-ColorMessage -Message "⚠ $msg" -Color Yellow }
function Write-Failure { param($msg) Write-ColorMessage -Message "✗ $msg" -Color Red }
function Write-Header  { param($msg) Write-ColorMessage -Message $msg -Color Cyan }

# ============================================================================
# MAIN INSTALLATION
# ============================================================================

Write-Host ""
Write-Header "Claude Code MCP Server Selector - PowerShell Installation"
Write-Host ""

# Check PowerShell version
Write-Info "Checking PowerShell version..."
if ($PSVersionTable.PSVersion -lt $MinPSVersion) {
    Write-Failure "PowerShell $MinPSVersion or higher required"
    Write-Host ""
    Write-Host "Current version: $($PSVersionTable.PSVersion)" -ForegroundColor Red
    Write-Host "Download PowerShell 7+ from: https://aka.ms/powershell" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}
Write-Success "PowerShell $($PSVersionTable.PSVersion) detected"
Write-Host ""

# Determine installation path
$installBasePath = if ($Scope -eq 'CurrentUser') {
    if ($IsWindows) {
        Join-Path $env:USERPROFILE 'Documents' 'PowerShell' 'Modules'
    }
    else {
        Join-Path $HOME '.local' 'share' 'powershell' 'Modules'
    }
}
else {
    if ($IsWindows) {
        Join-Path $env:ProgramFiles 'PowerShell' 'Modules'
    }
    else {
        '/usr/local/share/powershell/Modules'
    }
}

$installPath = Join-Path $installBasePath $ModuleName

Write-Info "Installation scope: $Scope"
Write-Info "Target directory: $installPath"
Write-Host ""

# Check if module already installed
if (Test-Path $installPath) {
    Write-Warning "Existing installation found at $installPath"
    $response = Read-Host "Remove and reinstall? (Y/n)"

    if ($response -match '^[Nn]') {
        Write-Info "Installation cancelled"
        exit 0
    }

    Write-Info "Removing existing installation..."
    Remove-Item $installPath -Recurse -Force
    Write-Success "Removed existing installation"
    Write-Host ""
}

# Create module directory
Write-Info "Creating module directory..."
if (-not (Test-Path $installBasePath)) {
    New-Item -ItemType Directory -Path $installBasePath -Force | Out-Null
}

# Copy module files
Write-Info "Copying module files..."
$sourcePath = Join-Path $PSScriptRoot $ModuleName

if (-not (Test-Path $sourcePath)) {
    Write-Failure "Module source not found at $sourcePath"
    Write-Host "Run this script from the src/powershell directory" -ForegroundColor Red
    exit 1
}

Copy-Item -Path $sourcePath -Destination $installPath -Recurse -Force
Write-Success "Module files copied"
Write-Host ""

# Verify installation
Write-Info "Verifying installation..."
try {
    Import-Module $ModuleName -Force -ErrorAction Stop
    $module = Get-Module $ModuleName

    Write-Success "Module installed successfully!"
    Write-Host ""
    Write-Host "Module Info:" -ForegroundColor Cyan
    Write-Host "  Name:    $($module.Name)" -ForegroundColor Gray
    Write-Host "  Version: $($module.Version)" -ForegroundColor Gray
    Write-Host "  Path:    $($module.Path)" -ForegroundColor Gray
    Write-Host ""
}
catch {
    Write-Failure "Module verification failed: $_"
    exit 1
}

# Check for PSFzf (optional)
Write-Info "Checking for optional dependencies..."
$hasPSFzf = Get-Module PSFzf -ListAvailable

if (-not $hasPSFzf) {
    Write-Warning "PSFzf module not found (optional, provides enhanced TUI)"
    Write-Host ""

    if ($InstallPSFzf) {
        Write-Info "Installing PSFzf module..."

        try {
            Install-Module PSFzf -Scope $Scope -Force -AllowClobber
            Write-Success "PSFzf installed"
            Write-Host ""
            Write-Info "PSFzf requires fzf.exe - install with:"
            Write-Host "  scoop install fzf" -ForegroundColor Cyan
            Write-Host "  OR"
            Write-Host "  choco install fzf" -ForegroundColor Cyan
            Write-Host ""
        }
        catch {
            Write-Warning "Failed to install PSFzf: $_"
            Write-Host "You can install manually later: Install-Module PSFzf" -ForegroundColor Gray
            Write-Host ""
        }
    }
    else {
        Write-Host ""
        Write-Host "To enable enhanced TUI (optional):" -ForegroundColor Cyan
        Write-Host "  1. Install-Module PSFzf" -ForegroundColor Gray
        Write-Host "  2. Install fzf.exe: scoop install fzf" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Current UI: Out-GridView (native Windows, zero dependencies)" -ForegroundColor Gray
        Write-Host ""
    }
}
else {
    Write-Success "PSFzf module found"

    # Check for fzf.exe
    if (Get-Command fzf -ErrorAction SilentlyContinue) {
        Write-Success "fzf.exe found - enhanced TUI available"
    }
    else {
        Write-Warning "PSFzf installed but fzf.exe not found"
        Write-Host "  Install fzf: scoop install fzf" -ForegroundColor Cyan
    }
    Write-Host ""
}

# Installation complete
Write-Success "Installation complete!"
Write-Host ""

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Header "Usage"
Write-Host ""
Write-Host "Launch the selector with either command:" -ForegroundColor Cyan
Write-Host "  mcp" -ForegroundColor Green
Write-Host "  claudemcp" -ForegroundColor Green
Write-Host "  Invoke-MCPSelector" -ForegroundColor Green
Write-Host ""
Write-Host "Get help:" -ForegroundColor Cyan
Write-Host "  Get-Help Invoke-MCPSelector -Full" -ForegroundColor Gray
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""

Write-Host "Ready to use! Run 'mcp' to get started." -ForegroundColor Green
Write-Host ""
