$ErrorActionPreference='Stop'
$root=(Resolve-Path "$PSScriptRoot/../../..").Path
$out=Join-Path $root '.work/wechat-devtools-051c'
$install=Get-Content (Join-Path $out 'install-report.json') -Raw | ConvertFrom-Json
$dir=Split-Path $install.cliPath -Parent
$report=[ordered]@{launcher=$null;profileReady=$false;profileDirectories=@();processId=$null;sessionId=$null;error=$null}
try {
  # Launch the verified installation's real IDE normally. Do not synthesize
  # .cli, user profiles, tokens, service-port settings or login state.
  $exes=@(Get-ChildItem -LiteralPath $dir -File -Filter '*.exe')
  $report.rootExecutables=@($exes | ForEach-Object {$_.Name})
  $launcher=$exes | Where-Object {$_.Name -in @('微信开发者工具.exe','wechatdevtools.exe','微信web开发者工具.exe','wechatwebdevtools.exe')} | Select-Object -First 1
  if(-not $launcher){throw 'Known IDE executable absent; inspect rootExecutables'}
  $report.launcher=$launcher.Name
  $p=Start-Process -FilePath $launcher.FullName -WorkingDirectory $dir -PassThru
  $report.processId=$p.Id
  $report.sessionId=$p.SessionId
  $profiles=@((Join-Path $env:LOCALAPPDATA '微信开发者工具\User Data'),(Join-Path $env:LOCALAPPDATA '微信web开发者工具\User Data'))
  for($i=0;$i -lt 60;$i++){
    $defaults=@(foreach($profile in $profiles){
      if(Test-Path -LiteralPath $profile){
        Get-ChildItem -LiteralPath $profile -Directory -ErrorAction SilentlyContinue | ForEach-Object {
          $candidate=Join-Path $_.FullName 'Default'
          if(Test-Path -LiteralPath $candidate -PathType Container){$candidate}
        }
        $direct=Join-Path $profile 'Default'
        if(Test-Path -LiteralPath $direct -PathType Container){$direct}
      }
    })
    if($defaults.Count -gt 0){$report.profileDirectories=$defaults;$report.profileReady=$true;break}
    Start-Sleep -Seconds 2
  }
  if(-not $report.profileReady){throw 'IDE did not create Default profile within 120 seconds; desktop/session or startup failure'}
  Start-Sleep -Seconds 5
} catch {
  $report.error=$_.Exception.Message
  throw
} finally {
  $report | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $out 'warmup-report.json') -Encoding utf8
  $report | ConvertTo-Json -Depth 6 | Write-Host
}
