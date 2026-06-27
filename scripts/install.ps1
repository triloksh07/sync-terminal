$ErrorActionPreference = 'Stop'

Write-Host "🚀 Booting SyncPTY Extraction Installer for Windows..." -ForegroundColor Cyan

# Define Paths
$InstallDir = "$env:LOCALAPPDATA\SyncPTY"
$FinalExePath = "$InstallDir\syncpty.exe"
$TempZip = "$env:TEMP\syncpty-windows.zip"
$TempExtractDir = "$env:TEMP\syncpty-extract"

# Point this to your local Python server hosting the .zip
$DownloadUrl = "http://0.0.0.0:8000/syncpty-windows.zip"

# Create the hidden AppData directory if it doesn't exist
if (!(Test-Path $InstallDir)) {
    Write-Host "📁 Creating installation directory..."
    New-Item -ItemType Directory -Path $InstallDir | Out-Null
}

# Download the ZIP Archive
Write-Host "⬇️ Downloading zipped payload from $DownloadUrl..."
Invoke-WebRequest -Uri $DownloadUrl -OutFile $TempZip

# Extract the Archive
Write-Host "📦 Extracting payload..."
if (Test-Path $TempExtractDir) { Remove-Item -Recurse -Force $TempExtractDir }
Expand-Archive -Path $TempZip -DestinationPath $TempExtractDir -Force

# Move the Executable
# Assuming the binary inside the zip is named 'syncpty-windows.exe'
Move-Item -Path "$TempExtractDir\syncpty-windows.exe" -Destination $FinalExePath -Force

# Clean Up Temporary Files
Remove-Item -Path $TempZip -Force
Remove-Item -Recurse -Force $TempExtractDir

# Inject into the Windows PATH (User Level)
$UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($UserPath -notmatch [regex]::Escape($InstallDir)) {
    Write-Host "🔧 Wiring SyncPTY into system PATH..."
    $NewPath = "$UserPath;$InstallDir"
    [Environment]::SetEnvironmentVariable("PATH", $NewPath, "User")
}

Write-Host "=======================================" -ForegroundColor Green
Write-Host "✅ SyncPTY installed successfully!" -ForegroundColor Green
Write-Host "⚠️ IMPORTANT: Restart your terminal, then type 'syncpty' to begin." -ForegroundColor Yellow
Write-Host "=======================================" -ForegroundColor Green