# PEPE BREIN add-in installeren via Exchange Online
# Voer uit als: powershell -ExecutionPolicy Bypass -File install-addin.ps1

# Stap 1: OneDrive uit de module-zoekpaden verwijderen (dit is de root cause)
Write-Host "PSModulePath opschonen (OneDrive verwijderen)..." -ForegroundColor Cyan
$env:PSModulePath = ($env:PSModulePath -split ';' | Where-Object {
    $_ -notlike '*OneDrive*' -and $_ -notlike '*Documenten*'
}) -join ';'

# Stap 2: module installeren naar C:\Program Files (NIET OneDrive)
$allUsersPath = "C:\Program Files\WindowsPowerShell\Modules"
Write-Host "Module installeren naar $allUsersPath ..." -ForegroundColor Cyan
if ($env:PSModulePath -notlike "*$allUsersPath*") {
    $env:PSModulePath = "$allUsersPath;" + $env:PSModulePath
}

Install-Module ExchangeOnlineManagement -Scope AllUsers -Force -AllowClobber -Repository PSGallery
Import-Module ExchangeOnlineManagement -Force
Write-Host "Module geladen!" -ForegroundColor Green

# Stap 3: verbinding maken
Connect-ExchangeOnline -UserPrincipalName joep@pepewagenparkbeheer.nl

# Stap 4: add-in installeren via URL (manifest staat live op Vercel)
Write-Host "Add-in installeren..." -ForegroundColor Cyan
try {
    New-App -Mailbox "joep@pepewagenparkbeheer.nl" `
            -FileUrl "https://flow.pepewagenparkbeheer.nl/manifest.xml" `
            -AllowWriteAccess
    Write-Host "PEPE BREIN succesvol geinstalleerd!" -ForegroundColor Green
} catch {
    Write-Host "Fout: $_" -ForegroundColor Red
}

Disconnect-ExchangeOnline -Confirm:$false
