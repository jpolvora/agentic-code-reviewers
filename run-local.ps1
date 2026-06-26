# Teste local rápido — dry-run sem publicar na PR
param(
    [string]$SourceBranch = (git branch --show-current),
    [string]$TargetBranch
)

if (-not $TargetBranch) {
    $TargetBranch = if ($env:CURSOR_REVIEWER_TARGET_BRANCH) { $env:CURSOR_REVIEWER_TARGET_BRANCH } else { 'refs/heads/master' }
}

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$requiredSkills = @(
  'skills\CODE_REVIEW.md',
  'skills\SYSTEM_PROMPT.md'
)
foreach ($relative in $requiredSkills) {
  $skillPath = Join-Path $PSScriptRoot $relative
  if (-not (Test-Path $skillPath)) {
    $posixPath = $relative -replace '\\', '/'
    Write-Error @"
❌ [cursor-reviewer] Skill/Prompt obrigatória ausente: $posixPath
   Runner: $PSScriptRoot
   Garanta que a skill está em skills/ antes de executar.
"@
  }
}

$envPath = Join-Path $PSScriptRoot '.env'
$hasCursorApiKeyInEnvFile = (Test-Path $envPath) -and [bool](Select-String -Path $envPath -Pattern '^\s*CURSOR_API_KEY\s*=\s*[^\s#]+' -Quiet)
if (-not $env:CURSOR_API_KEY -and -not $hasCursorApiKeyInEnvFile) {
    Write-Error 'Defina CURSOR_API_KEY antes de executar: $env:CURSOR_API_KEY = "cursor_..." ou configure scripts/cursor-reviewer/.env'
}

if ($SourceBranch -notmatch '^refs/heads/') {
    $SourceBranch = "refs/heads/$SourceBranch"
}

Write-Host "Dry-run: $SourceBranch -> $TargetBranch"

npm run review -- `
    --dry-run `
    --source-branch $SourceBranch `
    --target-branch $TargetBranch `
    @args
