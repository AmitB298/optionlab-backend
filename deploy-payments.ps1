# deploy-payments.ps1
#
# Copies migration + updated route into your project,
# runs the migration against Railway, then commits + pushes.
#
# Run from E:\OptionLab\optionlab-backend\
#   .\deploy-payments.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT  = "E:\OptionLab\optionlab-backend"
$STAMP = (Get-Date -Format 'yyyyMMdd_HHmmss')

function Ok($msg)   { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  ✗ FAILED: $msg" -ForegroundColor Red }
function Info($msg) { Write-Host "  → $msg" -ForegroundColor Cyan }

Set-Location $ROOT

# ── 1. Create migrations folder if it doesn't exist ──────────
if (-not (Test-Path "$ROOT\migrations")) {
  New-Item -ItemType Directory -Path "$ROOT\migrations" | Out-Null
  Ok "Created migrations/ folder"
}

# ── 2. Check files exist (they should be in the same folder as this script) ──
$sqlSrc   = "$ROOT\003_payments_orders.sql"
$routeSrc = "$ROOT\payments.routes.new.js"

foreach ($f in @($sqlSrc, $routeSrc)) {
  if (-not (Test-Path $f)) {
    Write-Host "Missing file: $f" -ForegroundColor Red
    Write-Host "Make sure 003_payments_orders.sql and payments.routes.new.js are in $ROOT" -ForegroundColor Yellow
    exit 1
  }
}

# ── 3. Backup existing payments route ─────────────────────────
$routeDest = "$ROOT\src\routes\payments.routes.js"
if (Test-Path $routeDest) {
  Copy-Item $routeDest "$routeDest.bak_$STAMP"
  Ok "Backed up payments.routes.js → payments.routes.js.bak_$STAMP"
}

# ── 4. Copy migration SQL ──────────────────────────────────────
Copy-Item $sqlSrc "$ROOT\migrations\003_payments_orders.sql" -Force
Ok "Copied 003_payments_orders.sql → migrations/"

# ── 5. Copy updated payments route ────────────────────────────
Copy-Item $routeSrc $routeDest -Force
Ok "Copied payments.routes.new.js → src/routes/payments.routes.js"

# ── 6. Copy migrate.js if it doesn't already exist ────────────
$migrateScriptSrc  = "$ROOT\migrate.runner.js"
$migrateScriptDest = "$ROOT\scripts\migrate.js"
if (Test-Path $migrateScriptSrc) {
  if (-not (Test-Path "$ROOT\scripts")) {
    New-Item -ItemType Directory -Path "$ROOT\scripts" | Out-Null
  }
  Copy-Item $migrateScriptSrc $migrateScriptDest -Force
  Ok "Copied migrate.js → scripts/migrate.js"
} else {
  Info "migrate.runner.js not found — skipping (scripts/migrate.js unchanged)"
}

# ── 7. Install razorpay npm package if missing ────────────────
$pkgJson = Get-Content "$ROOT\package.json" | ConvertFrom-Json
if (-not $pkgJson.dependencies.razorpay) {
  Info "Installing razorpay npm package..."
  npm install razorpay --save 2>&1 | Out-Null
  Ok "razorpay installed"
} else {
  Ok "razorpay already in package.json"
}

# ── 8. Run migration against Railway DB ───────────────────────
Info "Running migration 003 against Railway DB..."
$dbUrl = $env:DATABASE_URL
if (-not $dbUrl) {
  Write-Host ""
  Write-Host "  DATABASE_URL not set in this shell." -ForegroundColor Yellow
  Write-Host "  To run the migration now, go to Railway → Postgres → Query tab" -ForegroundColor Yellow
  Write-Host "  and paste the contents of migrations/003_payments_orders.sql" -ForegroundColor Yellow
  Write-Host "  (The file is ready at: $ROOT\migrations\003_payments_orders.sql)" -ForegroundColor Yellow
} else {
  node scripts/migrate.js
  Ok "Migration applied"
}

# ── 9. Verify key strings in the new route ────────────────────
Write-Host ""
Write-Host "── Verification ──────────────────────────────────────────" -ForegroundColor DarkGray
$content = [System.IO.File]::ReadAllText($routeDest)

$checks = @{
  "PLANS catalogue"          = "const PLANS ="
  "create-order route"       = "router.post('/create-order'"
  "verify route"             = "router.post('/verify'"
  "webhook route"            = "router.post('/webhook'"
  "history route"            = "router.get('/history'"
  "receipt route"            = "router.get('/receipt/"
  "signature verification"   = "verifySignature"
  "orders table insert"      = "INSERT INTO orders"
  "payments table insert"    = "INSERT INTO payments"
  "plan upgrade"             = "UPDATE users"
  "refund handler"           = "refund.created"
  "subscription_history compat" = "subscription_history"
}

$allOk = $true
foreach ($name in $checks.Keys) {
  if ($content.Contains($checks[$name])) {
    Ok $name
  } else {
    Fail $name
    $allOk = $false
  }
}

Write-Host ""
if (-not $allOk) {
  Write-Host "  ❌ Some checks failed. Restoring backup..." -ForegroundColor Red
  if (Test-Path "$routeDest.bak_$STAMP") {
    Copy-Item "$routeDest.bak_$STAMP" $routeDest -Force
    Write-Host "  ✓ Backup restored." -ForegroundColor Yellow
  }
  exit 1
}

# ── 10. Git commit + push ─────────────────────────────────────
Write-Host ""
Write-Host "✅ All checks passed." -ForegroundColor Green
Write-Host ""
Write-Host "Run these commands to deploy:" -ForegroundColor Cyan
Write-Host "  git add migrations/003_payments_orders.sql src/routes/payments.routes.js"
Write-Host "  git commit -m 'feat: dedicated orders/payments tables + full payment ledger'"
Write-Host "  git push"
Write-Host ""
Write-Host "Then in Railway → Postgres → Query, run:" -ForegroundColor Cyan
Write-Host "  migrations/003_payments_orders.sql"
Write-Host "(paste the file contents into the Query tab)"
