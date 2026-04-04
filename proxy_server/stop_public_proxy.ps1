Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -in @('cmd.exe', 'node.exe') -and (
      [string]$_.CommandLine -match 'localtunnel' -or
      [string]$_.CommandLine -match '\blt --port 8787\b' -or
      [string]$_.CommandLine -match 'npx-cli\.js.*localtunnel' -or
      [string]$_.CommandLine -match 'server\.js'
    )
  } |
  ForEach-Object {
    try {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
      Write-Host "stopped pid=$($_.ProcessId)"
    } catch {}
  }

Write-Host '已尝试停止后端和隧道进程。'
