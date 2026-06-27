$ErrorActionPreference = 'Stop'

Write-Host "🚀 Booting SyncPTY Installer for Windows..." -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

# Define the Single Source of Truth
$Version = "v0.0.1-alpha.2"
$DownloadUrl = "https://github.com/triloksh07/sync-terminal/releases/download/$Version/syncpty-windows.exe"

# Define Paths
$InstallDir = "$env:LOCALAPPDATA\SyncPTY"
$FinalExePath = "$InstallDir\syncpty.exe"

# Create the hidden AppData directory if it doesn't exist
if (!(Test-Path $InstallDir)) {
    Write-Host "📁 Creating installation directory..."
    New-Item -ItemType Directory -Path $InstallDir | Out-Null
}

Write-Host "⬇️  Downloading SyncPTY Engine..."
Write-Host "🌐 Source: GitHub Releases ($Version)"

# Download the executable directly. (PowerShell native Invoke-WebRequest includes a progress bar by default)
Invoke-WebRequest -Uri $DownloadUrl -OutFile $FinalExePath

# Inject into the Windows PATH (User Level)
$UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($UserPath -notmatch [regex]::Escape($InstallDir)) {
    Write-Host "🔧 Wiring SyncPTY into system PATH..."
    $NewPath = "$UserPath;$InstallDir"
    [Environment]::SetEnvironmentVariable("PATH", $NewPath, "User")
}

Write-Host ""
Write-Host "=======================================" -ForegroundColor Green
Write-Host "✅ SyncPTY installed successfully!" -ForegroundColor Green
Write-Host "🔥 IMPORTANT: Restart your terminal, then type 'syncpty' to begin." -ForegroundColor Yellow
Write-Host "=======================================" -ForegroundColor Green