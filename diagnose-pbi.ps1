# diagnose-pbi.ps1 - run Power BI API diagnostics from THIS machine and put
# the results on the clipboard, ready to paste back to the assistant.
#
# Usage:
#   irm https://raw.githubusercontent.com/BCABC4353/PBIVIEWER/main/diagnose-pbi.ps1 | iex
#
# What it does (read-only, as YOU):
#   1. Device-code sign-in (same short-code ritual as the phone app).
#   2. Lists your Power BI Apps and the first app's reports.
#   3. Picks a report whose name contains "Admin" when one exists (owner said
#      those are safe), otherwise the first report, and runs the same dataset
#      model query the mobile app's crosswalk runs (INFO.MEASURES()).
#   4. Copies a compact JSON result (statuses + errors + names only, never
#      row data) to the clipboard. Paste it into the chat.
#
# Windows PowerShell 5.1 compatible. ASCII only.

$ErrorActionPreference = "Stop"

# PS 5.1 defaults to old TLS, which Microsoft's login servers refuse.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ClientId = "ee7edf76-d666-4e27-8ee7-fbc19648c4f4"
$TenantId = "65028f2d-9190-4d7f-bc2d-8ce298c3ba6f"
$Scope = "https://analysis.windows.net/powerbi/api/.default offline_access"
$Api = "https://api.powerbi.com/v1.0/myorg"

$Out = [ordered]@{ when = (Get-Date).ToString("s"); steps = @() }

function Step {
    param([string]$Name, [scriptblock]$Action)
    $entry = [ordered]@{ step = $Name; ok = $false }
    try {
        $entry.result = & $Action
        $entry.ok = $true
    } catch {
        $msg = $_.Exception.Message
        # Pull the response body out of web exceptions when present - the
        # Power BI error code lives there, not in the status line.
        try {
            $body = ""
            if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $body = $_.ErrorDetails.Message }
            if (-not $body -and $_.Exception.Response) {
                $stream = $_.Exception.Response.GetResponseStream()
                if ($stream.CanSeek) { $stream.Position = 0 }
                $reader = New-Object System.IO.StreamReader($stream)
                $body = $reader.ReadToEnd()
            }
            if ($body) { $msg = "$msg | body: " + $body.Substring(0, [Math]::Min(600, $body.Length)) }
        } catch { }
        $entry.error = $msg
    }
    $script:Out.steps += $entry
    $tag = "FAIL"
    if ($entry.ok) { $tag = "OK" }
    Write-Host ("    [{0}] {1}" -f $tag, $Name)
    return $entry
}

$TokenCache = Join-Path $env:TEMP "pbi-diag-token.json"

Write-Host ""
Write-Host "==> Power BI diagnostics - step 1: sign in" -ForegroundColor Cyan

# Reuse a recent token so back-to-back runs skip the code ritual.
$token = $null
if (Test-Path $TokenCache) {
    try {
        $cached = Get-Content $TokenCache -Raw | ConvertFrom-Json
        if ([DateTime]::Parse($cached.expires) -gt (Get-Date)) {
            $token = $cached.access_token
            Write-Host "    Reusing your sign-in from a few minutes ago." -ForegroundColor Green
        }
    } catch { }
}

if (-not $token) {

try {
    $dc = Invoke-RestMethod -Method Post `
        -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/devicecode" `
        -Body @{ client_id = $ClientId; scope = $Scope }
} catch {
    Write-Host ""
    Write-Host ("    Could not reach Microsoft sign-in: " + $_.Exception.Message) -ForegroundColor Red
    Write-Host "    Copy the line above and paste it to the assistant." -ForegroundColor Red
    Read-Host "    Press Enter to close"
    return
}

Write-Host ""
Write-Host ("    Go to  https://microsoft.com/devicelogin  and enter code:  {0}" -f $dc.user_code) -ForegroundColor Yellow
Write-Host "    (waiting here until you approve...)"
Write-Host ""

$token = $null
$deadline = (Get-Date).AddSeconds([int]$dc.expires_in)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds ([int]$dc.interval)
    try {
        $tk = Invoke-RestMethod -Method Post `
            -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token" `
            -Body @{
                grant_type = "urn:ietf:params:oauth:grant-type:device_code"
                client_id = $ClientId
                device_code = $dc.device_code
            }
        $token = $tk.access_token
        break
    } catch {
        # PS 5.1: the JSON error body usually arrives via ErrorDetails; the
        # raw stream is often already consumed and reads back EMPTY. An empty
        # body means we could not read the reply - that is NOT a decline, so
        # keep waiting. Only a body that explicitly names a terminal error
        # stops the loop.
        $body = ""
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $body = $_.ErrorDetails.Message }
        if (-not $body) {
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                if ($stream.CanSeek) { $stream.Position = 0 }
                $reader = New-Object System.IO.StreamReader($stream)
                $body = $reader.ReadToEnd()
            } catch { }
        }
        if ($body -and $body -notmatch "authorization_pending|slow_down") {
            Write-Host "    Sign-in failed or was declined. Body: $body" -ForegroundColor Red
            Read-Host "    Press Enter to close"
            return
        }
    }
}
if (-not $token) {
    Write-Host "    The code expired before approval. Run the script again." -ForegroundColor Red
    Read-Host "    Press Enter to close"
    return
}
@{ access_token = $token; expires = (Get-Date).AddMinutes(55).ToString("o") } |
    ConvertTo-Json | Set-Content -Path $TokenCache
}
Write-Host "    Signed in." -ForegroundColor Green
$H = @{ Authorization = "Bearer $token" }

