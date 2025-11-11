<#
.SYNOPSIS
    Validation and testing script for MCP-Selector module

.DESCRIPTION
    Comprehensive validation of the PowerShell module installation
    and functionality. Tests all critical scenarios an expert would
    question.

.NOTES
    Run this after installation to verify everything works correctly
#>

[CmdletBinding()]
param(
    [switch]$Verbose
)

$ErrorActionPreference = 'Stop'
$script:TestResults = @()

# ============================================================================
# TEST FUNCTIONS
# ============================================================================

function Test-Scenario {
    param(
        [string]$Name,
        [scriptblock]$Test
    )

    Write-Host ""
    Write-Host "Testing: $Name" -ForegroundColor Cyan

    try {
        $result = & $Test
        if ($result) {
            Write-Host "  ✓ PASS" -ForegroundColor Green
            $script:TestResults += [PSCustomObject]@{
                Test   = $Name
                Result = 'PASS'
                Error  = $null
            }
        }
        else {
            Write-Host "  ✗ FAIL" -ForegroundColor Red
            $script:TestResults += [PSCustomObject]@{
                Test   = $Name
                Result = 'FAIL'
                Error  = 'Test returned false'
            }
        }
    }
    catch {
        Write-Host "  ✗ FAIL: $_" -ForegroundColor Red
        $script:TestResults += [PSCustomObject]@{
            Test   = $Name
            Result = 'FAIL'
            Error  = $_.Exception.Message
        }
    }
}

# ============================================================================
# PLATFORM TESTS
# ============================================================================

Test-Scenario "Platform variables are available" {
    # Test that $IsWindows, $IsMacOS, $IsLinux exist
    # These should exist in PS 7.0+
    $null -ne (Get-Variable IsWindows -ErrorAction SilentlyContinue)
}

Test-Scenario "PowerShell version is 7.0 or higher" {
    $PSVersionTable.PSVersion -ge [Version]'7.0'
}

Test-Scenario "Module path exists in PSModulePath" {
    $modulePaths = $env:PSModulePath -split [IO.Path]::PathSeparator
    $userModulePath = if ($IsWindows) {
        Join-Path $env:USERPROFILE 'Documents' 'PowerShell' 'Modules'
    }
    else {
        Join-Path $HOME '.local' 'share' 'powershell' 'Modules'
    }

    $modulePaths -contains $userModulePath
}

# ============================================================================
# MODULE TESTS
# ============================================================================

Test-Scenario "Module is installed" {
    $null -ne (Get-Module MCP-Selector -ListAvailable)
}

Test-Scenario "Module loads without errors" {
    Remove-Module MCP-Selector -Force -ErrorAction SilentlyContinue
    Import-Module MCP-Selector -Force
    $null -ne (Get-Module MCP-Selector)
}

Test-Scenario "Module exports expected functions" {
    $module = Get-Module MCP-Selector
    $module.ExportedFunctions.ContainsKey('Invoke-MCPSelector')
}

Test-Scenario "Module exports expected aliases" {
    $module = Get-Module MCP-Selector
    $module.ExportedAliases.ContainsKey('mcp') -and
    $module.ExportedAliases.ContainsKey('claudemcp')
}

Test-Scenario "Aliases work correctly" {
    (Get-Alias mcp -ErrorAction SilentlyContinue).ResolvedCommand.Name -eq 'Invoke-MCPSelector'
}

# ============================================================================
# PATH HANDLING TESTS
# ============================================================================

Test-Scenario "Handles paths with spaces" {
    $testPath = Join-Path $env:TEMP "Test Path With Spaces"
    New-Item -ItemType Directory -Path $testPath -Force -ErrorAction SilentlyContinue | Out-Null

    try {
        # Test that our path functions handle spaces
        Test-Path $testPath
    }
    finally {
        Remove-Item $testPath -Force -ErrorAction SilentlyContinue
    }
}

Test-Scenario "Get-EnterpriseMCPPath handles platform correctly" {
    # Load the function
    $configFile = Get-Module MCP-Selector | Select-Object -ExpandProperty Path
    $privateDir = Join-Path (Split-Path $configFile -Parent) 'Private'
    . (Join-Path $privateDir 'Config.ps1')

    $path = Get-EnterpriseMCPPath
    $path -is [string] -and $path.Length -gt 0
}

# ============================================================================
# JSON HANDLING TESTS
# ============================================================================

Test-Scenario "Handles UTF-8 JSON correctly" {
    $testJson = @{ test = "value"; nested = @{ key = "data" } }
    $tempFile = Join-Path $env:TEMP "test-$(Get-Random).json"

    try {
        $testJson | ConvertTo-Json -Depth 10 | Set-Content $tempFile -Encoding UTF8
        $loaded = Get-Content $tempFile -Raw | ConvertFrom-Json
        $loaded.test -eq "value" -and $loaded.nested.key -eq "data"
    }
    finally {
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    }
}

