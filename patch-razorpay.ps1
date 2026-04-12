# ============================================================
# patch-razorpay.ps1  v2
# Wires Razorpay checkout into public/index.html
#
# Changes:
#   1. Adds Razorpay checkout.js before </head>
#   2. PRO button  → startCheckout('monthly')
#   3. ELITE button → startCheckout('annual')
#   4. Inserts full startCheckout() JS before last </script>
#   5. Verifies all changes — auto-restores backup on failure
#
# Run from: E:\OptionLab\optionlab-backend
# ============================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$file   = "$PWD\public\index.html"
$backup = "$PWD\public\index.html.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

# ── Safety check ─────────────────────────────────────────────────────────
if (-not (Test-Path $file)) {
    Write-Error "ERROR: $file not found. Run from E:\OptionLab\optionlab-backend"
    exit 1
}

# ── Backup ────────────────────────────────────────────────────────────────
Copy-Item $file $backup
Write-Host "✓ Backup: $backup" -ForegroundColor Cyan

# ── Read as UTF8 string ───────────────────────────────────────────────────
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

# ── 1. Razorpay script tag ────────────────────────────────────────────────
$rzpTag = '<script src="https://checkout.razorpay.com/v1/checkout.js"></script>'
if ($content.Contains($rzpTag)) {
    Write-Host "⊘ Razorpay script tag already present" -ForegroundColor Yellow
} else {
    $content = $content.Replace('</head>', "$rzpTag`n</head>")
    Write-Host "✓ Added Razorpay checkout.js" -ForegroundColor Green
}

# ── 2. PRO button — regex replace to handle any quote style ──────────────
$content = [regex]::Replace($content,
    '(?s)(class="price-cta pro-cta" onclick=")window\.location\.href=''\/register\.html''(")',
    { "class=""price-cta pro-cta"" onclick=""startCheckout('monthly')""" })

# ── 3. ELITE button — regex replace ──────────────────────────────────────
$content = [regex]::Replace($content,
    '(?s)(class="price-cta elite-cta" onclick=")window\.location\.href=''\/register\.html''(")',
    { "class=""price-cta elite-cta"" onclick=""startCheckout('annual')""" })

Write-Host "✓ Replaced PRO and ELITE buttons" -ForegroundColor Green

# ── 4. Insert startCheckout() before last </script> ───────────────────────
$checkoutJS = @'

  // ── Razorpay Checkout ────────────────────────────────────────────────
  async function startCheckout(planType) {
    try {
      var res = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan_type: planType })
      });
      var data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          aToast('Please sign in to upgrade', 'er');
          setTimeout(function(){ window.location.href='/register.html'; }, 1200);
          return;
        }
        aToast(data.error || 'Could not start payment', 'er');
        return;
      }
      var options = {
        key:         data.key_id,
        amount:      data.amount,
        currency:    'INR',
        name:        'OptionsLab',
        description: data.plan_label,
        order_id:    data.order_id,
        prefill: {
          name:    data.user_name  || '',
          email:   data.user_email || '',
          contact: data.user_mobile || ''
        },
        theme: { color: '#ff9933' },
        modal: {
          ondismiss: function() { aToast('Payment cancelled', 'in'); }
        },
        handler: async function(response) {
          aToast('Verifying payment...', 'in');
          try {
            var vRes = await fetch('/api/payments/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                razorpay_order_id:   response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature:  response.razorpay_signature,
                plan_type:           planType
              })
            });
            var vData = await vRes.json();
            if (vData.success) {
              aToast('Payment successful! Welcome to Pro', 'ok');
              setTimeout(function(){ window.location.reload(); }, 1800);
            } else {
              aToast(vData.error || 'Verification failed. Contact support.', 'er');
            }
          } catch(ve) { aToast('Verification error: ' + ve.message, 'er'); }
        }
      };
      var rzp = new Razorpay(options);
      rzp.on('payment.failed', function(resp){
        aToast('Payment failed: ' + (resp.error.description || 'Unknown error'), 'er');
      });
      rzp.open();
    } catch(e) { aToast('Payment error: ' + e.message, 'er'); }
  }
  // ── End Razorpay Checkout ─────────────────────────────────────────────

'@

$lastIdx = $content.LastIndexOf('</script>')
if ($lastIdx -eq -1) {
    Write-Error "Could not find </script> tag"
    Copy-Item $backup $file; exit 1
}

$content = $content.Substring(0, $lastIdx) + $checkoutJS + $content.Substring($lastIdx)
Write-Host "✓ Inserted startCheckout() function" -ForegroundColor Green

# ── 5. Write file ─────────────────────────────────────────────────────────
[System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
Write-Host "✓ File written" -ForegroundColor Green

# ── 6. Verify ─────────────────────────────────────────────────────────────
Write-Host "`n── Verification ──────────────────────────────────────────" -ForegroundColor Cyan
$v     = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
$allOk = $true

function Check($label, $pattern) {
    if ($v.Contains($pattern)) {
        Write-Host "  ✓ $label" -ForegroundColor Green
    } else {
        Write-Host "  ✗ FAILED: $label" -ForegroundColor Red
        $script:allOk = $false
    }
}

Check "Razorpay script tag"     'checkout.razorpay.com/v1/checkout.js'
Check "startCheckout function"  'async function startCheckout(planType)'
Check "PRO button wired"        "startCheckout('monthly')"
Check "ELITE button wired"      "startCheckout('annual')"
Check "401 redirect guard"      'Please sign in to upgrade'
Check "payment.failed handler"  'payment.failed'

if ($allOk) {
    Write-Host "`n✅ All checks passed. Run:" -ForegroundColor Green
    Write-Host "  git add public/index.html" -ForegroundColor White
    Write-Host "  git commit -m 'feat: wire Razorpay checkout on pricing page'" -ForegroundColor White
    Write-Host "  git push" -ForegroundColor White
} else {
    Write-Host "`n❌ Checks failed — restoring backup..." -ForegroundColor Red
    Copy-Item $backup $file
    Write-Host "✓ Restored. No changes made." -ForegroundColor Yellow
    exit 1
}