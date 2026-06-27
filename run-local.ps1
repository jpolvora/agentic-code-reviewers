# Teste local rápido — dry-run sem publicar na PR
param(
    [string]$SourceBranch = (git branch --show-current),
    [string]$TargetBranch
)

if (-not $TargetBranch) {
    $TargetBranch = if ($env:AGENTIC_CODE_REVIEWERS_TARGET_BRANCH) {
        $env:AGENTIC_CODE_REVIEWERS_TARGET_BRANCH
    } elseif ($env:CURSOR_REVIEWER_TARGET_BRANCH) {
        $env:CURSOR_REVIEWER_TARGET_BRANCH
    } else {
        'refs/heads/master'
    }
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
❌ [agentic-code-reviewers] Skill/Prompt obrigatória ausente: $posixPath
   Runner: $PSScriptRoot
   Garanta que a skill está em skills/ antes de executar.
"@
  }
}

$cursorKey = if ($env:AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY) {
    $env:AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY
} else {
    $env:CURSOR_API_KEY
}

$envPath = Join-Path $PSScriptRoot '.env'
$hasCursorApiKeyInEnvFile = (Test-Path $envPath) -and [bool](
    Select-String -Path $envPath -Pattern '^\s*(AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY|CURSOR_API_KEY)\s*=\s*[^\s#]+' -Quiet
)
if (-not $cursorKey -and -not $hasCursorApiKeyInEnvFile) {
    Write-Error 'Defina AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY antes de executar: $env:AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY = "cursor_..." ou configure .env na raiz do projeto'
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
