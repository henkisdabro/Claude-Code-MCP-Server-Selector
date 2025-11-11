# Enterprise.ps1 - Enterprise policy support for MCP-Selector

function Get-EnterpriseMCPConfig {
    <#
    .SYNOPSIS
        Load enterprise-managed MCP configuration
    #>
    [CmdletBinding()]
    param()

    $path = Get-EnterpriseMCPPath

    if (-not (Test-Path $path)) {
        return @{
            Servers = @()
            Mode    = 'none'
        }
    }

    try {
        $content = Get-Content $path -Raw | ConvertFrom-Json

        $servers = @()
        if ($content.PSObject.Properties['mcpServers']) {
            foreach ($prop in $content.mcpServers.PSObject.Properties) {
                $servers += [PSCustomObject]@{
                    Name    = $prop.Name
                    Command = $prop.Value.command
                    Args    = $prop.Value.args
                    Env     = $prop.Value.env
                    Scope   = 'enterprise'
                    File    = $path
                    Type    = 'mcpjson'
                    Flags   = 'e'  # Enterprise flag
                }
            }
        }

        Write-Verbose "Loaded $($servers.Count) enterprise-managed servers"

        return @{
            Servers = $servers
            Mode    = 'active'
        }
    }
    catch {
        Write-MCPWarning "Failed to parse enterprise config (entering lockdown mode): ${_}"
        return @{
            Servers = @()
            Mode    = 'lockdown'
        }
    }
}

function Get-EnterpriseRestrictions {
    <#
    .SYNOPSIS
        Load enterprise access control policies
    #>
    [CmdletBinding()]
    param()

    $path = Get-EnterpriseSettingsPath

    if (-not (Test-Path $path)) {
        return @{
            Allowlist = $null
            Denylist  = $null
            Mode      = 'none'
        }
    }

    try {
        $content = Get-Content $path -Raw | ConvertFrom-Json

        $allowlist = $null
        if ($content.PSObject.Properties['allowedMcpServers']) {
            $allowlist = @($content.allowedMcpServers)
        }

        $denylist = $null
        if ($content.PSObject.Properties['deniedMcpServers']) {
            $denylist = @($content.deniedMcpServers)
        }

        # Determine restriction mode
        $mode = 'none'
        if ($denylist -and $allowlist) {
            $mode = 'both'
        }
        elseif ($denylist) {
            $mode = 'denylist'
        }
        elseif ($allowlist) {
            $mode = 'allowlist'
        }

        Write-Verbose "Enterprise restrictions: mode=$mode, allowlist=$($allowlist?.Count ?? 0), denylist=$($denylist?.Count ?? 0)"

        return @{
            Allowlist = $allowlist
            Denylist  = $denylist
            Mode      = $mode
        }
    }
    catch {
        Write-MCPWarning "Failed to parse enterprise restrictions (entering lockdown): ${_}"
        return @{
            Allowlist = @()
            Denylist  = @()
            Mode      = 'lockdown'
        }
    }
}

function Test-ServerInAllowlist {
    <#
    .SYNOPSIS
        Check if server is in allowlist
    #>
    param(
        [string]$ServerName,
        [array]$Allowlist
    )

    if ($null -eq $Allowlist) {
        return $true  # No allowlist = all allowed
    }

    return $Allowlist -contains $ServerName
}

function Test-ServerInDenylist {
    <#
    .SYNOPSIS
        Check if server is in denylist
    #>
    param(
        [string]$ServerName,
        [array]$Denylist
    )

    if ($null -eq $Denylist) {
        return $false  # No denylist = none denied
    }

    return $Denylist -contains $ServerName
}

function Test-ServerAllowed {
    <#
    .SYNOPSIS
        Check if server is allowed by enterprise policies
    .DESCRIPTION
        Truth table:
        - Denylist is absolute (blocks all scopes including enterprise)
        - Allowlist only applies to non-enterprise servers
        - Empty allowlist = lockdown mode (only enterprise servers)
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$ServerName,

        [Parameter(Mandatory)]
        [string]$ServerScope,

        [array]$Allowlist,
        [array]$Denylist
    )

    # Check denylist first (absolute)
    if (Test-ServerInDenylist -ServerName $ServerName -Denylist $Denylist) {
        return @{
            Allowed = $false
            Reason  = 'blocked'
            Flag    = 'b'
        }
    }

    # Enterprise servers bypass allowlist
    if ($ServerScope -eq 'enterprise') {
        return @{
            Allowed = $true
            Reason  = 'enterprise'
            Flag    = 'e'
        }
    }

    # Check allowlist
    if ($null -ne $Allowlist) {
        if (-not (Test-ServerInAllowlist -ServerName $ServerName -Allowlist $Allowlist)) {
            return @{
                Allowed = $false
                Reason  = 'restricted'
                Flag    = 'r'
            }
        }
    }

    return @{
        Allowed = $true
        Reason  = 'allowed'
        Flag    = ''
    }
}

function Get-EnterpriseMode {
    <#
    .SYNOPSIS
        Determine overall enterprise mode
    #>
    [CmdletBinding()]
    param()

    $mcpConfig = Get-EnterpriseMCPConfig
    $restrictions = Get-EnterpriseRestrictions

    if ($mcpConfig.Mode -eq 'lockdown' -or $restrictions.Mode -eq 'lockdown') {
        return 'lockdown'
    }

    if ($mcpConfig.Mode -eq 'active' -or $restrictions.Mode -ne 'none') {
        return 'active'
    }

    return 'none'
}
