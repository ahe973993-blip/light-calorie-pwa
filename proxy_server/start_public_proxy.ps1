$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$proxyDir = Join-Path $root 'proxy_server'
$logDir = Join-Path $proxyDir 'logs'
$proxyLog = Join-Path $logDir 'proxy.log'
$proxyErr = Join-Path $logDir 'proxy.err.log'
$tunnelLog = Join-Path $logDir 'tunnel.log'
$tunnelErr = Join-Path $logDir 'tunnel.err.log'
$subdomain = 'ahe973993-calorie-proxy-20260404'

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Stop stale tunnel processes
Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -in @('cmd.exe', 'node.exe') -and (
      [string]$_.CommandLine -match 'localtunnel' -or
      [string]$_.CommandLine -match '\blt --port 8787\b' -or
      [string]$_.CommandLine -match 'npx-cli\.js.*localtunnel'
    )
  } |
  ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {}
  }

# Stop old proxy process started from this project
Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq 'node.exe' -and
    [string]$_.CommandLine -match 'server\.js' -and
    [string]$_.CommandLine -match [Regex]::Escape($proxyDir)
  } |
  ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {}
  }

if (Test-Path $proxyLog) { Remove-Item $proxyLog -Force }
if (Test-Path $proxyErr) { Remove-Item $proxyErr -Force }
if (Test-Path $tunnelLog) { Remove-Item $tunnelLog -Force }
if (Test-Path $tunnelErr) { Remove-Item $tunnelErr -Force }

$proxyProc = Start-Process node -ArgumentList 'server.js' -WorkingDirectory $proxyDir -RedirectStandardOutput $proxyLog -RedirectStandardError $proxyErr -PassThru

$ok = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 1
  try {
    $health = Invoke-RestMethod -Uri 'http://localhost:8787/api/health' -Method Get -TimeoutSec 3
    if ($health.ok) { $ok = $true; break }
  } catch {}
}
if (-not $ok) {
  Write-Error '后端服务启动失败，请检查 proxy_server/logs/proxy.err.log'
}

$cmd = "/c npx --yes localtunnel --port 8787 --subdomain $subdomain"
$tunnelProc = Start-Process cmd -ArgumentList $cmd -WorkingDirectory $root -RedirectStandardOutput $tunnelLog -RedirectStandardError $tunnelErr -PassThru

$url = ''
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $tunnelLog) {
    $out = Get-Content $tunnelLog -Raw
    if ($out -match 'https://[\w\-\.]+' ) {
      $url = $Matches[0]
      break
    }
  }
}

if (-not $url) {
  Write-Error '公网隧道启动失败，请检查 proxy_server/logs/tunnel.err.log'
}

Write-Host "后端已启动: http://localhost:8787"
Write-Host "公网API地址: $url"
Write-Host "健康检查: $url/api/health"
Write-Host "如果请求超时，请确保前端请求头包含: bypass-tunnel-reminder: true"
Write-Host "进程ID => proxy: $($proxyProc.Id), tunnel: $($tunnelProc.Id)"
