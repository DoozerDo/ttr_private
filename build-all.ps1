[CmdletBinding()]
param(
    [switch]$SkipPrecheck,
    [switch]$SkipEnvSync
)

Import-Module -Name .\scripts\docker-cmds.psm1 -Force

Invoke-BuildAll -SkipPrecheck:$SkipPrecheck -SkipEnvSync:$SkipEnvSync
