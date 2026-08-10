# AgentGlass — Ollama setup for local LLM demo (Windows)
# Run from repo root: .\scripts\setup-ollama.ps1

$ErrorActionPreference = "Stop"
$ollamaExe = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
$model = if ($env:OLLAMA_MODEL) { $env:OLLAMA_MODEL } else { "llama3.2:1b" }

function Test-OllamaApi {
    try {
        $r = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 3
        return $true
    } catch {
        return $false
    }
}

Write-Host "AgentGlass Ollama setup" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $ollamaExe)) {
    Write-Host "Ollama not found. Downloading installer (~1.5 GB)..." -ForegroundColor Yellow
    $installer = "$env:TEMP\OllamaSetup.exe"
    curl.exe -L --retry 3 -o $installer "https://ollama.com/download/OllamaSetup.exe"
    Write-Host "Installing Ollama..."
    Start-Process -FilePath $installer -ArgumentList "/VERYSILENT", "/NORESTART", "/SUPPRESSMSGBOXES" -Wait
    Remove-Item $installer -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path $ollamaExe)) {
    Write-Host "Install failed. Download manually: https://ollama.com/download" -ForegroundColor Red
    exit 1
}

Write-Host "Ollama: $(& $ollamaExe --version)"

if (-not (Test-OllamaApi)) {
    Write-Host "Starting Ollama server..."
    Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 4
}

if (-not (Test-OllamaApi)) {
    Write-Host "Ollama API not responding on http://127.0.0.1:11434" -ForegroundColor Red
    exit 1
}

Write-Host "Pulling model: $model (first run may take several minutes)..."
& $ollamaExe pull $model

Write-Host ""
Write-Host "Done. Run the demo:" -ForegroundColor Green
Write-Host "  cd sdk-python"
Write-Host "  pip install -e `".[langgraph,ollama]`""
Write-Host "  python examples/demo_support_research_agent.py --variant a"
Write-Host ""
Write-Host "Or full stack: pnpm demo -- --compare"
