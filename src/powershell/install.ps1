<#
.SYNOPSIS
    Install MCP-Selector PowerShell module

.DESCRIPTION
    Installs the MCP-Selector module with comprehensive error handling,
    permission detection, and automatic dependency management.

    Supports both standard users and administrators with appropriate
    installation scopes and smart defaults.

.PARAMETER Scope
    Installation scope (CurrentUser or AllUsers)
    - CurrentUser: No admin required, installs to user profile
    - AllUsers: Requires admin, installs system-wide
    - Auto: Automatically detects (default)

.PARAMETER InstallEnhancedUI
    Automatically install enhanced UI dependencies (PSFzf + fzf)
    Without this, uses native Out-GridView (zero dependencies)

.PARAMETER SkipDependencyCheck
    Skip dependency installation prompts (use defaults)

.PARAMETER Force
    Force reinstallation even if already installed

.EXAMPLE
    .\install.ps1
    # Auto-detect user type and install with prompts

.EXAMPLE
    .\install.ps1 -InstallEnhancedUI
    # Install with enhanced UI dependencies

.EXAMPLE
    .\install.ps1 -Scope CurrentUser -SkipDependencyCheck
    # Quick install without prompts

.NOTES
    Requires PowerShell 7.0+
    Works for both standard users and administrators
#>

