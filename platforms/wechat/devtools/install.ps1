$ErrorActionPreference='Stop'
$root=(Resolve-Path "$PSScriptRoot/../../..").Path
$out=Join-Path $root '.work/wechat-devtools-051c'
New-Item -ItemType Directory -Force $out | Out-Null
$spec=Get-Content "$PSScriptRoot/installer.json" -Raw | ConvertFrom-Json
$r=[ordered]@{version=$spec.version;downloaded=$false;hashVerified=$false;signatureVerified=$false;installed=$false;cliPath=$null;error=$null}
try {
  $installer=Join-Path $env:RUNNER_TEMP 'wechat-devtools-051c.exe'
  $dest=Join-Path $env:RUNNER_TEMP 'WeChatDevTools051c'
  if(([uri]$spec.url).Scheme -ne 'https' -or ([uri]$spec.url).Host -ne 'dldir1v6.qq.com'){throw 'Unexpected installer host'}
  & curl.exe --fail --location --retry 2 --connect-timeout 20 --max-time 240 --output $installer $spec.url
  if($LASTEXITCODE -ne 0){throw "Installer download failed ($LASTEXITCODE)"}
  $r.downloaded=$true
  $r.sha256=(Get-FileHash $installer -Algorithm SHA256).Hash
  if($r.sha256 -ne $spec.sha256){throw 'Installer SHA256 mismatch'}
  $r.hashVerified=$true
  $sig=Get-AuthenticodeSignature $installer
  $r.signature=[string]$sig.Status
  $r.publisher=[string]$sig.SignerCertificate.Subject
  if($sig.Status -ne 'Valid' -or $r.publisher -notmatch 'Tencent|腾讯'){throw 'Installer publisher signature not verified'}
  $r.signatureVerified=$true
  $p=Start-Process -FilePath $installer -ArgumentList "/S /D=$dest" -PassThru
  if(-not $p.WaitForExit(180000)){Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue;throw 'Silent install timed out'}
  $r.installExitCode=$p.ExitCode
  if($p.ExitCode -ne 0){throw "Silent install failed"}
  $candidates=@($dest,"$env:ProgramFiles\Tencent",(Join-Path ([Environment]::GetEnvironmentVariable('ProgramFiles(x86)')) 'Tencent')) | Where-Object {$_ -and (Test-Path $_)}
  $cli=$candidates | ForEach-Object {Get-ChildItem -Path $_ -Filter cli.bat -File -Recurse -ErrorAction SilentlyContinue} | Select-Object -First 1
  if(-not $cli){throw 'Installed CLI not found'}
  $r.cliPath=$cli.FullName
  $r.installed=$true
  "WECHAT_DEVTOOLS_CLI=$($cli.FullName)" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
} catch {
  $r.error=$_.Exception.Message
  throw
} finally {
  $r | ConvertTo-Json -Depth 6 | Set-Content "$out/install-report.json" -Encoding utf8
  $r | ConvertTo-Json -Depth 6 | Write-Host
}
