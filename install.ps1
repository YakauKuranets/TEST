# ═══════════════════════════════════════════════════════════════
# PLAYE Studio Pro v3.0 — Full Install (Python 3.12, D: drive)
#
#   Set-ExecutionPolicy -Scope Process Bypass
#   cd D:\PLAYE\PLAYE_Studio
#   .\install.ps1
# ═══════════════════════════════════════════════════════════════

Write-Host "`n=== PLAYE Studio Pro v3.0 Installer ===" -ForegroundColor Cyan
Write-Host "Python 3.12 | All AI models | D: drive`n" -ForegroundColor Gray

# ── 0. Cache on D: ──
$env:PIP_CACHE_DIR       = "D:\PLAYE\.cache\pip"
$env:npm_config_cache    = "D:\PLAYE\.cache\npm"
$env:TORCH_HOME          = "D:\PLAYE\.cache\torch"
$env:HF_HOME             = "D:\PLAYE\.cache\huggingface"
$env:TRANSFORMERS_CACHE  = "D:\PLAYE\.cache\huggingface"
$env:TEMP                = "D:\PLAYE\temp"
$env:TMP                 = "D:\PLAYE\temp"
$env:PLAYE_MODELS_DIR    = "D:\PLAYE\models"

foreach ($d in @("D:\PLAYE\.cache\pip","D:\PLAYE\.cache\npm","D:\PLAYE\.cache\torch","D:\PLAYE\.cache\huggingface","D:\PLAYE\temp","D:\PLAYE\models")) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

# ── 1. Clean pycache ──
Write-Host "[1/9] Cleaning __pycache__..." -ForegroundColor Yellow
Get-ChildItem -Path . -Include __pycache__ -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
Get-ChildItem -Path . -Include *.pyc -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Force
Write-Host "[OK]" -ForegroundColor Green

# ── 2. Venv ──
$venvPath = "D:\PLAYE\venv"
$pip = "$venvPath\Scripts\pip.exe"
$python = "$venvPath\Scripts\python.exe"

if (-not (Test-Path $pip)) {
    Write-Host "`n[2/9] Creating venv..." -ForegroundColor Yellow
    $created = $false
    foreach ($cmd in @("py -3.12","py -3.11","python")) {
        try {
            $parts = $cmd -split " "
            if ($parts.Count -eq 1) { & $parts[0] -m venv $venvPath 2>$null }
            else { & $parts[0] $parts[1] -m venv $venvPath 2>$null }
            if ($LASTEXITCODE -eq 0 -and (Test-Path $pip)) { $created = $true; break }
        } catch {}
    }
    if (-not $created) {
        Write-Host "[FAIL] Python 3.12 not found! Download: https://www.python.org/downloads/" -ForegroundColor Red
        exit 1
    }
} else { Write-Host "[2/9] Venv exists" -ForegroundColor Green }
$pyVer = & $python --version 2>&1
Write-Host "[OK] $pyVer" -ForegroundColor Green

# ── 3. pip upgrade ──
Write-Host "`n[3/9] pip upgrade..." -ForegroundColor Yellow
& $pip install -q --upgrade pip setuptools wheel 2>&1 | Out-Null
Write-Host "[OK]" -ForegroundColor Green

# ── 4. Base packages ──
Write-Host "`n[4/9] numpy + Pillow + opencv..." -ForegroundColor Yellow
& $pip install -q "numpy>=1.26,<2.2" "Pillow>=11.1,<12" "opencv-python-headless>=4.10,<4.12" "scipy>=1.14,<1.16" 2>&1 | Out-Null
Write-Host "[OK]" -ForegroundColor Green

# ── 5. PyTorch ──
Write-Host "`n[5/9] PyTorch 2.6+ (CPU default)..." -ForegroundColor Yellow
Write-Host "  GPU: pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126" -ForegroundColor DarkGray
& $pip install -q "torch>=2.6,<2.8" "torchvision>=0.21,<0.23" 2>&1 | Out-Null
Write-Host "[OK]" -ForegroundColor Green

# ── 6. FastAPI + core ──
Write-Host "`n[6/9] FastAPI + dependencies..." -ForegroundColor Yellow
& $pip install -q "fastapi>=0.115,<0.116" "uvicorn[standard]>=0.34,<0.35" "python-multipart>=0.0.18" `
    "pydantic>=2.10,<3" "pydantic-settings>=2.7,<3" `
    "onnxruntime>=1.20,<1.22" `
    "requests>=2.32,<3" "tqdm>=4.67,<5" "ffmpeg-python>=0.2,<0.3" `
    "bcrypt>=4.2,<5" "python-jose>=3.3,<4" `
    "lmdb>=1.5,<2" "addict>=2.4,<3" "yapf>=0.43,<1" `
    "prometheus-fastapi-instrumentator>=7.0,<8" 2>&1 | Out-Null
Write-Host "[OK]" -ForegroundColor Green

