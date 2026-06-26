import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface RuleDescriptor {
  relativePath: string;
  description: string;
  globs: string[];
  alwaysApply: boolean;
}

export interface RulesMapResult {
  alwaysApplyRules: string[];
  fileRules: Array<{ file: string; rules: string[] }>;
  uniqueRules: string[];
  contextForPrompt: string;
}

function escapeRegex(char: string): string {
  return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Converte glob simples para RegExp (suficiente para `.cursor/rules/*.mdc`). */
export function globToRegExp(glob: string): RegExp {
  const normalized = glob.replace(/\\/g, '/').trim();
  let regex = '^';
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '*' && normalized[i + 1] === '*') {
      regex += '.*';
      i += 1;
      if (normalized[i + 1] === '/') {
        i += 1;
      }
    } else if (ch === '*') {
      regex += '[^/]*';
    } else if (ch === '?') {
      regex += '.';
    } else {
      regex += escapeRegex(ch);
    }
  }
  regex += '$';
  return new RegExp(regex, 'i');
}

export function matchesGlob(filePath: string, glob: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return globToRegExp(glob).test(normalized);
}

function parseGlobsFromFrontmatter(block: string): string[] {
  const lines = block.split(/\r?\n/);
  const globs: string[] = [];
  let inGlobs = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inGlobs) {
      const inline = trimmed.match(/^globs:\s*(.+)$/);
      if (inline) {
        const value = inline[1].trim().replace(/^["']|["']$/g, '');
        if (value) {
          globs.push(...value.split(',').map((g) => g.trim()).filter(Boolean));
        }
        continue;
      }
      if (/^globs:\s*$/.test(trimmed)) {
        inGlobs = true;
      }
      continue;
    }

    if (/^\w+:/.test(trimmed) && !trimmed.startsWith('-')) {
      break;
    }

    const listItem = trimmed.match(/^-\s*["']?(.+?)["']?\s*$/);
    if (listItem) {
      globs.push(listItem[1].trim());
    }
  }

  return globs;
}

function parseRuleFrontmatter(content: string, relativePath: string): RuleDescriptor | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return null;
  }

  const block = match[1];
  const descriptionMatch = block.match(/^description:\s*["']?(.+?)["']?\s*$/m);
  const alwaysApply = /alwaysApply:\s*true/i.test(block);

  return {
    relativePath,
    description: descriptionMatch?.[1]?.trim() ?? relativePath,
    globs: parseGlobsFromFrontmatter(block),
    alwaysApply,
  };
}

function collectRuleFiles(rulesDir: string, baseDir: string = rulesDir): string[] {
  const entries = readdirSync(rulesDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const full = join(rulesDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRuleFiles(full, baseDir));
    } else if (entry.isFile() && entry.name.endsWith('.mdc')) {
      files.push(relative(baseDir, full).replace(/\\/g, '/'));
    }
  }

  return files.sort();
}

export function loadProjectRules(repoRoot: string): RuleDescriptor[] {
  const rulesDir = join(repoRoot, '.cursor', 'rules');
  if (!existsSync(rulesDir)) {
    return [];
  }

  const descriptors: RuleDescriptor[] = [];
  for (const rel of collectRuleFiles(rulesDir)) {
    const content = readFileSync(join(rulesDir, rel), 'utf8');
    const parsed = parseRuleFrontmatter(content, `.cursor/rules/${rel}`);
    if (parsed) {
      descriptors.push(parsed);
    }
  }

  return descriptors;
}

function rulesForFile(file: string, descriptors: RuleDescriptor[]): string[] {
  const matched: string[] = [];

  for (const rule of descriptors) {
    if (rule.alwaysApply) {
      continue;
    }
    if (rule.globs.length === 0) {
      continue;
    }
    if (rule.globs.some((glob) => matchesGlob(file, glob))) {
      matched.push(rule.relativePath);
    }
  }

  return matched;
}

export function buildRulesMap(repoRoot: string, changedFiles: string[]): RulesMapResult {
  const descriptors = loadProjectRules(repoRoot);
  const alwaysApplyRules = descriptors.filter((r) => r.alwaysApply).map((r) => r.relativePath);

  const fileRules: Array<{ file: string; rules: string[] }> = [];
  const uniqueSet = new Set<string>(alwaysApplyRules);

  for (const file of changedFiles) {
    const rules = rulesForFile(file, descriptors);
    if (rules.length > 0) {
      fileRules.push({ file, rules });
      for (const rule of rules) {
        uniqueSet.add(rule);
      }
    }
  }

  const uniqueRules = [...uniqueSet].sort();

  if (uniqueRules.length === 0 && alwaysApplyRules.length === 0) {
    return {
      alwaysApplyRules: [],
      fileRules: [],
      uniqueRules: [],
      contextForPrompt: '',
    };
  }

  const lines: string[] = [
    '## Rules do projeto (pré-mapeadas para esta PR)',
    '',
    'Consulte via `read` as rules abaixo — já filtradas pelos arquivos alterados. Índice completo: `.cursor/rules/main.mdc`.',
    '',
  ];

  if (alwaysApplyRules.length > 0) {
    lines.push('### Sempre ativas (`alwaysApply`)');
    for (const rule of alwaysApplyRules) {
      const desc = descriptors.find((d) => d.relativePath === rule)?.description;
      lines.push(`- \`${rule}\`${desc ? ` — ${desc}` : ''}`);
    }
    lines.push('');
  }

  if (fileRules.length > 0) {
    lines.push('### Por arquivo alterado');
    for (const { file, rules } of fileRules) {
      lines.push(`- \`${file}\` → ${rules.map((r) => `\`${r}\``).join(', ')}`);
    }
    lines.push('');
  }

  const extraRules = uniqueRules.filter((r) => !alwaysApplyRules.includes(r));
  if (extraRules.length > 0) {
    lines.push('### Rules a ler na Fase 2 (deduplicadas)');
    for (const rule of extraRules) {
      const desc = descriptors.find((d) => d.relativePath === rule)?.description;
      lines.push(`- \`${rule}\`${desc ? ` — ${desc}` : ''}`);
    }
  }

  return {
    alwaysApplyRules,
    fileRules,
    uniqueRules,
    contextForPrompt: lines.join('\n'),
  };
}
