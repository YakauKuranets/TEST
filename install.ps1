# ═══════════════════════════════════════════════════════════════
# PLAYE Studio Pro v3.0 — Installer (D: drive)
# ═══════════════════════════════════════════════════════════════

param(
    [ValidateSet("lite","standard","full")]
    [string]$Profile = ""
)

$ErrorActionPreference = "Continue"

# Установка кодировки для вывода в консоль, чтобы не было кракозябр
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host ""
Write-Host "  [INIT] PLAYE Studio Pro v3.0 Installer" -ForegroundColor Cyan
Write-Host "  [INIT] Python 3.12 | Drive D:" -ForegroundColor Cyan

# ── ВЫБОР ПРОФИЛЯ ──
if (-not $Profile) {
    Write-Host ""
    Write-Host "  Select Installation Profile:" -ForegroundColor Yellow
    Write-Host "  [1] LITE     - Weak PC (4-8GB RAM, No GPU)" -ForegroundColor Gray
    Write-Host "  [2] STANDARD - Medium PC (16GB RAM, GTX 1060+)" -ForegroundColor White
    Write-Host "  [3] FULL     - Powerful PC (32GB RAM, RTX 3060+)" -ForegroundColor Green
    Write-Host ""

    $choice = Read-Host "  Your choice (1/2/3)"
    switch ($choice) {
        "1" { $Profile = "lite" }
        "3" { $Profile = "full" }
        default { $Profile = "standard" }
    }
}

$reqFile = switch ($Profile) {
    "lite"     { "backend/requirements-lite.txt" }
    "full"     { "backend/requirements-full.txt" }
    default    { "backend/requirements.txt" }
}

Write-Host ""
Write-Host "  Active Profile: $($Profile.ToUpper())" -ForegroundColor Green

# ── 0. ПЕРЕМЕННЫЕ D: DRIVE ──
$dirs = @("D:\PLAYE\.cache\pip","D:\PLAYE\.cache\npm","D:\PLAYE\.cache\torch","D:\PLAYE\.cache\huggingface","D:\PLAYE\temp","D:\PLAYE\models")
foreach ($d in $dirs) { if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null } }

# ── 2. PYTHON + VENV ──
$venvPath = "D:\PLAYE\venv"
$pip = "$venvPath\Scripts\pip.exe"
$python = "$venvPath\Scripts\python.exe"

if (-not (Test-Path $pip)) {
    Write-Host "[2/8] Creating venv..." -ForegroundColor Yellow
    & python -m venv $venvPath
}
$pyVer = & $python --version 2>&1
Write-Host "  Using: $pyVer" -ForegroundColor Green

# ── 4. PYTORCH (Чистая установка без лишних скобок) ──
Write-Host "[4/8] Installing PyTorch..." -ForegroundColor Yellow
if ($Profile -eq "lite") {
    & $pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu --quiet
} else {
    & $pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124 --quiet
}

# ── 5. REQUIREMENTS ──
Write-Host "[5/8] Dependencies..." -ForegroundColor Yellow
if (Test-Path $reqFile) {
    & $pip install -r $reqFile --quiet
} else {
    Write-Host "  Warning: $reqFile not found, skipping." -ForegroundColor Yellow
}

# ── 6. FACE RESTORATION ──
if ($Profile -ne "lite") {
    Write-Host "[6/8] AI Models Setup..." -ForegroundColor Yellow
    & $pip install basicsr==1.4.2 facexlib gfpgan==1.3.8 realesrgan==0.3.0 --no-deps --quiet
}

# ── 8. NPM ──
Write-Host "[8/8] Node.js Modules..." -ForegroundColor Yellow
& npm install --quiet

# ── VERIFICATION ──
Write-Host ""
Write-Host "  === VERIFICATION ===" -ForegroundColor Cyan
$testCmd = "import torch; print(f'Torch OK (CUDA: {torch.cuda.is_available()})')"
$r = & $python -c $testCmd 2>&1
Write-Host "  $r" -ForegroundColor Green

Write-Host ""
Write-Host "  DONE! Run 'npm run dev' to start." -ForegroundColor Green
