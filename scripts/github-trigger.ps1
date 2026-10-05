$ErrorActionPreference = "Stop"

$repo = "https://github.com/braininking/oferta-bot.git"
$work = Join-Path $env:TEMP "ofertabot-github-trigger"

if (-not (Test-Path (Join-Path $work ".git"))) {
  if (Test-Path $work) {
    Remove-Item $work -Recurse -Force
  }

  git clone --filter=blob:none --no-checkout $repo $work
}

Set-Location $work

git fetch origin main
git checkout -B main origin/main

$heartbeat = Join-Path $work "data\scheduler-heartbeat.txt"
$stamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
Set-Content -Path $heartbeat -Value $stamp -Encoding utf8

git add data/scheduler-heartbeat.txt

if (git diff --cached --quiet) {
  exit 0
}

git config user.name "OfertaBot Scheduler"
git config user.email "41898282+ofertabot-scheduler@users.noreply.github.com"

git commit -m "chore: acionar garimpo automático"
git push origin HEAD:main
