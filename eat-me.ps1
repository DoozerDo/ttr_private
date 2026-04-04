Import-Module -Name .\scripts\docker-cmds.psm1

# Backwards-compatible aliases for legacy unapproved-verb function names
Set-Alias -Scope Global -Name Build-Both   -Value Invoke-BuildBoth
Set-Alias -Scope Global -Name Build-All    -Value Invoke-BuildAll
Set-Alias -Scope Global -Name Sync-EnvFiles -Value Invoke-SyncEnvFiles

