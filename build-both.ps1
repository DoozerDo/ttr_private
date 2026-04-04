[CmdletBinding()]
param(
    [switch]$SkipPrecheck,
    [switch]$SkipEnvSync,
    [switch]$Force
)

Import-Module -Name .\scripts\docker-cmds.psm1 -Force

Invoke-BuildBoth -SkipPrecheck:$SkipPrecheck -SkipEnvSync:$SkipEnvSync -Force:$Force
