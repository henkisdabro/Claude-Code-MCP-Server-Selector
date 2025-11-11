# Dependencies.ps1 - Dependency detection and management for MCP-Selector

function Test-IsAdministrator {
    <#
    .SYNOPSIS
        Check if running as Administrator
    #>
    if ($IsWindows -or $PSVersionTable.PSVersion.Major -lt 6) {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = [Security.Principal.WindowsPrincipal]$identity
        return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    }
    else {
        # On Linux/macOS, check if root
        return (id -u) -eq 0
    }
}

function Get-ExecutionPolicyStatus {
    <#
    .SYNOPSIS
        Check execution policy and provide remediation steps
    #>
    try {
        $currentPolicy = Get-ExecutionPolicy -Scope CurrentUser

        if ($currentPolicy -in @('Restricted', 'AllSigned')) {
            return @{
                Blocked = $true
                Policy  = $currentPolicy
                Scope   = 'CurrentUser'
                CanFix  = $true
            }
        }

        return @{
            Blocked = $false
            Policy  = $currentPolicy
        }
    }
    catch {
        return @{
            Blocked = $true
            Policy  = 'Unknown'
            CanFix  = $false
            Error   = $_.Exception.Message
        }
    }
}

function Set-ExecutionPolicyIfNeeded {
    <#
    .SYNOPSIS
        Fix execution policy if blocked (user consent required)
    #>
    param([switch]$Force)

    $status = Get-ExecutionPolicyStatus

    if (-not $status.Blocked) {
        return $true
    }

    Write-MCPWarning "PowerShell execution policy is '$($status.Policy)' - scripts are blocked"
    Write-Host ""

    if (-not $Force) {
        Write-Host "To run this module, we need to change the execution policy to RemoteSigned." -ForegroundColor Yellow
        Write-Host "This allows local scripts to run while requiring downloaded scripts to be signed." -ForegroundColor Gray
        Write-Host ""
        Write-Host "Alternative: You can manually set it with:" -ForegroundColor Cyan
        Write-Host "  Set-ExecutionPolicy RemoteSigned -Scope CurrentUser" -ForegroundColor Gray
        Write-Host ""

        $response = Read-Host "Change execution policy now? (Y/n)"

        if ($response -match '^[Nn]') {
            return $false
        }
    }

    try {
        Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force -ErrorAction Stop
        Write-MCPSuccess "Execution policy updated to RemoteSigned"
        return $true
    }
    catch {
        Write-MCPError "Failed to update execution policy: ${_}"
        Write-Host ""
        Write-Host "Please run manually as Administrator:" -ForegroundColor Yellow
        Write-Host "  Set-ExecutionPolicy RemoteSigned -Scope CurrentUser" -ForegroundColor Cyan
        return $false
    }
}

function Get-PackageManager {
    <#
    .SYNOPSIS
        Detect available package managers and their capabilities
    #>
    $managers = @()

    # Check Winget (Windows Package Manager - built into Windows 11+)
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        $managers += @{
            Name      = 'winget'
            Available = $true
            RequiresAdmin = $false
            Priority  = 1
        }
    }

    # Check Scoop (user-level, no admin needed)
    if (Get-Command scoop -ErrorAction SilentlyContinue) {
        $managers += @{
            Name      = 'scoop'
            Available = $true
            RequiresAdmin = $false
            Priority  = 2
        }
    }

    # Check Chocolatey (may require admin)
    if (Get-Command choco -ErrorAction SilentlyContinue) {
        $managers += @{
            Name      = 'choco'
            Available = $true
            RequiresAdmin = $true  # Usually requires admin
            Priority  = 3
        }
    }

    # Check Homebrew (macOS/Linux)
    if (Get-Command brew -ErrorAction SilentlyContinue) {
        $managers += @{
            Name      = 'brew'
            Available = $true
            RequiresAdmin = $false
            Priority  = 1
        }
    }

    return $managers | Sort-Object Priority
}

