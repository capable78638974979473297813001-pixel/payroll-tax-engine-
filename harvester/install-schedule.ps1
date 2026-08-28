<#
.SYNOPSIS
  Register (or re-register) the 8am daily harvest sweep with Windows Task
  Scheduler.

.DESCRIPTION
  Deliberately the OS scheduler and not an in-app timer: the sweep has to
  run whether or not any editor, terminal or agent happens to be open, and
  it has to survive a reboot. Anything living inside another program stops
  the moment that program does, which is exactly the silent failure the
  monitor exists to rule out.

  Three settings carry most of the reliability:

    -StartWhenAvailable   If the machine is asleep or off at 08:00, run as
                          soon as it can rather than skipping the day. This
                          is the single most important flag here — a laptop
                          shut at 8am is the normal case, not the exception.
    -RestartCount 3       A transient network failure retries instead of
                          writing the day off.
    -WakeToRun            Wake the machine if it is only sleeping.

  The task runs whether or not the user is logged on, so an unattended
  machine still reports.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File harvester\install-schedule.ps1
#>

[CmdletBinding()]
param(
  [string]$Time = '08:00',
  [string]$TaskName = 'PayrollTaxEngine-DailyHarvest'
)

$ErrorActionPreference = 'Stop'

# Resolve the repo from this script's own location, so the task keeps
# working if the checkout moves.
$RepoRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $RepoRoot 'harvester\state'
$LogFile = Join-Path $LogDir 'daily.log'

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  throw "node was not found on PATH. Task Scheduler does not inherit an interactive shell's PATH, so the absolute path to node.exe is required."
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# Append to a log rather than overwrite: the journal is the structured
# record, but a plain transcript of what the task itself printed is what
# you want when the question is "did it even start".
# Out-File -Append -Encoding utf8 rather than `*>>`: PowerShell's redirect
# operator writes UTF-16LE, which makes the transcript near-unreadable with
# ordinary tools (verified — the first scheduled run produced a log that
# grep and head could not usefully read).
$inner = "& '$node' '$RepoRoot\examples\harvest-daily.ts' daily 2>&1 | Out-File -FilePath '$LogFile' -Append -Encoding utf8"
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($inner))

$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encoded" `
  -WorkingDirectory $RepoRoot

$trigger = New-ScheduledTaskTrigger -Daily -At $Time

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -WakeToRun `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 15) `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
  -MultipleInstances IgnoreNew `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed the previous '$TaskName' registration."
}

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description 'Daily sweep of every registered payroll-tax source. Writes findings to harvester/state/events.jsonl; read them with: npm run harvest:status' `
  -RunLevel Limited | Out-Null

Write-Host ""
Write-Host "Registered '$TaskName' for $Time daily."
Write-Host "  repo:  $RepoRoot"
Write-Host "  node:  $node"
Write-Host "  log:   $LogFile"
Write-Host ""
Write-Host "Verify:      Get-ScheduledTask -TaskName '$TaskName'"
Write-Host "Run it now:  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Read state:  npm run harvest:status"
Write-Host "Remove:      Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
Write-Host ""
