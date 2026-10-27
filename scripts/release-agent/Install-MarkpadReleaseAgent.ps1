<#
.SYNOPSIS
Installs the Markpad release agent as a scheduled task that checks for a new
release every five minutes while you're signed in.

.DESCRIPTION
Copies MarkpadReleaseAgent.ps1 into %LOCALAPPDATA%\MarkpadReleaseAgent and
registers the "Markpad release agent" scheduled task. The task starts when
you sign in to Windows and keeps checking until you sign out. The
installer also starts the task right away.

Run the installer again after you update the agent script, or run it with
-Uninstall to remove the agent.

.PARAMETER Repo
The GitHub repository to build releases for, in OWNER/NAME form, such as
alex/Markpad.

.PARAMETER Uninstall
Stops the agent and removes the scheduled task and the agent folder.

.EXAMPLE
.\Install-MarkpadReleaseAgent.ps1 -Repo alex/Markpad

.EXAMPLE
.\Install-MarkpadReleaseAgent.ps1 -Uninstall
#>
[CmdletBinding(SupportsShouldProcess, DefaultParameterSetName = 'Install')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Install')]
    [ValidatePattern('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')]
    [string]$Repo,

    [Parameter(Mandatory, ParameterSetName = 'Uninstall')]
    [switch]$Uninstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$taskName = 'Markpad release agent'
$agentDir = Join-Path $env:LOCALAPPDATA 'MarkpadReleaseAgent'
$agentScript = Join-Path $agentDir 'MarkpadReleaseAgent.ps1'
$intervalMinutes = 5

function Remove-AgentTask {
    [CmdletBinding(SupportsShouldProcess)]
    param()
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task -and $PSCmdlet.ShouldProcess($taskName, 'Remove scheduled task')) {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }
}

if ($Uninstall) {
    Remove-AgentTask
    if ((Test-Path -LiteralPath $agentDir) -and $PSCmdlet.ShouldProcess($agentDir, 'Remove folder')) {
        Remove-Item -LiteralPath $agentDir -Recurse -Force
    }
    Write-Output 'Removed the Markpad release agent.'
    return
}

foreach ($tool in 'git', 'node', 'npm', 'gh') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "$tool isn't installed or isn't on the PATH."
    }
}
& gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
    throw "The GitHub CLI isn't signed in. Run 'gh auth login' first."
}

if ($PSCmdlet.ShouldProcess($agentScript, 'Copy agent script')) {
    New-Item -ItemType Directory -Path $agentDir -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'MarkpadReleaseAgent.ps1') -Destination $agentScript -Force
}

$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = @(
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
    '-File', "`"$agentScript`"", '-Repo', $Repo, '-IntervalMinutes', $intervalMinutes
) -join ' '
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $agentDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
# The agent runs until you sign out, so it has no time limit, and the task
# restarts it if it stops.
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew `
    -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

if ($PSCmdlet.ShouldProcess($taskName, 'Register and start scheduled task')) {
    Remove-AgentTask
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
        -Principal $principal -Settings $settings `
        -Description "Builds the Markpad Windows installer for new releases of $Repo." | Out-Null
    Start-ScheduledTask -TaskName $taskName
}

Write-Output "Installed the Markpad release agent for $Repo."
Write-Output "It checks for a new release every $intervalMinutes minutes. The log is $(Join-Path $agentDir 'agent.log')."
