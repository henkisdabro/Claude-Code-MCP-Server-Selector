# Config.ps1 - Configuration discovery and parsing for MCP-Selector

function Get-MCPConfigPaths {
    <#
    .SYNOPSIS
        Discover all MCP configuration file paths
    .DESCRIPTION
        Returns paths to all 8+ configuration sources:
        - Enterprise (managed-mcp.json)
        - Local (.claude/settings.local.json)
        - Project (.claude/settings.json, .mcp.json)
        - User (~/.claude/settings.json, ~/.claude.json, ~/.mcp.json)
    #>
    [CmdletBinding()]
    param()

    $paths = [ordered]@{
        # Enterprise scope (highest priority = 4)
        EnterpriseMCP      = Get-EnterpriseMCPPath
        EnterpriseSettings = Get-EnterpriseSettingsPath

        # Local scope (priority = 3)
        LocalSettings      = Join-Path (Get-Location).Path '.claude' 'settings.local.json'

        # Project scope (priority = 2)
        ProjectSettings    = Join-Path (Get-Location).Path '.claude' 'settings.json'
        ProjectMCP         = Join-Path (Get-Location).Path '.mcp.json'

        # User scope (priority = 1)
        UserSettingsLocal  = Join-Path $env:USERPROFILE '.claude' 'settings.local.json'
        UserSettings       = Join-Path $env:USERPROFILE '.claude' 'settings.json'
        UserClaude         = Join-Path $env:USERPROFILE '.claude.json'
        UserMCP            = Join-Path $env:USERPROFILE '.mcp.json'
    }

    return $paths
}

function Get-EnterpriseMCPPath {
    <#
    .SYNOPSIS
        Get platform-specific enterprise MCP configuration path
    #>
    # Platform detection with fallback for PS 7.0
    $isWin = if (Get-Variable IsWindows -ErrorAction SilentlyContinue) {
        $IsWindows
    }
    else {
        $PSVersionTable.PSVersion.Major -le 5 -or [System.Environment]::OSVersion.Platform -eq 'Win32NT'
    }

    $isMac = if (Get-Variable IsMacOS -ErrorAction SilentlyContinue) {
        $IsMacOS
    }
    else {
        [System.Environment]::OSVersion.Platform -eq 'Unix' -and
        (uname) -eq 'Darwin'
    }

    if ($isWin) {
        # Native Windows
        return Join-Path $env:ProgramData 'ClaudeCode' 'managed-mcp.json'
    }
    elseif (Test-Path '/proc/version' -ErrorAction SilentlyContinue) {
        # WSL - check both Windows and Linux paths
        $content = Get-Content '/proc/version' -Raw -ErrorAction SilentlyContinue
        if ($content -match 'microsoft') {
            $winPath = '/mnt/c/ProgramData/ClaudeCode/managed-mcp.json'
            $linPath = '/etc/claude-code/managed-mcp.json'

            if (Test-Path $winPath) { return $winPath }
            if (Test-Path $linPath) { return $linPath }
        }

        return '/etc/claude-code/managed-mcp.json'
    }
    elseif ($isMac) {
        # macOS - path has spaces, but PowerShell handles it correctly
        return '/Library/Application Support/ClaudeCode/managed-mcp.json'
    }
    else {
        return '/etc/claude-code/managed-mcp.json'
    }
}

function Get-EnterpriseSettingsPath {
    <#
    .SYNOPSIS
        Get platform-specific enterprise settings path (allowlist/denylist)
    #>
    $mcpPath = Get-EnterpriseMCPPath
    return $mcpPath -replace 'managed-mcp\.json$', 'managed-settings.json'
}

function Get-ScopePriority {
    <#
    .SYNOPSIS
        Get numeric priority for configuration scope
    #>
    param([string]$Scope)

    switch ($Scope) {
        'enterprise' { return 4 }
        'local'      { return 3 }
        'project'    { return 2 }
        'user'       { return 1 }
        default      { return 0 }
    }
}