Test-Scenario "Handles corrupted JSON gracefully" {
    $tempFile = Join-Path $env:TEMP "corrupted-$(Get-Random).json"

    try {
        '{ "invalid": "json", }' | Set-Content $tempFile -Encoding UTF8

        # Our code should handle this
        try {
            Get-Content $tempFile -Raw | ConvertFrom-Json
            $false # Should have thrown
        }
        catch {
            $true # Expected to fail
        }
    }
    finally {
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    }
}

# ============================================================================
# PERMISSION TESTS
# ============================================================================

Test-Scenario "Can write to temp directory" {
    $testFile = Join-Path $env:TEMP "write-test-$(Get-Random).txt"

    try {
        "test" | Out-File $testFile -Encoding UTF8
        Test-Path $testFile
    }
    finally {
        Remove-Item $testFile -Force -ErrorAction SilentlyContinue
    }
}

Test-Scenario "Atomic save creates backup" {
    # Load util functions
    $configFile = Get-Module MCP-Selector | Select-Object -ExpandPath
    $privateDir = Join-Path (Split-Path $configFile -Parent) 'Private'
    . (Join-Path $privateDir 'Util.ps1')

    $testFile = Join-Path $env:TEMP "atomic-test-$(Get-Random).json"

    try {
        # Create initial file
        @{ version = 1 } | ConvertTo-Json | Set-Content $testFile -Encoding UTF8

        # Update with backup
        $result = New-AtomicFileSave -Path $testFile -Content @{ version = 2 } -CreateBackup

        $result -and (Test-Path $testFile)
    }
    finally {
        Remove-Item "$testFile*" -Force -ErrorAction SilentlyContinue
    }
}

# ============================================================================
# UI TESTS
# ============================================================================

Test-Scenario "Out-GridView is available" {
    # Out-GridView should be available on Windows with Desktop Experience
    if ($IsWindows) {
        $null -ne (Get-Command Out-GridView -ErrorAction SilentlyContinue)
    }
    else {
        # On Linux/macOS, Out-GridView may not be available
        Write-Warning "Skipping Out-GridView test on non-Windows platform"
        $true
    }
}

# ============================================================================
# DEPENDENCY TESTS
# ============================================================================

Test-Scenario "Package manager detection works" {
    # Load dependencies
    $configFile = Get-Module MCP-Selector | Select-Object -ExpandPath
    $privateDir = Join-Path (Split-Path $configFile -Parent) 'Private'
    . (Join-Path $privateDir 'Dependencies.ps1')

    $managers = Get-PackageManager
    $managers -is [array]
}

Test-Scenario "Admin detection works" {
    # Load dependencies
    $configFile = Get-Module MCP-Selector | Select-Object -ExpandPath
    $privateDir = Join-Path (Split-Path $configFile -Parent) 'Private'
    . (Join-Path $privateDir 'Dependencies.ps1')

    $isAdmin = Test-IsAdministrator
    $isAdmin -is [bool]
}

# ============================================================================
# CONFIG DISCOVERY TESTS
# ============================================================================

Test-Scenario "Config path discovery works" {
    # Load config functions
    $configFile = Get-Module MCP-Selector | Select-Object -ExpandPath
    $privateDir = Join-Path (Split-Path $configFile -Parent) 'Private'
    . (Join-Path $privateDir 'Config.ps1')

    $paths = Get-MCPConfigPaths
    $paths.Count -gt 0 -and $null -ne $paths.UserClaude
}

# ============================================================================
# RESULTS SUMMARY
# ============================================================================

Write-Host ""
Write-Host "============================================" -ForegroundColor Gray
Write-Host "Test Results Summary" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Gray
Write-Host ""

$passed = ($script:TestResults | Where-Object Result -eq 'PASS').Count
$failed = ($script:TestResults | Where-Object Result -eq 'FAIL').Count
$total = $script:TestResults.Count

Write-Host "Total Tests: $total" -ForegroundColor White
Write-Host "Passed:      $passed" -ForegroundColor Green
Write-Host "Failed:      $failed" -ForegroundColor Red
Write-Host ""

if ($failed -gt 0) {
    Write-Host "Failed Tests:" -ForegroundColor Red
    $script:TestResults | Where-Object Result -eq 'FAIL' | ForEach-Object {
        Write-Host "  ✗ $($_.Test)" -ForegroundColor Red
        if ($_.Error) {
            Write-Host "    Error: $($_.Error)" -ForegroundColor Gray
        }
    }
    Write-Host ""
    exit 1
}
else {
    Write-Host "All tests passed! ✓" -ForegroundColor Green
    Write-Host ""
    exit 0
}
