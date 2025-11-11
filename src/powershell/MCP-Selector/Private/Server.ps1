# Server.ps1 - Server state management for MCP-Selector

function Get-MCPServers {
    <#
    .SYNOPSIS
        Load and merge all MCP servers from all configuration sources
    #>
    [CmdletBinding()]
    param(
        [switch]$FastMode = $true
    )

    # Get all config paths
    $paths = Get-MCPConfigPaths

    # Load enterprise config
    $enterpriseConfig = Get-EnterpriseMCPConfig
    $restrictions = Get-EnterpriseRestrictions

    # Store in script scope for other functions
    $script:EnterpriseMode = Get-EnterpriseMode
    $script:AllowedServers = $restrictions.Allowlist
    $script:DeniedServers = $restrictions.Denylist

    # Parse all configuration files
    $allDefinitions = @{}
    $enabledLists = @{}
    $disabledLists = @{}
    $disabledDirect = @()

    # Enterprise servers (priority 4)
    foreach ($server in $enterpriseConfig.Servers) {
        $allDefinitions[$server.Name] = @{
            Definition = $server
            Priority   = 4
        }
    }

    # Local settings (priority 3)
    if (Test-Path $paths.LocalSettings) {
        $config = ConvertFrom-MCPSettings -Path $paths.LocalSettings -Scope 'local'
        foreach ($def in $config.Definitions) {
            if (-not $allDefinitions[$def.Name] -or $allDefinitions[$def.Name].Priority -lt 3) {
                $allDefinitions[$def.Name] = @{
                    Definition = $def
                    Priority   = 3
                }
            }
        }
        $enabledLists['local'] = $config.Enabled
        $disabledLists['local'] = $config.Disabled
    }

    # Project settings (priority 2)
    if (Test-Path $paths.ProjectSettings) {
        $config = ConvertFrom-MCPSettings -Path $paths.ProjectSettings -Scope 'project'
        foreach ($def in $config.Definitions) {
            if (-not $allDefinitions[$def.Name] -or $allDefinitions[$def.Name].Priority -lt 2) {
                $allDefinitions[$def.Name] = @{
                    Definition = $def
                    Priority   = 2
                }
            }
        }
        $enabledLists['project'] = $config.Enabled
        $disabledLists['project'] = $config.Disabled
    }

    # Project MCP.json (priority 2)
    if (Test-Path $paths.ProjectMCP) {
        $config = ConvertFrom-MCPJson -Path $paths.ProjectMCP -Scope 'project'
        foreach ($def in $config.Definitions) {
            if (-not $allDefinitions[$def.Name] -or $allDefinitions[$def.Name].Priority -lt 2) {
                $allDefinitions[$def.Name] = @{
                    Definition = $def
                    Priority   = 2
                }
            }
        }
    }

    # User settings (priority 1)
    if (Test-Path $paths.UserSettings) {
        $config = ConvertFrom-MCPSettings -Path $paths.UserSettings -Scope 'user'
        foreach ($def in $config.Definitions) {
            if (-not $allDefinitions[$def.Name] -or $allDefinitions[$def.Name].Priority -lt 1) {
                $allDefinitions[$def.Name] = @{
                    Definition = $def
                    Priority   = 1
                }
            }
        }
        $enabledLists['user'] = $config.Enabled
        $disabledLists['user'] = $config.Disabled
    }

    # User MCP.json (priority 1)
    if (Test-Path $paths.UserMCP) {
        $config = ConvertFrom-MCPJson -Path $paths.UserMCP -Scope 'user'
        foreach ($def in $config.Definitions) {
            if (-not $allDefinitions[$def.Name] -or $allDefinitions[$def.Name].Priority -lt 1) {
                $allDefinitions[$def.Name] = @{
                    Definition = $def
                    Priority   = 1
                }
            }
        }
    }

    # .claude.json - Direct servers
    if (Test-Path $paths.UserClaude) {
        $config = ConvertFrom-ClaudeJson -Path $paths.UserClaude

        foreach ($def in $config.GlobalDefinitions) {
            if (-not $allDefinitions[$def.Name]) {
                $allDefinitions[$def.Name] = @{
                    Definition = $def
                    Priority   = 1
                }
            }
        }

        foreach ($def in $config.LocalDefinitions) {
            if (-not $allDefinitions[$def.Name] -or $allDefinitions[$def.Name].Priority -lt 3) {
                $allDefinitions[$def.Name] = @{
                    Definition = $def
                    Priority   = 3
                }
            }
        }

        $disabledDirect = $config.DisabledServers
    }

    # Build final server list
    $servers = @()

    foreach ($entry in $allDefinitions.GetEnumerator()) {
        $serverName = $entry.Key
        $def = $entry.Value.Definition

        # Determine state (enabled/disabled)
        $state = 'on'  # Default for most servers

        # Check enabled/disabled lists (highest priority scope wins)
        foreach ($scope in @('local', 'project', 'user')) {
            if ($enabledLists[$scope] -contains $serverName) {
                $state = 'on'
                break
            }
            if ($disabledLists[$scope] -contains $serverName) {
                $state = 'off'
                break
            }
        }

        # Check runtime override (ORANGE state)
        $runtime = 'unknown'
        if ($disabledDirect -contains $serverName) {
            $runtime = 'stopped'
        }

        # Check enterprise restrictions
        $allowed = Test-ServerAllowed `
            -ServerName $serverName `
            -ServerScope $def.Scope `
            -Allowlist $script:AllowedServers `
            -Denylist $script:DeniedServers

        if (-not $allowed.Allowed) {
            $state = 'off'
        }

        $flags = $allowed.Flag
        if ($def.Scope -eq 'enterprise') {
            $flags = 'e'
        }

        $servers += [PSCustomObject]@{
            Name            = $serverName
            State           = $state
            Runtime         = $runtime
            SourceType      = $def.Type
            DefinitionScope = $def.Scope
            DefinitionFile  = $def.File
            Flags           = $flags
            Command         = $def.Command
            Args            = $def.Args
            Env             = $def.Env
            Allowed         = $allowed.Allowed
        }
    }

    # Store in script scope
    $script:AllServers = $servers

    Write-Verbose "Loaded $($servers.Count) servers"
    return $servers
}

