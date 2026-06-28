$ErrorActionPreference = 'Stop'

Write-Host "🚀 Booting SyncPTY Installer for Windows..." -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

# Resolve the Version (Dynamic Default vs Explicit Override)
# If the user didn't set $env:VERSION before running the script, fetch it automatically.
if ([string]::IsNullOrWhiteSpace($env:VERSION)) {
    Write-Host "🔍 Querying GitHub for the latest release..." -ForegroundColor Cyan
    try {
        $Releases = Invoke-RestMethod -Uri "https://api.github.com/repos/triloksh07/sync-terminal/releases"
        if ($Releases.Count -eq 0) {
            Write-Host "❌ Error: Failed to fetch the latest version from GitHub." -ForegroundColor Red
            exit 1
        }
        $Version = $Releases[0].tag_name
    } catch {
        Write-Host "❌ Error: Failed to query GitHub API. Check your internet connection." -ForegroundColor Red
        exit 1
    }
} else {
    $Version = $env:VERSION
    Write-Host "🎯 Explicit version requested: $Version" -ForegroundColor Cyan
}

# Construct the versioned filename exactly as GitHub hosts it
$TargetFile = "syncpty-windows-$Version.exe"
$DownloadUrl = "https://github.com/triloksh07/sync-terminal/releases/download/$Version/$TargetFile"

# Define Paths
$InstallDir = "$env:LOCALAPPDATA\SyncPTY"
$FinalExePath = "$InstallDir\syncpty.exe"

# Create the hidden AppData directory if it doesn't exist
if (!(Test-Path $InstallDir)) {
    Write-Host "📁 Creating installation directory..."
    New-Item -ItemType Directory -Path $InstallDir | Out-Null
}

Write-Host "⬇️  Downloading SyncPTY Engine..." -ForegroundColor Cyan
Write-Host "🌐 Source: GitHub Releases ($Version) - Target: $TargetFile" -ForegroundColor Cyan

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