# ── 7. Face restoration (--no-deps!) ──
Write-Host "`n[7/9] basicsr + gfpgan + realesrgan (--no-deps)..." -ForegroundColor Yellow
& $pip install -q "basicsr==1.4.2" --no-deps 2>&1 | Out-Null
& $pip install -q "facexlib>=0.3.0" --no-deps 2>&1 | Out-Null
& $pip install -q "gfpgan==1.3.8" --no-deps 2>&1 | Out-Null
& $pip install -q "realesrgan==0.3.0" --no-deps 2>&1 | Out-Null
& $pip install -q "ultralytics>=8.3,<8.5" 2>&1 | Out-Null
Write-Host "[OK]" -ForegroundColor Green

# ── 8. Diffusers + AI ──
Write-Host "`n[8/9] diffusers + transformers + easyocr + insightface..." -ForegroundColor Yellow
& $pip install -q "diffusers>=0.32,<0.34" "transformers>=4.48,<4.50" "accelerate>=0.36,<0.38" "safetensors>=0.5,<1.0" 2>&1 | Out-Null
& $pip install -q "easyocr>=1.7,<1.8" 2>&1 | Out-Null
& $pip install -q "insightface>=0.7.3" --prefer-binary 2>&1 | Out-Null
& $pip install -q "open3d>=0.18,<0.19" 2>&1 | Out-Null

# PaddleOCR (optional, best OCR)
& $pip install -q "paddlepaddle>=3.0,<3.2" 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) { & $pip install -q "paddleocr>=3.1,<3.3" 2>&1 | Out-Null }

# Force headless opencv (remove GUI version if pulled by deps)
& $pip install -q --force-reinstall --no-deps "opencv-python-headless>=4.10,<4.12" 2>&1 | Out-Null
Write-Host "[OK]" -ForegroundColor Green

# ── 9. Symlink + npm ──
Write-Host "`n[9/9] Symlink + npm..." -ForegroundColor Yellow
$backendVenv = ".\backend\.venv"
if (Test-Path $backendVenv) { Remove-Item $backendVenv -Recurse -Force -ErrorAction SilentlyContinue }
try { New-Item -ItemType SymbolicLink -Path $backendVenv -Target $venvPath -ErrorAction Stop | Out-Null; Write-Host "  symlink OK" -ForegroundColor Green }
catch { Write-Host "  symlink: run as Admin" -ForegroundColor Yellow }
& npm install 2>&1 | Out-Null
Write-Host "[OK]" -ForegroundColor Green

# ── Save env vars permanently ──
[Environment]::SetEnvironmentVariable("PIP_CACHE_DIR",     "D:\PLAYE\.cache\pip",         "User")
[Environment]::SetEnvironmentVariable("TORCH_HOME",        "D:\PLAYE\.cache\torch",       "User")
[Environment]::SetEnvironmentVariable("HF_HOME",           "D:\PLAYE\.cache\huggingface", "User")
[Environment]::SetEnvironmentVariable("PLAYE_MODELS_DIR",  "D:\PLAYE\models",             "User")

# ── Verify ──
Write-Host "`n=== VERIFICATION ===" -ForegroundColor Cyan
foreach ($c in @(
    @("torch",       "import torch; print(f'torch {torch.__version__}')"),
    @("numpy",       "import numpy; print(f'numpy {numpy.__version__}')"),
    @("fastapi",     "import fastapi; print(f'fastapi {fastapi.__version__}')"),
    @("opencv",      "import cv2; print(f'opencv {cv2.__version__}')"),
    @("Pillow",      "import PIL; print(f'Pillow {PIL.__version__}')"),
    @("ultralytics", "import ultralytics; print(f'ultralytics {ultralytics.__version__}')"),
    @("basicsr",     "import basicsr; print(f'basicsr {basicsr.__version__}')"),
    @("diffusers",   "import diffusers; print(f'diffusers {diffusers.__version__}')"),
    @("transformers","import transformers; print(f'transformers {transformers.__version__}')"),
    @("easyocr",     "import easyocr; print('easyocr OK')"),
    @("insightface", "import insightface; print('insightface OK')"),
    @("open3d",      "import open3d; print(f'open3d {open3d.__version__}')")
)) {
    $r = & $python -c $c[1] 2>&1
    if ($LASTEXITCODE -eq 0) { Write-Host "  OK $r" -ForegroundColor Green }
    else { Write-Host "  -- $($c[0]) (optional)" -ForegroundColor DarkGray }
}

Write-Host "`n=== DONE ===" -ForegroundColor Green
Write-Host "Run:  npm run dev" -ForegroundColor Yellow
Write-Host "Or:   D:\PLAYE\venv\Scripts\Activate.ps1" -ForegroundColor DarkGray
Write-Host "      cd backend && python -m uvicorn app.main:app --port 8000`n" -ForegroundColor DarkGray
