
$ErrorActionPreference = "Stop"

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

$appsRaw = (Invoke-RestMethod -Headers $H -Uri "$Api/apps").value
$firstApp = $appsRaw[0]
Step ("raw fields of first report in app '" + $firstApp.name + "'") {
    $r = (Invoke-RestMethod -Headers $H -Uri "$Api/apps/$($firstApp.id)/reports").value[0]
    $fields = [ordered]@{}
    foreach ($prop in $r.PSObject.Properties) {
        $v = "$($prop.Value)"
        if ($v.Length -gt 90) { $v = $v.Substring(0, 90) + "..." }
        $fields[$prop.Name] = $v
    }
    $fields
}

$groups = $null
Step "list workspaces (GET /groups)" {
    $g = (Invoke-RestMethod -Headers $H -Uri "$Api/groups").value
    $script:groups = $g
    @{ count = @($g).Count; names = @($g | Select-Object -First 12 -ExpandProperty name) }
} | Out-Null

if ($groups) {
    Step "datasetId presence on WORKSPACE reports (first 3 workspaces)" {
        $summary = @()
        foreach ($g in ($groups | Select-Object -First 3)) {
            try {
                $reps = (Invoke-RestMethod -Headers $H -Uri "$Api/groups/$($g.id)/reports").value
                $with = @($reps | Where-Object { $_.datasetId }).Count
                $summary += @{ workspace = $g.name; reports = @($reps).Count; withDatasetId = $with }
            } catch {
                $summary += @{ workspace = $g.name; error = $_.Exception.Message }
            }
        }
        $summary
    } | Out-Null

    $ds = $null
    $dsWs = $null
    foreach ($g in $groups) {
        try {
            $cands = (Invoke-RestMethod -Headers $H -Uri "$Api/groups/$($g.id)/datasets").value
            $pick = $cands | Where-Object { $_.name -match "Admin" } | Select-Object -First 1
            if (-not $pick) { $pick = $cands | Select-Object -First 1 }
            if ($pick) { $ds = $pick; $dsWs = $g; break }
        } catch { }
    }
    if ($ds) {
        $Out.pickedDataset = @{ name = $ds.name; workspace = $dsWs.name }
        Step ("executeQueries INFO.MEASURES() on dataset '" + $ds.name + "'") {
            $body = @{ queries = @(@{ query = "EVALUATE INFO.MEASURES()" }) } | ConvertTo-Json -Depth 5
            $r = Invoke-RestMethod -Method Post -Headers $H -ContentType "application/json" `
                -Uri "$Api/datasets/$($ds.id)/executeQueries" -Body $body
            @{ measureRows = @($r.results[0].tables[0].rows).Count }
        } | Out-Null
        Step ("executeQueries COLUMNSTATISTICS() on dataset '" + $ds.name + "'") {
            $body = @{ queries = @(@{ query = "EVALUATE COLUMNSTATISTICS()" }) } | ConvertTo-Json -Depth 5
            $r = Invoke-RestMethod -Method Post -Headers $H -ContentType "application/json" `
                -Uri "$Api/datasets/$($ds.id)/executeQueries" -Body $body
            @{ statRows = @($r.results[0].tables[0].rows).Count }
        } | Out-Null
    } else {
        $Out.pickedDataset = "no dataset visible in any workspace"
    }
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
