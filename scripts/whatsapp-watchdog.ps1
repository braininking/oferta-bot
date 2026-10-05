$ErrorActionPreference = "Continue"

$root = "C:\OfertaBot"
$bridgeScript = Join-Path $root "src\whatsapp-bridge.js"
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source

$chromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe"
)

$chrome = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

while ($true) {
  $cdpOk = $false

  try {
    $version = Invoke-RestMethod "http://127.0.0.1:9222/json/version" -TimeoutSec 3
    $cdpOk = [bool]$version.Browser
  } catch {
    $cdpOk = $false
  }

  if (-not $cdpOk -and $chrome -and -not (Get-Process chrome -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $chrome -ArgumentList @(
      "--remote-debugging-port=9222",
      "--profile-directory=Default",
      "https://web.whatsapp.com/"
    ) -WindowStyle Minimized

    Start-Sleep -Seconds 8
  }

  $running = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -eq "node.exe" -and
      $_.CommandLine -like "*OfertaBot*src*whatsapp-bridge.js*"
    }

  if (-not $running -and $node) {
    Start-Process -FilePath $node -ArgumentList $bridgeScript -WorkingDirectory $root -WindowStyle Hidden
    Start-Sleep -Seconds 10
  }

  Start-Sleep -Seconds 30
}
