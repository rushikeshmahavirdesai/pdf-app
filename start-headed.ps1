# Katina Magazine (Cloudflare): visible Chromium so you can complete the bot check once.
Set-Location $PSScriptRoot
$env:PDF_HEADED = "1"
node server.mjs