function Set-MCPServerState {
    <#
    .SYNOPSIS
        Toggle server state (3-way cycle: RED → GREEN → ORANGE → RED)
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [PSCustomObject]$Server,

        [ValidateSet('RED', 'GREEN', 'ORANGE')]
        [string]$NewState
    )

    # Check if server is allowed to be modified
    if ($Server.Flags -match 'e') {
        throw "Cannot modify enterprise-managed server: $($Server.Name)"
    }

    if ($Server.Flags -match 'b' -and $NewState -ne 'RED') {
        throw "Cannot enable blocked server: $($Server.Name)"
    }

    if ($Server.Flags -match 'r' -and $NewState -ne 'RED') {
        throw "Cannot enable restricted server: $($Server.Name)"
    }

    # Update server state
    $Server.State = switch ($NewState) {
        'RED'    { 'off' }
        'GREEN'  { 'on' }
        'ORANGE' { 'on' }
    }

    $Server.Runtime = switch ($NewState) {
        'RED'    { 'unknown' }
        'GREEN'  { 'unknown' }
        'ORANGE' { 'stopped' }
    }

    Write-Verbose "Set $($Server.Name) to $NewState (state=$($Server.State), runtime=$($Server.Runtime))"
}

function Save-MCPConfiguration {
    <#
    .SYNOPSIS
        Save MCP server configuration atomically
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [PSCustomObject[]]$Servers
    )

    # Separate MCPJSON and Direct servers
    $mcpjsonServers = $Servers | Where-Object { $_.SourceType -eq 'mcpjson' }
    $directServers = $Servers | Where-Object { $_.SourceType -in @('direct-global', 'direct-local') }

    # Build enabled/disabled arrays for MCPJSON
    $enabled = @()
    $disabled = @()

    foreach ($server in $mcpjsonServers) {
        if ($server.State -eq 'on' -and $server.Runtime -ne 'stopped') {
            $enabled += $server.Name
        }
        elseif ($server.State -eq 'off') {
            $disabled += $server.Name
        }
        # ORANGE servers (state=on, runtime=stopped) go to neither array
    }

    # Save to .claude/settings.local.json
    $settingsPath = Join-Path (Get-Location).Path '.claude' 'settings.local.json'

    # Load existing or create new
    if (Test-Path $settingsPath) {
        $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json
    }
    else {
        $settings = [PSCustomObject]@{}
    }

    # Update arrays
    $settings | Add-Member -NotePropertyName 'enabledMcpjsonServers' -NotePropertyValue $enabled -Force
    $settings | Add-Member -NotePropertyName 'disabledMcpjsonServers' -NotePropertyValue $disabled -Force

    # Save atomically
    $success = New-AtomicFileSave -Path $settingsPath -Content $settings -CreateBackup

    if (-not $success) {
        throw "Failed to save MCPJSON configuration"
    }

    Write-MCPSuccess "Saved configuration to $settingsPath"

    # Handle Direct servers (ORANGE state) - update disabledMcpServers in .claude.json
    $orangeDirectServers = $directServers | Where-Object { $_.Runtime -eq 'stopped' }

    if ($orangeDirectServers) {
        $claudeJsonPath = Join-Path $env:USERPROFILE '.claude.json'

        if (Test-Path $claudeJsonPath) {
            $claudeJson = Get-Content $claudeJsonPath -Raw | ConvertFrom-Json
            $cwd = (Get-Location).Path

            # Ensure projects structure exists
            if (-not $claudeJson.PSObject.Properties['projects']) {
                $claudeJson | Add-Member -NotePropertyName 'projects' -NotePropertyValue ([PSCustomObject]@{}) -Force
            }

            # Ensure current project exists
            if (-not $claudeJson.projects.PSObject.Properties[$cwd]) {
                $claudeJson.projects | Add-Member -NotePropertyName $cwd -NotePropertyValue ([PSCustomObject]@{}) -Force
            }

            # Update disabledMcpServers
            $disabledDirect = @($orangeDirectServers.Name)
            $claudeJson.projects.$cwd | Add-Member -NotePropertyName 'disabledMcpServers' -NotePropertyValue $disabledDirect -Force

            # Save atomically
            $success = New-AtomicFileSave -Path $claudeJsonPath -Content $claudeJson -CreateBackup

            if (-not $success) {
                Write-MCPWarning "Failed to save Direct server runtime overrides"
            }
            else {
                Write-MCPSuccess "Saved Direct server overrides to $claudeJsonPath"
            }
        }
    }
}