function Install-Scoop {
    <#
    .SYNOPSIS
        Install Scoop package manager (user-level, no admin required)
    #>
    [CmdletBinding()]
    param([switch]$Force)

    if ((Get-Command scoop -ErrorAction SilentlyContinue) -and -not $Force) {
        Write-MCPSuccess "Scoop already installed"
        return $true
    }

    Write-MCPInfo "Installing Scoop package manager (no admin required)..."
    Write-Host ""

    try {
        # Set execution policy for installation
        $oldPolicy = Get-ExecutionPolicy -Scope CurrentUser
        Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force -ErrorAction SilentlyContinue

        # Install Scoop
        Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression

        # Restore policy if it was different
        if ($oldPolicy -ne 'RemoteSigned') {
            Set-ExecutionPolicy $oldPolicy -Scope CurrentUser -Force -ErrorAction SilentlyContinue
        }

        # Verify installation
        if (Get-Command scoop -ErrorAction SilentlyContinue) {
            Write-MCPSuccess "Scoop installed successfully"
            return $true
        }
        else {
            Write-MCPError "Scoop installation completed but scoop command not found"
            return $false
        }
    }
    catch {
        Write-MCPError "Failed to install Scoop: ${_}"
        Write-Host ""
        Write-Host "Manual installation:" -ForegroundColor Yellow
        Write-Host "  Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression" -ForegroundColor Cyan
        return $false
    }
}

function Install-FzfDependency {
    <#
    .SYNOPSIS
        Install fzf.exe using available package manager
    #>
    [CmdletBinding()]
    param(
        [switch]$SkipPrompt,
        [string]$PreferredManager
    )

    # Check if already installed
    if (Get-Command fzf -ErrorAction SilentlyContinue) {
        Write-MCPSuccess "fzf already installed"
        return $true
    }

    Write-MCPInfo "Checking for package managers to install fzf..."
    Write-Host ""

    $managers = Get-PackageManager
    $isAdmin = Test-IsAdministrator

    if ($managers.Count -eq 0) {
        Write-MCPWarning "No package manager found"
        Write-Host ""
        Write-Host "Recommended: Install Scoop (no admin required)" -ForegroundColor Yellow
        Write-Host ""

        if (-not $SkipPrompt) {
            $response = Read-Host "Install Scoop now? (Y/n)"

            if ($response -notmatch '^[Nn]') {
                if (Install-Scoop) {
                    $managers = Get-PackageManager
                }
                else {
                    return $false
                }
            }
            else {
                Write-Host ""
                Write-Host "Manual installation options:" -ForegroundColor Cyan
                Write-Host "  1. Download from: https://github.com/junegunn/fzf/releases" -ForegroundColor Gray
                Write-Host "  2. Install Scoop: https://scoop.sh" -ForegroundColor Gray
                Write-Host "  3. Install Chocolatey: https://chocolatey.org" -ForegroundColor Gray
                return $false
            }
        }
        else {
            return $false
        }
    }

    # Filter by admin requirements
    $availableManagers = $managers | Where-Object {
        -not $_.RequiresAdmin -or $isAdmin
    }

    if ($availableManagers.Count -eq 0) {
        Write-MCPWarning "Available package managers require administrator privileges"
        Write-Host "Please run PowerShell as Administrator or install Scoop (user-level)" -ForegroundColor Yellow
        return $false
    }

    # Choose manager
    $manager = if ($PreferredManager) {
        $availableManagers | Where-Object { $_.Name -eq $PreferredManager } | Select-Object -First 1
    }
    else {
        $availableManagers | Select-Object -First 1
    }

    if (-not $manager) {
        Write-MCPError "No suitable package manager found"
        return $false
    }

    Write-MCPInfo "Installing fzf using $($manager.Name)..."

    try {
        switch ($manager.Name) {
            'winget' {
                # Use Start-Process to avoid winget's StandardOutputEncoding issue
                $process = Start-Process -FilePath "winget" `
                    -ArgumentList "install", "fzf", "--accept-source-agreements", "--accept-package-agreements" `
                    -NoNewWindow -Wait -PassThru
                if ($process.ExitCode -ne 0) {
                    throw "winget install failed with exit code $($process.ExitCode)"
                }
            }
            'scoop' {
                scoop install fzf
            }
            'choco' {
                if ($isAdmin) {
                    choco install fzf -y
                }
                else {
                    throw "Chocolatey requires administrator privileges"
                }
            }
            'brew' {
                brew install fzf
            }
        }

        # Verify installation
        # Refresh PATH in current session
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                    [System.Environment]::GetEnvironmentVariable("Path", "User")

        if (Get-Command fzf -ErrorAction SilentlyContinue) {
            Write-MCPSuccess "fzf installed successfully"
            return $true
        }
        else {
            Write-MCPWarning "fzf installation completed but fzf command not found"
            Write-Host "You may need to restart PowerShell for PATH changes to take effect" -ForegroundColor Yellow
            return $false
        }
    }
    catch {
        Write-MCPError "Failed to install fzf: ${_}"
        return $false
    }
}

