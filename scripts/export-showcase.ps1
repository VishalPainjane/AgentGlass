# Export real traces from a running local daemon into public/showcase/ for the Vercel demo.
# Prerequisite: pnpm dev:up and at least one demo agent run.

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$outDir = Join-Path $repoRoot "apps\dashboard\public\showcase"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$traces = @(
  @{ id = "refund-triage"; traceId = "3005d022-7f5a-47c4-8929-c4969e8452eb"; label = "Refund Triage (LangGraph)"; default = $true },
  @{ id = "pipeline-success"; traceId = "7cb15f20-12d0-4a48-9193-7d3e371f8e6f"; label = "Support Agent — Success"; default = $false },
  @{ id = "pipeline-blocked"; traceId = "2e985af0-7210-49c8-81fc-78f0213e6418"; label = "Support Agent — Blocked"; default = $false }
)

$daemon = "http://127.0.0.1:8765"
try {
  Invoke-RestMethod "$daemon/health" -TimeoutSec 3 | Out-Null
} catch {
  Write-Error "Daemon not running. Start with: pnpm dev:up"
}

$allTraces = (Invoke-RestMethod "$daemon/v1/traces").traces
$manifest = @{
  version = 1
  compare = @{ left = "pipeline-success"; right = "pipeline-blocked" }
  traces = @()
}

foreach ($t in $traces) {
  $meta = $allTraces | Where-Object { $_.trace_id -eq $t.traceId }
  if (-not $meta) {
    Write-Warning "Trace $($t.traceId) not found — run the demos first, then re-export."
    continue
  }

  $events = (Invoke-RestMethod "$daemon/v1/traces/$($t.traceId)/events").events
  $bundle = @{ trace = $meta; events = $events }
  $bundle | ConvertTo-Json -Depth 30 -Compress | Set-Content -Encoding utf8 (Join-Path $outDir "$($t.id).json")
  $manifest.traces += @{ id = $t.id; trace_id = $t.traceId; label = $t.label; default = $t.default }
}

$manifest | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 (Join-Path $outDir "manifest.json")
Write-Host "Exported showcase traces to $outDir"
