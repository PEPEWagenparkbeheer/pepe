# PEPE BREIN add-in installeren via Exchange Online
# Voer uit als: powershell -ExecutionPolicy Bypass -File install-addin.ps1

# Stap 1: kapotte OneDrive-module definitief uitschakelen (hernoemen)
Write-Host "Kapotte OneDrive-module uitschakelen..." -ForegroundColor Cyan
$oneDriveModules = Get-ChildItem "$env:USERPROFILE" -Filter "OneDrive*" -Directory -ErrorAction SilentlyContinue |
    ForEach-Object {
        Get-ChildItem "$($_.FullName)" -Filter "WindowsPowerShell" -Recurse -Directory -ErrorAction SilentlyContinue
    } | ForEach-Object {
        Get-ChildItem "$($_.FullName)\Modules\ExchangeOnlineManagement" -Directory -ErrorAction SilentlyContinue
    }

foreach ($mod in $oneDriveModules) {
    $disabled = "$($mod.Parent.FullName)\ExchangeOnlineManagement_disabled"
    if (Test-Path $mod.FullName) {
        Write-Host "  Uitschakelen: $($mod.FullName)" -ForegroundColor Yellow
        Rename-Item -Path $mod.FullName -NewName "ExchangeOnlineManagement_disabled" -Force -ErrorAction SilentlyContinue
    }
}

# Stap 2: OneDrive ook uit PSModulePath verwijderen
$env:PSModulePath = ($env:PSModulePath -split ';' | Where-Object {
    $_ -notlike '*OneDrive*' -and $_ -notlike '*Documenten*'
}) -join ';'

# Stap 3: schone installatie naar C:\Program Files
Write-Host "Module installeren naar Program Files..." -ForegroundColor Cyan
Install-Module ExchangeOnlineManagement -Scope AllUsers -Force -AllowClobber -Repository PSGallery
Import-Module ExchangeOnlineManagement -Force
Write-Host "Module geladen!" -ForegroundColor Green

# Stap 4: verbinding en add-in installeren
Connect-ExchangeOnline -UserPrincipalName joep@pepewagenparkbeheer.nl

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
