<#
.SYNOPSIS
Builds the Markpad Windows installer for the latest GitHub release and
attaches it to the release.

.DESCRIPTION
Each check looks at the repository's latest release. If the release doesn't
have the Windows installer yet, the agent checks out the release tag, runs
the unit tests, builds the installer, and uploads it to the release. If the
release already has the installer, the check does nothing.

A failed build isn't retried until the tag moves to a different commit,
unless you pass -Force.

The agent needs Git, Node.js 24 or later, and the GitHub CLI (gh), signed in
with `gh auth login`. It runs in Windows PowerShell 5.1 and PowerShell 7.

.PARAMETER Repo
The GitHub repository, in OWNER/NAME form, such as alex/Markpad.

.PARAMETER Force
Builds even if the last build of this release failed.

.PARAMETER WorkDir
The folder for the checkout, state, and log. Default:
%LOCALAPPDATA%\MarkpadReleaseAgent.

.PARAMETER CloneUrl
The URL to clone from. Default: the repository on GitHub.

.PARAMETER IntervalMinutes
The minutes between checks. With 0, the agent checks once and exits.
Default: 0.

.EXAMPLE
.\MarkpadReleaseAgent.ps1 -Repo alex/Markpad

Checks once, and builds and uploads the installer if the latest release
needs it.
#>
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSReviewUnusedParameter', 'Force',
    Justification = 'Invoke-ReleaseCheck reads it from the script scope.')]
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')]
    [string]$Repo,

    [switch]$Force,

    [ValidateNotNullOrEmpty()]
    [string]$WorkDir = (Join-Path $env:LOCALAPPDATA 'MarkpadReleaseAgent'),

    [string]$CloneUrl,

    [ValidateRange(0, 1440)]
    [int]$IntervalMinutes = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $CloneUrl) {
    $CloneUrl = "https://github.com/$Repo.git"
}
$checkout = Join-Path $WorkDir 'repo'
$stateFile = Join-Path $WorkDir 'failed-build.txt'
$lockFile = Join-Path $WorkDir 'agent.lock'
$logFile = Join-Path $WorkDir 'agent.log'
$maxLogBytes = 1000000

function Write-AgentLog {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Message)
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
    Write-Verbose $line
}

# Keeps the log under about 1 MB by starting a new file and keeping one old one.
function Limit-AgentLog {
    [CmdletBinding()]
    param()
    if ((Test-Path -LiteralPath $logFile) -and (Get-Item -LiteralPath $logFile).Length -gt $maxLogBytes) {
        Move-Item -LiteralPath $logFile -Destination "$logFile.1" -Force
    }
}

<#
Runs a native command, appends its output to the log, and throws if it
fails. Returns nothing.
#>
function Invoke-Tool {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$ArgumentList = @()
    )
    # Windows PowerShell 5.1 turns native stderr into errors when it's
    # redirected, and git and npm write progress there, so don't stop on it.
    $ErrorActionPreference = 'Continue'
    & $FilePath @ArgumentList 2>&1 | ForEach-Object { "$_" } |
        Add-Content -LiteralPath $logFile -Encoding UTF8
    if ($LASTEXITCODE -ne 0) {
        throw "'$FilePath $($ArgumentList -join ' ')' failed with exit code $LASTEXITCODE."
    }
}

<#
Runs a native command and returns its standard output as one string, or
$null if the command fails.
#>
function Get-ToolOutput {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$ArgumentList = @()
    )
    $ErrorActionPreference = 'Continue'
    $output = & $FilePath @ArgumentList 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $null
    }
    return (@($output) -join "`n").Trim()
}

function Test-Prerequisite {
    [CmdletBinding()]
    param()
    foreach ($tool in 'git', 'node', 'npm', 'gh') {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
            throw "$tool isn't installed or isn't on the PATH."
        }
    }
    if ($null -eq (Get-ToolOutput gh 'auth', 'status')) {
        throw "The GitHub CLI isn't signed in. Run 'gh auth login'."
    }
}

