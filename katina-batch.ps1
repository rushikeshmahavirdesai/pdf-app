# Same PDF styling as CLI (pdf-render print CSS + DOM cleanup).

Set-StrictMode -Version Latest
Set-Location $PSScriptRoot

& node .\generate-katina-pdf.mjs --file .\katina-urls.txt --headed