function Install-PSFzfModule {
    <#
    .SYNOPSIS
        Install PSFzf PowerShell module
    #>
    [CmdletBinding()]
    param(
        [ValidateSet('CurrentUser', 'AllUsers')]
        [string]$Scope = 'CurrentUser',
        [switch]$SkipPrompt
    )

    # Check if already installed
    if (Get-Module PSFzf -ListAvailable) {
        Write-MCPSuccess "PSFzf module already installed"
        return $true
    }

    Write-MCPInfo "Installing PSFzf PowerShell module..."

    # Check if we can install to AllUsers scope
    if ($Scope -eq 'AllUsers' -and -not (Test-IsAdministrator)) {
        Write-MCPWarning "AllUsers scope requires administrator privileges, using CurrentUser"
        $Scope = 'CurrentUser'
    }

    try {
        Install-Module PSFzf -Scope $Scope -Force -AllowClobber -ErrorAction Stop
        Write-MCPSuccess "PSFzf module installed"
        return $true
    }
    catch {
        Write-MCPError "Failed to install PSFzf module: ${_}"

        # Check common issues
        if ($_.Exception.Message -match 'Unable to resolve package source') {
            Write-Host ""
            Write-Host "PowerShell Gallery may be blocked in your environment" -ForegroundColor Yellow
            Write-Host "Try registering PSGallery:" -ForegroundColor Cyan
            Write-Host "  Register-PSRepository -Default" -ForegroundColor Gray
        }

        return $false
    }
}

function Test-EnhancedUIAvailable {
    <#
    .SYNOPSIS
        Check if enhanced UI (PSFzf + fzf) is available
    #>
    $hasPSFzf = Get-Module PSFzf -ListAvailable
    $hasFzf = Get-Command fzf -ErrorAction SilentlyContinue

    return @{
        Available = ($hasPSFzf -and $hasFzf)
        HasPSFzf  = [bool]$hasPSFzf
        HasFzf    = [bool]$hasFzf
    }
}

function Install-EnhancedUI {
    <#
    .SYNOPSIS
        Install enhanced UI dependencies (PSFzf + fzf)
    #>
    [CmdletBinding()]
    param(
        [switch]$SkipPrompt,
        [ValidateSet('CurrentUser', 'AllUsers')]
        [string]$Scope = 'CurrentUser'
    )

    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host "Enhanced UI Installation" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host ""

    $status = Test-EnhancedUIAvailable

    if ($status.Available) {
        Write-MCPSuccess "Enhanced UI already available (PSFzf + fzf)"
        return $true
    }

    Write-Host "The enhanced UI provides a better terminal-based interface" -ForegroundColor Gray
    Write-Host "similar to the bash version. It's completely optional." -ForegroundColor Gray
    Write-Host ""
    Write-Host "Current UI: Out-GridView (native Windows GUI)" -ForegroundColor Gray
    Write-Host "Enhanced UI: PSFzf (terminal-based fuzzy finder)" -ForegroundColor Gray
    Write-Host ""

    if (-not $SkipPrompt) {
        $response = Read-Host "Install enhanced UI components? (y/N)"

        if ($response -notmatch '^[Yy]') {
            Write-Host "Skipping enhanced UI - will use Out-GridView" -ForegroundColor Gray
            return $false
        }
    }

    Write-Host ""

    # Install fzf binary
    if (-not $status.HasFzf) {
        Write-MCPInfo "Step 1/2: Installing fzf binary..."
        $fzfResult = Install-FzfDependency -SkipPrompt:$SkipPrompt

        if (-not $fzfResult) {
            Write-MCPWarning "Failed to install fzf - enhanced UI not available"
            return $false
        }
    }
    else {
        Write-MCPSuccess "Step 1/2: fzf already installed"
    }

    # Install PSFzf module
    if (-not $status.HasPSFzf) {
        Write-MCPInfo "Step 2/2: Installing PSFzf module..."
        $psfzfResult = Install-PSFzfModule -Scope $Scope -SkipPrompt:$SkipPrompt

        if (-not $psfzfResult) {
            Write-MCPWarning "Failed to install PSFzf - enhanced UI not available"
            return $false
        }
    }
    else {
        Write-MCPSuccess "Step 2/2: PSFzf already installed"
    }

    Write-Host ""
    Write-MCPSuccess "Enhanced UI installed successfully!"
    Write-Host ""

    return $true
}

function Test-ModulePathWritable {
    <#
    .SYNOPSIS
        Check if we can write to the module installation path
    #>
    param([string]$Path)

    try {
        $testFile = Join-Path $Path '.write-test'
        $null = New-Item -ItemType File -Path $testFile -Force -ErrorAction Stop
        Remove-Item $testFile -Force -ErrorAction SilentlyContinue
        return $true
    }
    catch {
        return $false
    }
}
