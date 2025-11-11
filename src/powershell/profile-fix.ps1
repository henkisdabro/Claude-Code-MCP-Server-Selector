# PowerShell Profile Fix for MCP-Selector Module Loading
# Add this to your PowerShell profile to ensure the correct module version loads

# Ensure CurrentUser module location takes precedence
$currentUserModules = if ($IsWindows) {
    Join-Path $env:USERPROFILE 'Documents' 'PowerShell' 'Modules'
}
else {
    Join-Path $HOME '.local' 'share' 'powershell' 'Modules'
}

# Add to front of PSModulePath if not already first
if ($env:PSModulePath -notlike "$currentUserModules*") {
    $env:PSModulePath = "$currentUserModules;$env:PSModulePath"
}

# Force remove any already-loaded MCP-Selector module (in case stale version loaded)
if (Get-Module MCP-Selector) {
    Remove-Module MCP-Selector -Force -ErrorAction SilentlyContinue
}