# Checks out a tag into a clean copy of the repository.
function Sync-Checkout {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Tag)
    if (-not (Test-Path -LiteralPath (Join-Path $checkout '.git'))) {
        if (Test-Path -LiteralPath $checkout) {
            Remove-Item -LiteralPath $checkout -Recurse -Force
        }
        Invoke-Tool git 'clone', '--quiet', $CloneUrl, $checkout
    }
    Invoke-Tool git '-C', $checkout, 'fetch', '--quiet', '--force', '--tags', 'origin'
    Invoke-Tool git '-C', $checkout, 'checkout', '--quiet', '--force', '--detach', "refs/tags/$Tag"
    Invoke-Tool git '-C', $checkout, 'clean', '--quiet', '-fdx'
}

# Runs the unit tests and builds the installer in the checkout.
function Invoke-Build {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Version)
    $package = Get-Content -LiteralPath (Join-Path $checkout 'package.json') -Raw | ConvertFrom-Json
    if ($package.version -ne $Version) {
        throw "The tag says version $Version, but package.json says $($package.version)."
    }
    Push-Location -LiteralPath $checkout
    try {
        Invoke-Tool npm 'ci', '--no-audit', '--no-fund'
        Invoke-Tool npm 'test'
        Invoke-Tool npm 'run', 'dist:win'
    }
    finally {
        Pop-Location
    }
}

# Builds and uploads the installer if the latest release needs it.
function Invoke-ReleaseCheck {
    [CmdletBinding()]
    param()
    Test-Prerequisite
    $tag = Get-ToolOutput gh 'release', 'view', '--repo', $Repo, '--json', 'tagName', '--jq', '.tagName'
    if (-not $tag) {
        return # The repository has no release yet, or GitHub is unreachable.
    }
    $version = $tag -replace '^v', ''
    $installer = "Markpad-Setup-$version.exe"

    $assets = Get-ToolOutput gh 'release', 'view', $tag, '--repo', $Repo, '--json', 'assets', '--jq', '.assets[].name'
    if ($null -eq $assets) {
        throw "Couldn't list the assets of release $tag."
    }
    if (($assets -split "`n") -contains $installer) {
        return # This release already has the installer.
    }

    $refs = Get-ToolOutput git 'ls-remote', $CloneUrl, "refs/tags/$tag^{}", "refs/tags/$tag"
    $commit = if ($refs) { ($refs -split "`n")[0].Split("`t")[0] } else { 'unknown' }
    $state = "$tag $commit"
    if (-not $Force -and (Test-Path -LiteralPath $stateFile) -and
        (Get-Content -LiteralPath $stateFile -Raw).Trim() -eq $state) {
        return # This commit already failed to build; wait for a new tag or -Force.
    }

    Write-AgentLog "Building $installer for $tag ($commit)."
    try {
        Sync-Checkout -Tag $tag
        Invoke-Build -Version $version
        $file = Join-Path $checkout "dist\$installer"
        if (-not (Test-Path -LiteralPath $file)) {
            throw "The build didn't produce dist\$installer."
        }
    }
    catch {
        Set-Content -LiteralPath $stateFile -Value $state -Encoding UTF8
        throw "The build for $tag failed: $($_.Exception.Message) See the build output earlier in $logFile."
    }
    Invoke-Tool gh 'release', 'upload', $tag, $file, '--repo', $Repo, '--clobber'
    Remove-Item -LiteralPath $stateFile -ErrorAction SilentlyContinue
    Write-AgentLog "Uploaded $installer to $tag."
}

# Runs one check while holding the lock, so that two agents never build at once.
function Invoke-LockedCheck {
    [CmdletBinding()]
    param()
    $lock = $null
    try {
        $lock = [System.IO.File]::Open($lockFile, 'OpenOrCreate', 'ReadWrite', 'None')
    }
    catch [System.IO.IOException] {
        return # Another run holds the lock.
    }
    try {
        Limit-AgentLog
        Invoke-ReleaseCheck
    }
    catch {
        Write-AgentLog "ERROR: $($_.Exception.Message)"
        throw
    }
    finally {
        $lock.Dispose()
    }
}

New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null
if ($IntervalMinutes -eq 0) {
    Invoke-LockedCheck
    exit 0
}
while ($true) {
    try {
        Invoke-LockedCheck
    }
    catch {
        # Invoke-LockedCheck logged the error; keep checking.
        Write-Verbose $_.Exception.Message
    }
    Start-Sleep -Seconds ($IntervalMinutes * 60)
}