[CmdletBinding()]
param(
    [ValidateSet('CurrentUser', 'AllUsers', 'Auto')]
    [string]$Scope = 'Auto',

    [switch]$InstallEnhancedUI,

    [switch]$SkipDependencyCheck,

    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# ============================================================================
# CONSTANTS
# ============================================================================

$ModuleName = 'MCP-Selector'
$MinPSVersion = [Version]'7.0'
$RequiredFiles = @(
    'MCP-Selector.psd1',
    'MCP-Selector.psm1',
    'Private/Config.ps1',
    'Private/Dependencies.ps1',
    'Private/Enterprise.ps1',
    'Private/Server.ps1',
    'Private/Util.ps1',
    'Public/Invoke-MCPSelector.ps1'
)

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

function Test-IsAdministrator {
    if ($IsWindows -or $PSVersionTable.PSVersion.Major -lt 6) {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = [Security.Principal.WindowsPrincipal]$identity
        return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    }
    else {
        return (whoami) -eq 'root'
    }
}

function Test-WritePermission {
    param([string]$Path)

    try {
        $testPath = Join-Path $Path ".permission-test-$(Get-Random)"

        if (-not (Test-Path $Path)) {
            New-Item -ItemType Directory -Path $Path -Force -ErrorAction Stop | Out-Null
        }

        New-Item -ItemType File -Path $testPath -Force -ErrorAction Stop | Out-Null
        Remove-Item $testPath -Force -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

# ============================================================================
# PRE-FLIGHT CHECKS
# ============================================================================

function Test-Prerequisites {
    Write-Header "MCP Server Selector - PowerShell Installation"
    Write-Host ""

    $isAdmin = Test-IsAdministrator
    $userName = if ($IsWindows) { $env:USERNAME } else { $env:USER }

    Write-Info "User: $userName"
    Write-Info "Admin: $(if ($isAdmin) { 'Yes' } else { 'No' })"
    Write-Info "Platform: $($PSVersionTable.OS)"
    Write-Host ""

    # Check PowerShell version
    Write-Info "Checking PowerShell version..."
    if ($PSVersionTable.PSVersion -lt $MinPSVersion) {
        Write-Failure "PowerShell $MinPSVersion or higher required"
        Write-Host ""
        Write-Host "Current version: $($PSVersionTable.PSVersion)" -ForegroundColor Red
        Write-Host "Download PowerShell 7+: https://aka.ms/powershell" -ForegroundColor Cyan
        Write-Host ""
        throw "Insufficient PowerShell version"
    }
    Write-Success "PowerShell $($PSVersionTable.PSVersion)"
    Write-Host ""

    # Check execution policy
    Write-Info "Checking execution policy..."
    $policy = Get-ExecutionPolicy -Scope CurrentUser

    if ($policy -in @('Restricted', 'AllSigned')) {
        Write-Warning "Execution policy is '$policy' - may block script execution"
        Write-Host ""
        Write-Host "To fix, run:" -ForegroundColor Yellow
        Write-Host "  Set-ExecutionPolicy RemoteSigned -Scope CurrentUser" -ForegroundColor Cyan
        Write-Host ""

        $response = Read-Host "Fix execution policy now? (Y/n)"

        if ($response -notmatch '^[Nn]') {
            try {
                Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
                Write-Success "Execution policy updated"
            }
            catch {
                Write-Failure "Failed to update execution policy: $_"
                Write-Host "Please run the command manually and retry installation" -ForegroundColor Yellow
                throw "Execution policy blocked"
            }
        }
        else {
            Write-Warning "Installation may fail with current execution policy"
        }
        Write-Host ""
    }
    else {
        Write-Success "Execution policy: $policy"
        Write-Host ""
    }

    return $isAdmin
}

# ============================================================================
# INSTALLATION PATH DETECTION
# ============================================================================

function Get-InstallationPath {
    param(
        [string]$RequestedScope,
        [bool]$IsAdmin
    )

    # Determine effective scope
    $effectiveScope = switch ($RequestedScope) {
        'Auto' {
            if ($IsAdmin) {
                Write-Info "Administrator detected - defaulting to AllUsers scope"
                'AllUsers'
            }
            else {
                Write-Info "Standard user - using CurrentUser scope"
                'CurrentUser'
            }
        }
        'AllUsers' {
            if (-not $IsAdmin) {
                Write-Warning "AllUsers scope requires administrator privileges"
                Write-Warning "Falling back to CurrentUser scope"
                'CurrentUser'
            }
            else {
                'AllUsers'
            }
        }
        'CurrentUser' {
            'CurrentUser'
        }
    }

    # Get installation base path
    $basePath = if ($effectiveScope -eq 'CurrentUser') {
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

    $installPath = Join-Path $basePath $ModuleName

    Write-Info "Installation scope: $effectiveScope"
    Write-Info "Target directory: $installPath"
    Write-Host ""

    # Verify write permission
    if (-not (Test-WritePermission $basePath)) {
        Write-Failure "No write permission to $basePath"

        if ($effectiveScope -eq 'AllUsers') {
            Write-Host "Please run PowerShell as Administrator" -ForegroundColor Yellow
        }
        else {
            Write-Host "Permission denied to user module directory" -ForegroundColor Red
        }

        throw "Insufficient permissions"
    }

    return @{
        Scope = $effectiveScope
        BasePath = $basePath
        ModulePath = $installPath
    }
}

# ============================================================================
# MODULE INSTALLATION
# ============================================================================

function Install-Module-Files {
    param($Paths)

    $sourcePath = Join-Path $PSScriptRoot $ModuleName

    # Verify source exists
    if (-not (Test-Path $sourcePath)) {
        Write-Failure "Module source not found at $sourcePath"
        Write-Host ""
        Write-Host "Please run this script from: src/powershell/" -ForegroundColor Yellow
        throw "Source directory not found"
    }

    # Verify required files exist
    Write-Info "Verifying module files..."
    foreach ($file in $RequiredFiles) {
        $filePath = Join-Path $sourcePath $file
        if (-not (Test-Path $filePath)) {
            Write-Failure "Required file missing: $file"
            throw "Incomplete module source"
        }
    }
    Write-Success "All required files present"
    Write-Host ""

    # Check if already installed
    if (Test-Path $Paths.ModulePath) {
        if ($Force) {
            Write-Warning "Removing existing installation (forced)"
            Remove-Item $Paths.ModulePath -Recurse -Force -ErrorAction Stop
        }
        else {
            Write-Warning "Module already installed at $($Paths.ModulePath)"
            $response = Read-Host "Reinstall? (Y/n)"

            if ($response -match '^[Nn]') {
                Write-Info "Installation cancelled"
                return $false
            }

            Write-Info "Removing existing installation..."
            Remove-Item $Paths.ModulePath -Recurse -Force -ErrorAction Stop
        }
        Write-Host ""
    }

    # Create base directory if needed
    if (-not (Test-Path $Paths.BasePath)) {
        Write-Info "Creating module directory..."
        New-Item -ItemType Directory -Path $Paths.BasePath -Force | Out-Null
    }

    # Copy module files
    Write-Info "Installing module files..."
    try {
        Copy-Item -Path $sourcePath -Destination $Paths.ModulePath -Recurse -Force -ErrorAction Stop
        Write-Success "Module files installed"
        Write-Host ""
    }
    catch {
        Write-Failure "Failed to copy module files: $_"
        throw
    }

    return $true
}

function Test-ModuleInstallation {
    param($ModulePath)

    Write-Info "Verifying installation..."

    try {
        # Remove any loaded instances
        Remove-Module $ModuleName -Force -ErrorAction SilentlyContinue

        # Import module
        Import-Module $ModuleName -Force -ErrorAction Stop
        $module = Get-Module $ModuleName

        if (-not $module) {
            throw "Module failed to load"
        }

        Write-Success "Module verified successfully"
        Write-Host ""
        Write-Host "Module Information:" -ForegroundColor Cyan
        Write-Host "  Name:     $($module.Name)" -ForegroundColor Gray
        Write-Host "  Version:  $($module.Version)" -ForegroundColor Gray
        Write-Host "  Path:     $($module.Path)" -ForegroundColor Gray
        Write-Host "  Commands: $(($module.ExportedCommands.Keys -join ', '))" -ForegroundColor Gray
        Write-Host ""

        return $true
    }
    catch {
        Write-Failure "Module verification failed: $_"
        return $false
    }
}

# ============================================================================
# DEPENDENCY MANAGEMENT
# ============================================================================

function Install-Dependencies {
    param(
        [bool]$InstallEnhancedUI,
        [bool]$SkipPrompts,
        [string]$Scope
    )

    if ($SkipPrompts -and -not $InstallEnhancedUI) {
        Write-Info "Skipping optional dependency installation"
        Write-Host "  Using: Out-GridView (native Windows GUI)" -ForegroundColor Gray
        Write-Host ""
        return
    }

    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Header "Optional Dependencies"
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host ""
    Write-Host "The module works with two UI modes:" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  1. Basic UI (default):  Out-GridView - Native Windows GUI" -ForegroundColor Gray
    Write-Host "     Dependencies: None (built-in)" -ForegroundColor Green
    Write-Host ""
    Write-Host "  2. Enhanced UI:         PSFzf - Terminal-based fuzzy finder" -ForegroundColor Gray
    Write-Host "     Dependencies: PSFzf module + fzf.exe" -ForegroundColor Yellow
    Write-Host "     Experience:   Same as bash version" -ForegroundColor Gray
    Write-Host ""

    if ($InstallEnhancedUI) {
        $install = $true
    }
    elseif ($SkipPrompts) {
        $install = $false
    }
    else {
        $response = Read-Host "Install enhanced UI? (y/N)"
        $install = $response -match '^[Yy]'
    }

    if ($install) {
        Write-Host ""

        # Source utility functions first (Dependencies.ps1 needs them)
        $utilFile = Join-Path $PSScriptRoot $ModuleName 'Private' 'Util.ps1'
        $depsFile = Join-Path $PSScriptRoot $ModuleName 'Private' 'Dependencies.ps1'

        if ((Test-Path $utilFile) -and (Test-Path $depsFile)) {
            # Load utilities first
            . $utilFile

            # Then load dependency functions
            . $depsFile

            try {
                Install-EnhancedUI -SkipPrompt:$SkipPrompts -Scope $Scope
            }
            catch {
                Write-Warning "Enhanced UI installation failed: $_"
                Write-Host "The module will use Out-GridView instead" -ForegroundColor Gray
            }
        }
        else {
            Write-Warning "Dependency installer not found - enhanced UI not available"
        }
    }
    else {
        Write-Success "Using default Out-GridView UI (no additional dependencies)"
    }

    Write-Host ""
}

# ============================================================================
# MAIN INSTALLATION
# ============================================================================

try {
    # Pre-flight checks
    $isAdmin = Test-Prerequisites

    # Determine installation path
    $paths = Get-InstallationPath -RequestedScope $Scope -IsAdmin $isAdmin

    # Install module files
    $installed = Install-Module-Files -Paths $paths

    if (-not $installed) {
        exit 0
    }

    # Verify installation
    $verified = Test-ModuleInstallation -ModulePath $paths.ModulePath

    if (-not $verified) {
        Write-Failure "Installation verification failed"
        exit 1
    }

    # Install dependencies
    Install-Dependencies `
        -InstallEnhancedUI:$InstallEnhancedUI `
        -SkipPrompts:$SkipDependencyCheck `
        -Scope $paths.Scope

    # Success summary
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Success "Installation Complete!"
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host ""

    Write-Host "Quick Start:" -ForegroundColor Cyan
    Write-Host "  mcp                            Launch selector" -ForegroundColor Green
    Write-Host "  claudemcp                      Alternative alias" -ForegroundColor Green
    Write-Host "  Get-Help Invoke-MCPSelector    View documentation" -ForegroundColor Green
    Write-Host ""

    Write-Host "Installed to:" -ForegroundColor Cyan
    Write-Host "  $($paths.ModulePath)" -ForegroundColor Gray
    Write-Host ""

    Write-Host "Ready to use! Run 'mcp' to get started." -ForegroundColor Green
    Write-Host ""
}
catch {
    Write-Host ""
    Write-Failure "Installation failed: $_"
    Write-Host ""
    Write-Host "For help, see: https://github.com/henkisdabro/Claude-Code-MCP-Server-Selector" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}
