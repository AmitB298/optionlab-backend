# fix-admin.ps1
# Run from: E:\OptionLab\optionlab-backend

cd E:\OptionLab\optionlab-backend

# Step 1: Restore the last clean git version
Write-Host "Restoring clean admin.html from git..." -ForegroundColor Cyan
git checkout HEAD -- public/admin.html

# Step 2: Read the clean file
$html = [System.IO.File]::ReadAllText("$PWD\public\admin.html", [System.Text.Encoding]::UTF8)

# Step 3: Show current maxlength lines
Write-Host "`nCurrent maxlength lines:" -ForegroundColor Yellow
($html -split "`n") | ForEach-Object -Begin {$i=0} -Process {
    $i++
    if ($_ -match 'maxlength') { Write-Host "  Line ${i}: $($_.Trim())" }
}

# Step 4: Fix MPIN login field
$old = 'id="lg-mpin" placeholder="••••" maxlength="20"'
$new = 'id="lg-mpin" placeholder="••••" maxlength="6"'
if ($html.Contains($old)) {
    $html = $html.Replace($old, $new)
    Write-Host "`nFixed: lg-mpin maxlength -> 6" -ForegroundColor Green
} else {
    Write-Host "`nWARN: lg-mpin exact pattern not found. Current lg-mpin lines:" -ForegroundColor Red
    ($html -split "`n") | ForEach-Object -Begin {$i=0} -Process {
        $i++
        if ($_ -match 'lg-mpin') { Write-Host "  Line ${i}: $($_.Trim())" }
    }
}

# Step 5: Fix Reset MPIN modal field
$old2 = 'id="new-mpin" type="text" maxlength="20"'
$new2 = 'id="new-mpin" type="text" maxlength="6"'
if ($html.Contains($old2)) {
    $html = $html.Replace($old2, $new2)
    Write-Host "Fixed: new-mpin maxlength -> 6" -ForegroundColor Green
} else {
    Write-Host "INFO: new-mpin exact pattern not found - checking..." -ForegroundColor Gray
    ($html -split "`n") | ForEach-Object -Begin {$i=0} -Process {
        $i++
        if ($_ -match 'new-mpin') { Write-Host "  Line ${i}: $($_.Trim())" }
    }
}

# Step 6: Verify JS is intact
if ($html.Contains("function doAdminLogin")) {
    Write-Host "OK: doAdminLogin present" -ForegroundColor Green
} else {
    Write-Host "ERROR: doAdminLogin MISSING - abort!" -ForegroundColor Red
    exit 1
}

# Step 7: Final maxlength check
Write-Host "`nFinal maxlength lines:" -ForegroundColor Yellow
($html -split "`n") | ForEach-Object -Begin {$i=0} -Process {
    $i++
    if ($_ -match 'maxlength') { Write-Host "  Line ${i}: $($_.Trim())" }
}

# Step 8: Write using .NET (safe encoding)
[System.IO.File]::WriteAllText("$PWD\public\admin.html", $html, [System.Text.Encoding]::UTF8)
Write-Host "File written OK" -ForegroundColor Green

# Step 9: Git
git add public/admin.html
git diff --cached --stat
git commit -m "fix: MPIN maxlength 6, clean JS restored"
git push

Write-Host "`nDone! Mobile: 9999999999  MPIN: 112233" -ForegroundColor Green