# run-phone.ps1 - one-command bootstrap for the PBIVIEWER mobile dev server.
#
# Usage (first time, from any PowerShell window):
#   irm https://raw.githubusercontent.com/BCABC4353/PBIVIEWER/main/run-phone.ps1 | iex
# Usage (after that):
#   powershell -ExecutionPolicy Bypass -File "$HOME\Desktop\PBIVIEWER\run-phone.ps1"
#
# Compatible with Windows PowerShell 5.1. ASCII only. No external tools
# beyond git, node and npm.

$ErrorActionPreference = "Stop"

function Fail {
    param([string]$Message)
    Write-Host ""
    Write-Host "ERROR: $Message" -ForegroundColor Red
    Write-Host "Nothing else was changed. You can close this window." -ForegroundColor Red
    exit 1
}

function Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

# ---------------------------------------------------------------------------
# Step 1: find the repo on the Desktop, or clone it there.
# ---------------------------------------------------------------------------
$RepoUrl = "https://github.com/BCABC4353/PBIVIEWER.git"
$RepoDir = Join-Path "$HOME" "Desktop\PBIVIEWER"

Step "Step 1 of 5: locating the app at `"$RepoDir`""

$GitCmd = Get-Command "git" -ErrorAction SilentlyContinue
if (-not $GitCmd) {
    Fail "git is not installed. Install it from https://git-scm.com/download/win and run this script again."
}

if (Test-Path (Join-Path "$RepoDir" ".git")) {
    Write-Host "    Found existing copy." -ForegroundColor Green
} else {
    Write-Host "    Not found. Downloading a fresh copy (this is normal on first run)..."
    git clone "$RepoUrl" "$RepoDir"
    if ($LASTEXITCODE -ne 0) {
        Fail "Could not download the app from GitHub. Check your internet connection and try again."
    }
    Write-Host "    Downloaded." -ForegroundColor Green
}

Set-Location "$RepoDir"

# ---------------------------------------------------------------------------
# Step 2: make this copy exactly match the latest published version.
# ---------------------------------------------------------------------------
Step "Step 2 of 5: updating to the latest version"

git fetch origin
if ($LASTEXITCODE -ne 0) {
    Fail "Could not check GitHub for updates. Check your internet connection and try again."
}

$Dirty = git status --porcelain
if ($LASTEXITCODE -ne 0) {
    Fail "git could not inspect the folder at `"$RepoDir`". The copy may be damaged; delete the folder and run this script again."
}

if ($Dirty) {
    Write-Host "    Local edits found. They will be DISCARDED so you run the real published version:" -ForegroundColor Yellow
    foreach ($Line in $Dirty) {
        Write-Host "      $Line" -ForegroundColor Yellow
    }
    git reset --hard origin/main
    if ($LASTEXITCODE -ne 0) {
        Fail "Could not reset the app to the published version."
    }
} else {
    git reset --hard origin/main
    if ($LASTEXITCODE -ne 0) {
        Fail "Could not update the app to the published version."
    }
}

$Version = git rev-parse --short HEAD
if ($LASTEXITCODE -ne 0) {
    Fail "Could not read the app version from git."
}
Write-Host "    VERSION PROOF: running commit $Version" -ForegroundColor Green

# ---------------------------------------------------------------------------
# Step 3: free up the ports the dev server needs (8081 / 8082).
# ---------------------------------------------------------------------------
Step "Step 3 of 5: making sure ports 8081 and 8082 are free"

