# Util.ps1 - Utility functions for MCP-Selector module

function Strip-ANSISequences {
    <#
    .SYNOPSIS
        Remove ANSI escape sequences from string
    #>
    param([string]$Text)

    if ([string]::IsNullOrEmpty($Text)) { return $Text }

    # Remove ANSI escape sequences
    $Text -replace '\x1b\[[0-9;]*m', ''
}

function Get-VisualWidth {
    <#
    .SYNOPSIS
        Calculate visual width of string (accounting for wide characters)
    #>
    param([string]$Text)

    if ([string]::IsNullOrEmpty($Text)) { return 0 }

    # Strip ANSI first
    $clean = Strip-ANSISequences $Text

    # Simple implementation - count characters
    # TODO: Handle wide characters (CJK, emoji) properly
    $clean.Length
}

function Truncate-Text {
    <#
    .SYNOPSIS
        Truncate text to specified width with ellipsis
    #>
    param(
        [string]$Text,
        [int]$MaxWidth,
        [string]$Ellipsis = '...'
    )

    if ((Get-VisualWidth $Text) -le $MaxWidth) {
        return $Text
    }

    $clean = Strip-ANSISequences $Text
    $truncated = $clean.Substring(0, [Math]::Max(0, $MaxWidth - $Ellipsis.Length))
    return $truncated + $Ellipsis
}

function New-AtomicFileSave {
    <#
    .SYNOPSIS
        Atomically save JSON file with backup
    #>
    param(
        [Parameter(Mandatory)]
        [string]$Path,

        [Parameter(Mandatory)]
        [object]$Content,

        [switch]$CreateBackup
    )

    try {
        # Ensure directory exists
        $directory = Split-Path $Path -Parent
        if (-not (Test-Path $directory)) {
            New-Item -ItemType Directory -Path $directory -Force | Out-Null
        }

        # Create backup if file exists
        if ($CreateBackup -and (Test-Path $Path)) {
            $timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
            $backupPath = "$Path.backup-$timestamp"
            Copy-Item $Path $backupPath -Force
            Write-Verbose "Created backup: $backupPath"
        }

        # Write to temp file first
        $tempPath = "$Path.tmp"
        $Content | ConvertTo-Json -Depth 10 | Set-Content $tempPath -Encoding UTF8 -Force

        # Validate JSON
        try {
            Get-Content $tempPath -Raw | ConvertFrom-Json | Out-Null
        }
        catch {
            Remove-Item $tempPath -Force -ErrorAction SilentlyContinue
            throw "Generated invalid JSON: $_"
        }

        # Atomic move
        Move-Item $tempPath $Path -Force

        Write-Verbose "Saved: $Path"
        return $true
    }
    catch {
        Write-Error "Failed to save file $Path: $_"
        return $false
    }
}

function Get-ClaudeBinary {
    <#
    .SYNOPSIS
        Find Claude Code binary path
    #>
    [CmdletBinding()]
    param()

    # Check common locations
    $candidates = @(
        "$env:USERPROFILE\.local\bin\claude.exe",
        "$env:USERPROFILE\.local\bin\claude",
        (Get-Command claude -ErrorAction SilentlyContinue).Source
    )

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }

    throw "Claude Code binary not found. Please ensure Claude Code CLI is installed."
}

function Expand-HomeDirectory {
    <#
    .SYNOPSIS
        Expand ~ to user home directory
    #>
    param([string]$Path)

    if ($Path.StartsWith('~')) {
        return $Path -replace '^~', $env:USERPROFILE
    }
    return $Path
}

function Get-RelativePath {
    <#
    .SYNOPSIS
        Get relative path for display
    #>
    param(
        [string]$Path,
        [string]$Base = (Get-Location).Path
    )

    try {
        $relativePath = [System.IO.Path]::GetRelativePath($Base, $Path)
        if ($relativePath.StartsWith('..')) {
            return $Path  # Don't show relative if goes up
        }
        return ".\$relativePath"
    }
    catch {
        return $Path
    }
}

function Test-JSONValid {
    <#
    .SYNOPSIS
        Test if file contains valid JSON
    #>
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return $false
    }

    try {
        Get-Content $Path -Raw | ConvertFrom-Json | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Write-ColorOutput {
    <#
    .SYNOPSIS
        Write colored output using PSStyle
    #>
    param(
        [string]$Message,
        [string]$ForegroundColor = 'White',
        [string]$Prefix = ''
    )

    $colorMap = @{
        'Red'     = $PSStyle.Foreground.Red
        'Green'   = $PSStyle.Foreground.Green
        'Yellow'  = $PSStyle.Foreground.Yellow
        'Blue'    = $PSStyle.Foreground.Blue
        'Cyan'    = $PSStyle.Foreground.Cyan
        'Magenta' = $PSStyle.Foreground.Magenta
        'White'   = $PSStyle.Reset
    }

    $color = $colorMap[$ForegroundColor] ?? $PSStyle.Reset
    Write-Host "$Prefix$color$Message$($PSStyle.Reset)"
}

function Write-MCPInfo {
    param([string]$Message)
    Write-ColorOutput -Message "→ $Message" -ForegroundColor Cyan
}

function Write-MCPSuccess {
    param([string]$Message)
    Write-ColorOutput -Message "✓ $Message" -ForegroundColor Green
}

function Write-MCPError {
    param([string]$Message)
    Write-ColorOutput -Message "✗ $Message" -ForegroundColor Red
}

function Write-MCPWarning {
    param([string]$Message)
    Write-ColorOutput -Message "⚠ $Message" -ForegroundColor Yellow
}

function Get-TerminalWidth {
    <#
    .SYNOPSIS
        Get terminal width
    #>
    try {
        return $Host.UI.RawUI.WindowSize.Width
    }
    catch {
        return 80  # Fallback
    }
}
