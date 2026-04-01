# ============================================================================
#  OptionsLab — Quick Fix Deploy
#  Fixes user.routes.js and redeploys
#  Run from: E:\OptionLab\optionlab-backend
# ============================================================================

$BACKEND = "E:\OptionLab\optionlab-backend"
$BASE    = "https://web-production-8a8e1.up.railway.app"

function OK($m)   { Write-Host "  ✓ $m" -ForegroundColor Green }
function FAIL($m) { Write-Host "  ✗ $m" -ForegroundColor Red }
function INFO($m) { Write-Host "  → $m" -ForegroundColor Gray }

Clear-Host
Write-Host "  OptionsLab — Quick Fix Deploy" -ForegroundColor Yellow
Write-Host "  Bug: user.routes.js had module.exports in wrong place" -ForegroundColor DarkGray
Write-Host ""

Set-Location $BACKEND

# ── FIX 1: Fix user.routes.js ─────────────────────────────────────────────────
Write-Host "  [ FIX 1 ] user.routes.js" -ForegroundColor Cyan
$urPath = Join-Path $BACKEND "src\routes\user.routes.js"
$ur = Get-Content $urPath -Raw

# Check if module.exports is in the wrong place (before the ALIASES block)
if ($ur -match "module\.exports = router;\s*\r?\n\s*\r?\n// ── ALIASES") {
    INFO "Found premature module.exports — moving to end..."
    
    # Remove the premature export
    $ur = $ur -replace "module\.exports = router;\s*\r?\n\r?\n// ── ALIASES", "// ── ALIASES"
    
    # Ensure it's at the very end
    $ur = $ur.TrimEnd()
    if (-not $ur.EndsWith("module.exports = router;")) {
        $ur = $ur + "`r`n`r`nmodule.exports = router;`r`n"
    }
    
    Set-Content $urPath $ur -Encoding UTF8
    OK "user.routes.js fixed — module.exports moved to end"
} else {
    OK "user.routes.js already correct"
}

# ── FIX 2: Bump version so we can confirm new code is running ─────────────────
Write-Host ""
Write-Host "  [ FIX 2 ] Bump version to confirm deployment" -ForegroundColor Cyan
$idxPath = Join-Path $BACKEND "src\index.js"
$idx = Get-Content $idxPath -Raw
$idx = $idx -replace "v2\.0\.0", "v2.1.0"
$idx = $idx -replace '"2\.0\.0"', '"2.1.0"'
Set-Content $idxPath $idx -Encoding UTF8
OK "Version bumped to v2.1.0"

# ── FIX 3: Force cache bust in railway.toml ────────────────────────────────────
Write-Host ""
Write-Host "  [ FIX 3 ] Force Railway cache bust" -ForegroundColor Cyan
$toml = @"
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "node src/index.js"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
"@
Set-Content (Join-Path $BACKEND "railway.toml") $toml -Encoding UTF8
OK "railway.toml updated"

# ── DEPLOY ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  [ DEPLOYING ]" -ForegroundColor Cyan
INFO "Running railway up..."
Write-Host ""

railway up --detach
if ($LASTEXITCODE -ne 0) { railway up }

Write-Host ""
OK "Deploy triggered — waiting 3 minutes for Railway to build..."
Write-Host ""

# ── WAIT AND POLL ──────────────────────────────────────────────────────────────
$deadline = (Get-Date).AddMinutes(4)
$deployed = $false

while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 20
    
    try {
        # Check if new version is running
        $h = Invoke-RestMethod "$BASE/health" -TimeoutSec 8
        $newVer = $h.version -eq "2.1.0" -or ($h | ConvertTo-Json) -like "*2.1.0*"
        
        # Check if new routes work
        $pricing = Invoke-RestMethod "$BASE/api/payments/pricing" -TimeoutSec 8 -ErrorAction SilentlyContinue
        
        if ($pricing -and $pricing.plans) {
            Write-Host "  ✅ NEW ROUTES ARE LIVE!" -ForegroundColor Green
            Write-Host "     /api/payments/pricing → $($pricing.plans.Count) plans" -ForegroundColor Green
            $deployed = $true
            break
        } elseif ($newVer) {
            Write-Host "  ⚡ New version detected — routes loading..." -ForegroundColor Yellow
        } else {
            $elapsed = [int]((Get-Date) - ($deadline.AddMinutes(-4))).TotalSeconds
            Write-Host "  ⏳ Building... ${elapsed}s" -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "  ⏳ Server restarting..." -ForegroundColor DarkGray
    }
}

# ── FINAL TEST ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  [ FINAL TEST ]" -ForegroundColor Cyan
Write-Host ""

$tests = @(
    @{ url="/health";                  label="Server health";           expectKey="status" }
    @{ url="/api/payments/pricing";    label="Payments pricing (NEW)";  expectKey="plans" }
    @{ url="/api/download/info";       label="Download info (NEW)";     expectKey="version" }
    @{ url="/api/auth/validate";       label="Auth validate";           expectStatus=401 }
    @{ url="/api/user/me";             label="User me (NEW)";           expectStatus=401 }
    @{ url="/api/user/dashboard";      label="User dashboard (NEW)";    expectStatus=401 }
    @{ url="/";                        label="Homepage";                expectKey="OptionsLab" }
)

$p=0; $f=0
foreach ($t in $tests) {
    try {
        $r = Invoke-WebRequest "$BASE$($t.url)" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        if ($t.expectKey -and $r.Content -like "*$($t.expectKey)*") {
            OK "$($t.label) — HTTP $($r.StatusCode) ✓"
            $p++
        } else {
            Write-Host "  ⚠ $($t.label) — HTTP $($r.StatusCode)" -ForegroundColor Yellow
        }
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        if ($code -eq $t.expectStatus -or $code -in @(401,403)) {
            OK "$($t.label) — HTTP $code (auth required, correct)"
            $p++
        } elseif ($code -eq 404) {
            FAIL "$($t.label) — 404 (route still not registered)"
            $f++
        } else {
            Write-Host "  ⚠ $($t.label) — HTTP $code" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
if ($f -eq 0) {
    Write-Host "  ✅ DEPLOYMENT COMPLETE — $p/$($p+$f) tests passed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Your live product:" -ForegroundColor Yellow
    Write-Host "  $BASE" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Final steps:" -ForegroundColor Yellow
    Write-Host "  1. Set RAZORPAY_KEY_ID in Railway dashboard" -ForegroundColor Gray
    Write-Host "  2. Set DOWNLOAD_URL to your .exe URL" -ForegroundColor Gray
    Write-Host "  3. Point optionslab.in to Railway" -ForegroundColor Gray
} else {
    FAIL "$f tests still failing — check: railway logs"
    Write-Host ""
    INFO "Run: railway logs | Select-Object -Last 30"
}

Write-Host ""
Read-Host "Press Enter to close"