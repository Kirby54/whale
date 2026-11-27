# Regenerates the README screenshots in docs/screenshots with headless Microsoft Edge.
# Requires a local web server at the repo's parent folder, e.g.:  python -m http.server 5173
# Usage: powershell -File tools/screenshots.ps1 [-Base http://localhost:5173/whale]
param([string]$Base = "http://localhost:5173/whale")

$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw "Microsoft Edge not found" }

$out = Join-Path $PSScriptRoot "..\docs\screenshots"
New-Item -ItemType Directory -Force $out | Out-Null
$profileDir = Join-Path $env:TEMP "whale-shots-profile"
# a fresh profile each run, so Edge never serves an older copy of the app from its cache
if (Test-Path $profileDir) { Remove-Item -Recurse -Force $profileDir }

foreach ($shot in "brain", "brain-full", "editor", "dashboard", "table", "palette", "setups", "analysis") {
  $file = Join-Path (Resolve-Path $out) "$shot.png"
  & $edge --headless=new --disable-gpu-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader `
    --user-data-dir="$profileDir" --hide-scrollbars --window-size=1440,880 --force-device-scale-factor=1.5 `
    --virtual-time-budget=9000 --screenshot="$file" "$Base/tools/shots.html?shot=$shot" 2>$null | Out-Null
  Write-Output "$shot -> $file"
}
