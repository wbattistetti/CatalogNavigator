# Applies migrations and prints local Supabase connection values for .env.local
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "Starting local Supabase (Docker must be running)..." -ForegroundColor Cyan
npx supabase start | Out-Host

Write-Host "`nResetting database and applying migrations..." -ForegroundColor Cyan
npx supabase db reset | Out-Host

Write-Host "`nLocal Supabase is ready. Use these values in .env.local:" -ForegroundColor Green
npx supabase status -o env | Out-Host

$rootEnv = Join-Path $ProjectRoot '.env.local'
$functionsEnv = Join-Path $ProjectRoot 'supabase\functions\.env'
if (Test-Path $rootEnv) {
  $openAiLine = Get-Content $rootEnv | Where-Object { $_ -match '^\s*OPENAI_API_KEY=' }
  if ($openAiLine) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($functionsEnv, ($openAiLine.Trim() + "`n"), $utf8NoBom)
    Write-Host "`nSynced OPENAI_API_KEY to supabase/functions/.env (Edge Functions)" -ForegroundColor Green
  } else {
    Write-Host "`nWARN: Add OPENAI_API_KEY=sk-... to .env.local for Genera agente (IA)" -ForegroundColor Yellow
  }
} else {
  Write-Host "`nWARN: Create .env.local with OPENAI_API_KEY for Genera agente (IA)" -ForegroundColor Yellow
}

Write-Host "Then run: npm run dev" -ForegroundColor Yellow