Write-Host ""
Write-Host "==> Step 2: probing (read-only)" -ForegroundColor Cyan

$apps = Step "list apps (GET /apps)" {
    $r = Invoke-RestMethod -Headers $H -Uri "$Api/apps"
    @{ count = @($r.value).Count; names = @($r.value | Select-Object -First 10 -ExpandProperty name) }
}

$reportPick = $null
if ($apps.ok -and $apps.result.count -gt 0) {
    $appsRaw = Invoke-RestMethod -Headers $H -Uri "$Api/apps"
    $firstApp = $appsRaw.value[0]
    $reports = Step ("list reports of app '" + $firstApp.name + "'") {
        $r = Invoke-RestMethod -Headers $H -Uri "$Api/apps/$($firstApp.id)/reports"
        @{ count = @($r.value).Count; names = @($r.value | Select-Object -First 10 -ExpandProperty name) }
    }
    if ($reports.ok) {
        $rlist = (Invoke-RestMethod -Headers $H -Uri "$Api/apps/$($firstApp.id)/reports").value
        $reportPick = $rlist | Where-Object { $_.name -match "Admin" } | Select-Object -First 1
        if (-not $reportPick) { $reportPick = $rlist | Select-Object -First 1 }
    }
}

if ($reportPick -and $reportPick.datasetId) {
    $Out.pickedReport = @{ name = $reportPick.name; datasetId = $reportPick.datasetId }
    Step ("executeQueries INFO.MEASURES() on dataset of '" + $reportPick.name + "'") {
        $body = @{ queries = @(@{ query = "EVALUATE INFO.MEASURES()" }); serializerSettings = @{ includeNulls = $true } } | ConvertTo-Json -Depth 5
        $r = Invoke-RestMethod -Method Post -Headers $H -ContentType "application/json" `
            -Uri "$Api/datasets/$($reportPick.datasetId)/executeQueries" -Body $body
        $rows = @($r.results[0].tables[0].rows)
        @{ measureCount = $rows.Count; firstMeasureColumns = if ($rows.Count -gt 0) { @($rows[0].PSObject.Properties.Name) } else { @() } }
    }
    Step "executeQueries COLUMNSTATISTICS() (fallback rung)" {
        $body = @{ queries = @(@{ query = "EVALUATE COLUMNSTATISTICS()" }) } | ConvertTo-Json -Depth 5
        $r = Invoke-RestMethod -Method Post -Headers $H -ContentType "application/json" `
            -Uri "$Api/datasets/$($reportPick.datasetId)/executeQueries" -Body $body
        @{ rowCount = @($r.results[0].tables[0].rows).Count }
    }
} else {
    $Out.pickedReport = "none found (no apps/reports visible, or report has no datasetId)"
}

$json = $Out | ConvertTo-Json -Depth 8
$OutFile = Join-Path ([Environment]::GetFolderPath("Desktop")) "pbi-diagnostic.json"
Set-Content -Path $OutFile -Value $json -Encoding UTF8
try { Set-Clipboard -Value $json } catch { }
Write-Host ""
Write-Host "==> DONE. Opening the results in Notepad." -ForegroundColor Green
Write-Host "    In Notepad: Ctrl+A, Ctrl+C, then paste into the chat." -ForegroundColor Green
Write-Host ("    (Saved at {0} - names and statuses only, no row data.)" -f $OutFile) -ForegroundColor Green
Start-Process notepad.exe $OutFile