function ConvertFrom-MCPSettings {
    <#
    .SYNOPSIS
        Parse MCP settings file (.claude/settings*.json)
    .DESCRIPTION
        Extracts:
        - mcpServers object (server definitions)
        - enabledMcpjsonServers array
        - disabledMcpjsonServers array
        - enableAllProjectMcpServers flag
        - enabledPlugins object
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Path,

        [Parameter(Mandatory)]
        [ValidateSet('enterprise', 'local', 'project', 'user')]
        [string]$Scope
    )

    if (-not (Test-Path $Path)) {
        Write-Verbose "Config file not found: $Path"
        return @{
            Definitions = @()
            Enabled     = @()
            Disabled    = @()
            Plugins     = @{}
        }
    }

    try {
        $content = Get-Content $Path -Raw | ConvertFrom-Json

        # Extract server definitions
        $definitions = @()
        if ($content.PSObject.Properties['mcpServers']) {
            foreach ($prop in $content.mcpServers.PSObject.Properties) {
                $definitions += [PSCustomObject]@{
                    Name      = $prop.Name
                    Command   = $prop.Value.command
                    Args      = $prop.Value.args
                    Env       = $prop.Value.env
                    Scope     = $Scope
                    File      = $Path
                    Type      = 'mcpjson'
                }
            }
        }

        # Extract enabled/disabled arrays
        $enabled = @()
        if ($content.PSObject.Properties['enabledMcpjsonServers']) {
            $enabled = @($content.enabledMcpjsonServers)
        }

        $disabled = @()
        if ($content.PSObject.Properties['disabledMcpjsonServers']) {
            $disabled = @($content.disabledMcpjsonServers)
        }

        # Extract plugin enablement
        $plugins = @{}
        if ($content.PSObject.Properties['enabledPlugins']) {
            foreach ($prop in $content.enabledPlugins.PSObject.Properties) {
                $plugins[$prop.Name] = $prop.Value
            }
        }

        return @{
            Definitions = $definitions
            Enabled     = $enabled
            Disabled    = $disabled
            Plugins     = $plugins
            EnableAll   = $content.PSObject.Properties['enableAllProjectMcpServers']?.Value
        }
    }
    catch {
        Write-MCPWarning "Failed to parse ${Path}: ${_}"
        return @{
            Definitions = @()
            Enabled     = @()
            Disabled    = @()
            Plugins     = @{}
        }
    }
}

function ConvertFrom-MCPJson {
    <#
    .SYNOPSIS
        Parse .mcp.json file
    .DESCRIPTION
        Extracts server definitions from mcpServers object
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Path,

        [Parameter(Mandatory)]
        [ValidateSet('project', 'user')]
        [string]$Scope
    )

    if (-not (Test-Path $Path)) {
        return @{
            Definitions = @()
        }
    }

    try {
        $content = Get-Content $Path -Raw | ConvertFrom-Json

        $definitions = @()
        if ($content.PSObject.Properties['mcpServers']) {
            foreach ($prop in $content.mcpServers.PSObject.Properties) {
                $definitions += [PSCustomObject]@{
                    Name    = $prop.Name
                    Command = $prop.Value.command
                    Args    = $prop.Value.args
                    Env     = $prop.Value.env
                    Scope   = $Scope
                    File    = $Path
                    Type    = 'mcpjson'
                }
            }
        }

        return @{
            Definitions = $definitions
        }
    }
    catch {
        Write-MCPWarning "Failed to parse ${Path}: ${_}"
        return @{
            Definitions = @()
        }
    }
}

function ConvertFrom-ClaudeJson {
    <#
    .SYNOPSIS
        Parse .claude.json file
    .DESCRIPTION
        Extracts:
        - Root mcpServers (direct-global)
        - Project-specific mcpServers (direct-local)
        - disabledMcpServers arrays
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    if (-not (Test-Path $Path)) {
        return @{
            GlobalDefinitions = @()
            LocalDefinitions  = @()
            DisabledServers   = @()
        }
    }

    try {
        $content = Get-Content $Path -Raw | ConvertFrom-Json
        $cwd = (Get-Location).Path

        # Extract global (root-level) servers
        $globalDefs = @()
        if ($content.PSObject.Properties['mcpServers']) {
            foreach ($prop in $content.mcpServers.PSObject.Properties) {
                $globalDefs += [PSCustomObject]@{
                    Name    = $prop.Name
                    Command = $prop.Value.command
                    Args    = $prop.Value.args
                    Env     = $prop.Value.env
                    Scope   = 'user'
                    File    = $Path
                    Type    = 'direct-global'
                }
            }
        }

        # Extract project-specific servers and disabled list
        $localDefs = @()
        $disabled = @()

        if ($content.PSObject.Properties['projects']) {
            $projectConfig = $content.projects.PSObject.Properties | Where-Object { $_.Name -eq $cwd } | Select-Object -First 1

            if ($projectConfig) {
                # Extract project-specific servers
                if ($projectConfig.Value.PSObject.Properties['mcpServers']) {
                    foreach ($prop in $projectConfig.Value.mcpServers.PSObject.Properties) {
                        $localDefs += [PSCustomObject]@{
                            Name    = $prop.Name
                            Command = $prop.Value.command
                            Args    = $prop.Value.args
                            Env     = $prop.Value.env
                            Scope   = 'local'
                            File    = $Path
                            Type    = 'direct-local'
                        }
                    }
                }

                # Extract disabled servers list
                if ($projectConfig.Value.PSObject.Properties['disabledMcpServers']) {
                    $disabled = @($projectConfig.Value.disabledMcpServers)
                }
            }
        }

        return @{
            GlobalDefinitions = $globalDefs
            LocalDefinitions  = $localDefs
            DisabledServers   = $disabled
        }
    }
    catch {
        Write-MCPWarning "Failed to parse ${Path}: ${_}"
        return @{
            GlobalDefinitions = @()
            LocalDefinitions  = @()
            DisabledServers   = @()
        }
    }
}