try {
    $Conns = Get-NetTCPConnection -LocalPort 8081, 8082 -State Listen -ErrorAction SilentlyContinue
    if ($Conns) {
        $Pids = $Conns | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($ProcId in $Pids) {
            $Proc = Get-Process -Id $ProcId -ErrorAction SilentlyContinue
            if ($Proc -and $Proc.ProcessName -eq "node") {
                Write-Host "    Stopping old dev server (node, PID $ProcId)..." -ForegroundColor Yellow
                Stop-Process -Id $ProcId -Force -ErrorAction SilentlyContinue
                Write-Host "    Stopped." -ForegroundColor Green
            } elseif ($Proc) {
                Write-Host "    Port in use by '$($Proc.ProcessName)' (PID $ProcId) - not a node process, leaving it alone." -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "    Ports are free." -ForegroundColor Green
    }
} catch {
    Write-Host "    Could not inspect ports (this is OK; continuing): $($_.Exception.Message)" -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# Step 4: install the app's dependencies.
# ---------------------------------------------------------------------------
Step "Step 4 of 5: installing dependencies (first run can take a few minutes)"

$MobileDir = Join-Path "$RepoDir" "mobile"
if (-not (Test-Path "$MobileDir")) {
    Fail "The folder `"$MobileDir`" is missing. The download may be incomplete; delete `"$RepoDir`" and run this script again."
}
Set-Location "$MobileDir"

$NpmCmd = Get-Command "npm" -ErrorAction SilentlyContinue
if (-not $NpmCmd) {
    Fail "Node.js / npm is not installed. Install the LTS version from https://nodejs.org and run this script again."
}

npm ci
if ($LASTEXITCODE -ne 0) {
    Write-Host "    WARNING: 'npm ci' failed; falling back to 'npm install' (slower, less exact)." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Fail "Could not install dependencies. Check your internet connection and try again."
    }
}
Write-Host "    Dependencies installed." -ForegroundColor Green

# ---------------------------------------------------------------------------
# Step 5: prove which Expo SDK is installed, then start the dev server.
# ---------------------------------------------------------------------------
Step "Step 5 of 5: starting the phone dev server"

$ExpoPkgPath = Join-Path "$MobileDir" "node_modules\expo\package.json"
if (Test-Path "$ExpoPkgPath") {
    try {
        $ExpoPkg = Get-Content "$ExpoPkgPath" -Raw | ConvertFrom-Json
        Write-Host "    SDK PROOF: expo $($ExpoPkg.version) is installed" -ForegroundColor Green
    } catch {
        Write-Host "    Could not read the Expo version (continuing anyway)." -ForegroundColor Yellow
    }
} else {
    Fail "Expo is not installed at `"$ExpoPkgPath`" even after installing dependencies."
}

# The dev server is a small web server on THIS computer. The QR code just
# points the phone at it. If the phone cannot reach this computer directly
# (separate office Wi-Fi, guest network, client isolation), tunnel mode
# routes the connection through the internet instead - works from anywhere,
# even cellular, but needs a free Expo account (expo.dev) on first use.
Write-Host ""
Write-Host "    How should your phone connect?" -ForegroundColor Cyan
Write-Host "      [Enter] = same network (phone and this computer share Wi-Fi/LAN)" -ForegroundColor Cyan
Write-Host "      T       = tunnel (phone on a DIFFERENT network or cellular)" -ForegroundColor Cyan
$Mode = Read-Host "    Choice"

Write-Host ""
Write-Host "    A QR code will appear below. Scan it with the Expo Go app on your phone." -ForegroundColor Cyan
Write-Host "    Leave this window open while you use the app. Press Ctrl+C here to stop." -ForegroundColor Cyan
Write-Host ""

if ($Mode -match '^[Tt]') {
    Write-Host "    Tunnel mode: installing the tunnel helper (one-time)..." -ForegroundColor Yellow
    npm install --no-save "@expo/ngrok@^4.1.0"
    if ($LASTEXITCODE -ne 0) {
        Fail "Could not install the tunnel helper. Check your internet connection and try again."
    }
    Write-Host "    If asked to log in, create/use a FREE account at https://expo.dev" -ForegroundColor Yellow
    npx expo start -c --tunnel
} else {
    npx expo start -c
}
if ($LASTEXITCODE -ne 0) {
    Fail "The dev server stopped with an error. Scroll up for details, then run this script again."
}
