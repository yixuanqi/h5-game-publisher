$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" } }
Get-Command gh -ErrorAction Stop | Out-Null
Get-Command git -ErrorAction Stop | Out-Null
gh auth status; Check-Exit
$login = gh api user --jq '.login'; Check-Exit
if ($login -ne 'yixuanqi') { throw "Unexpected GitHub account: $login" }
$repo = 'yixuanqi/h5-game-publisher'
if (Test-Path '.git') { throw 'Existing Git checkout detected; use normal git workflow instead.' }
git init -b main; Check-Exit
git add -- README.md package.json .gitignore scripts configs examples tests docs .github; Check-Exit
git commit -m 'feat: bootstrap reusable H5 Android game publisher'; Check-Exit
# gh repo create refuses an existing remote repo. Never force push or modify existing repos.
gh repo create $repo --private --source=. --remote=origin --push; Check-Exit
Write-Host "Created and pushed: https://github.com/$repo"
