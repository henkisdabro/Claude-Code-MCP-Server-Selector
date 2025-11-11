#
# MCP-Selector PowerShell Module
# Native PowerShell implementation of Claude Code MCP Server Selector
# Version: 2.0.0
#

# Module-level script variables
$script:ModuleRoot = $PSScriptRoot
$script:AllServers = @()
$script:EnterpriseMode = 'none'
$script:AllowedServers = @()
$script:DeniedServers = @()

# Import private functions
$privateFunctions = @(
    Get-ChildItem -Path "$PSScriptRoot/Private/*.ps1" -ErrorAction SilentlyContinue
)

foreach ($function in $privateFunctions) {
    try {
        . $function.FullName
    }
    catch {
        Write-Error "Failed to import private function $($function.FullName): $_"
    }
}

# Import public functions
$publicFunctions = @(
    Get-ChildItem -Path "$PSScriptRoot/Public/*.ps1" -ErrorAction SilentlyContinue
)

foreach ($function in $publicFunctions) {
    try {
        . $function.FullName
    }
    catch {
        Write-Error "Failed to import public function $($function.FullName): $_"
    }
}

# Export public functions and aliases
Export-ModuleMember -Function Invoke-MCPSelector -Alias mcp, claudemcp

# Module initialization
Write-Verbose "MCP-Selector module loaded from $PSScriptRoot"
