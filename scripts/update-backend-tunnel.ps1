$ErrorActionPreference = 'Stop'

function Get-LatestTunnelUrl {
  param(
    [string]$LogPath
  )

  if (-not (Test-Path $LogPath)) {
    throw "Tunnel log not found: $LogPath"
  }

  $content = Get-Content $LogPath -Raw
  $tunnelMatches = [regex]::Matches($content, 'https://[a-z0-9-]+\\.trycloudflare\\.com')
  if ($tunnelMatches.Count -eq 0) {
    throw 'Tunnel URL not found in log yet. Wait a few seconds and try again.'
  }

  return $tunnelMatches[$tunnelMatches.Count - 1].Value
}

function Set-EnvValue {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Value,
    [string]$Comment
  )

  if (-not (Test-Path $Path)) {
    New-Item -ItemType File -Path $Path -Force | Out-Null
  }

  $lines = Get-Content $Path
  $pattern = "^\s*$Key\s*="
  $updated = $false
  $output = @()

  foreach ($line in $lines) {
    if ($line -match $pattern) {
      $output += "$Key=$Value"
      $updated = $true
    } else {
      $output += $line
    }
  }

  if (-not $updated) {
    if ($Comment) {
      $output += $Comment
    }
    $output += "$Key=$Value"
  }

  Set-Content -Path $Path -Value $output -NoNewline
}

$logPath = "$env:TEMP\cloudflared-backend.log"
$url = Get-LatestTunnelUrl -LogPath $logPath

Write-Host "Detected tunnel URL: $url"

# Dev tunnel: updated automatically by scripts/update-backend-tunnel.ps1
Set-EnvValue -Path 'apps/backend/.env' -Key 'BACKEND_PUBLIC_URL' -Value $url -Comment '# Dev tunnel: auto-updated'

Write-Host 'Updated: apps/backend/.env'
