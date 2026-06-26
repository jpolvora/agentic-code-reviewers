import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { isUnexpandedPipelineMacro, loadConfig } from '../src/config.js';

/** Evita poluição quando os testes rodam dentro de GitHub Actions (ex.: GITHUB_REF em PR). */
const ISOLATED_CI_ENV: Record<string, undefined> = {
  GITHUB_ACTIONS: undefined,
  GITHUB_REPOSITORY: undefined,
  GITHUB_REF: undefined,
  GITHUB_TOKEN: undefined,
  GH_TOKEN: undefined,
  TF_BUILD: undefined,
  SYSTEM_COLLECTIONURI: undefined,
  SYSTEM_PULLREQUEST_PULLREQUESTID: undefined,
  SYSTEM_ACCESSTOKEN: undefined,
  AZURE_DEVOPS_EXT_PAT: undefined,
  CURSOR_REVIEWER_STACK: undefined,
  SCORE_MIN: undefined,
};

function withEnv(env: Record<string, string | undefined>, action: () => void): void {
  const merged = { ...ISOLATED_CI_ENV, ...env };
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(merged)) {
    previous.set(key, process.env[key]);
    if (merged[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = merged[key];
    }
  }

  try {
    action();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe('loadConfig', () => {
  it('falha em dry-run com contexto ADO sem token para não ignorar threads pendentes', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
        SYSTEM_ACCESSTOKEN: undefined,
        AZURE_DEVOPS_EXT_PAT: undefined,
        GITHUB_ACTIONS: undefined,
        GITHUB_TOKEN: undefined,
        GH_TOKEN: undefined,
        GITHUB_REPOSITORY: undefined,
      },
      () => {
        assert.throws(
          () =>
            loadConfig([
              '--dry-run',
              '--source-branch',
              'refs/heads/feature',
              '--org',
              'org',
              '--project',
              'project',
              '--repo',
              'repo',
              '--pr-id',
              '123',
            ]),
          /Token ADO ausente/,
        );
      },
    );
  });

  it('usa default composer-2.5 quando CURSOR_REVIEWER_MODEL está vazio (pipeline ADO sem variável)', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
        CURSOR_REVIEWER_MODEL: '',
      },
      () => {
        const config = loadConfig(['--dry-run', '--source-branch', 'refs/heads/feature']);
        assert.equal(config.model, 'composer-2.5');
      },
    );
  });

  it('usa default composer-2.5 quando CURSOR_REVIEWER_MODEL é macro ADO não expandida', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
        CURSOR_REVIEWER_MODEL: '$(CURSOR_REVIEWER_MODEL)',
      },
      () => {
        const config = loadConfig(['--dry-run', '--source-branch', 'refs/heads/feature']);
        assert.equal(config.model, 'composer-2.5');
      },
    );
  });

  it('usa cursor-sdk como engine default', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
        CURSOR_REVIEWER_ENGINE: undefined,
      },
      () => {
        const config = loadConfig(['--dry-run', '--source-branch', 'refs/heads/feature']);
        assert.equal(config.engine, 'cursor-sdk');
      },
    );
  });

  it('aceita CURSOR_REVIEWER_ENGINE=opencode', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
        CURSOR_REVIEWER_ENGINE: 'opencode',
      },
      () => {
        const config = loadConfig(['--dry-run', '--source-branch', 'refs/heads/feature']);
        assert.equal(config.engine, 'opencode');
        assert.equal(config.model, 'anthropic/claude-sonnet-4-6');
      },
    );
  });

  it('aceita modelo provider/model com engine opencode', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
        CURSOR_REVIEWER_ENGINE: 'opencode',
        CURSOR_REVIEWER_MODEL: 'openai/gpt-4.1',
      },
      () => {
        const config = loadConfig(['--dry-run', '--source-branch', 'refs/heads/feature']);
        assert.equal(config.model, 'openai/gpt-4.1');
      },
    );
  });

  it('rejeita engine inválido', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
        CURSOR_REVIEWER_ENGINE: 'invalid-engine',
      },
      () => {
        assert.throws(
          () => loadConfig(['--dry-run', '--source-branch', 'refs/heads/feature']),
          /Engine inválido/,
        );
      },
    );
  });

  it('detecta macro ADO não expandida', () => {
    assert.equal(isUnexpandedPipelineMacro('$(CURSOR_REVIEWER_MODEL)'), true);
    assert.equal(isUnexpandedPipelineMacro('composer-2.5'), false);
    assert.equal(isUnexpandedPipelineMacro(''), false);
  });

  it('prioriza --pr-id sobre SYSTEM_PULLREQUEST_PULLREQUESTID', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
        SYSTEM_PULLREQUEST_PULLREQUESTID: '999',
        SYSTEM_ACCESSTOKEN: 'pat_test',
        GITHUB_ACTIONS: undefined,
        GITHUB_TOKEN: undefined,
        GH_TOKEN: undefined,
        GITHUB_REPOSITORY: undefined,
      },
      () => {
        const config = loadConfig([
          '--dry-run',
          '--source-branch',
          'refs/heads/feature',
          '--org',
          'org',
          '--project',
          'project',
          '--repo',
          'repo',
          '--pr-id',
          '123',
        ]);
        assert.equal(config.pullRequestId, 123);
        assert.equal(config.pullRequestIdSource, '--pr-id');
      },
    );
  });

  it('usa SYSTEM_PULLREQUEST_PULLREQUESTID na pipeline', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
        SYSTEM_PULLREQUEST_PULLREQUESTID: '456',
        GITHUB_ACTIONS: undefined,
        GITHUB_TOKEN: undefined,
        GH_TOKEN: undefined,
        GITHUB_REPOSITORY: undefined,
      },
      () => {
        const config = loadConfig(['--dry-run', '--source-branch', 'refs/heads/feature']);
        assert.equal(config.pullRequestId, 456);
        assert.equal(config.pullRequestIdSource, 'SYSTEM_PULLREQUEST_PULLREQUESTID');
      },
    );
  });

  it('prioriza --model sobre CURSOR_REVIEWER_MODEL', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
        CURSOR_REVIEWER_MODEL: 'composer-2.5',
      },
      () => {
        const config = loadConfig([
          '--dry-run',
          '--source-branch',
          'refs/heads/feature',
          '--model',
          'gpt-5.4',
        ]);
        assert.equal(config.model, 'gpt-5.4');
      },
    );
  });

  it('usa maxRounds default 5 e respeita override por env', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
        CURSOR_REVIEWER_MAX_ROUNDS: undefined,
      },
      () => {
        const config = loadConfig(['--dry-run', '--source-branch', 'refs/heads/feature']);
        assert.equal(config.maxRounds, 5);
      },
    );

    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
        CURSOR_REVIEWER_MAX_ROUNDS: '7',
      },
      () => {
        const config = loadConfig(['--dry-run', '--source-branch', 'refs/heads/feature']);
        assert.equal(config.maxRounds, 7);
      },
    );

    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
        CURSOR_REVIEWER_MAX_ROUNDS: '0',
      },
      () => {
        const config = loadConfig(['--dry-run', '--source-branch', 'refs/heads/feature']);
        assert.equal(config.maxRounds, 0);
      },
    );

    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
        CURSOR_REVIEWER_MAX_ROUNDS: '$(CURSOR_REVIEWER_MAX_ROUNDS)',
      },
      () => {
        const config = loadConfig(['--dry-run', '--source-branch', 'refs/heads/feature']);
        assert.equal(config.maxRounds, 5);
      },
    );
  });

  it('falha na inicialização com modelo inválido', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
        CURSOR_REVIEWER_MODEL: 'gpt-5.4-medium',
      },
      () => {
        assert.throws(
          () => loadConfig(['--dry-run', '--source-branch', 'refs/heads/feature']),
          /Modelo inválido/,
        );
      },
    );
  });

  it('detecta provider com flags --gh e --ado', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
      },
      () => {
        const configGh = loadConfig(['--dry-run', '--source-branch', 'refs/heads/feature', '--gh']);
        assert.equal(configGh.provider, 'github');

        const configAdo = loadConfig(['--dry-run', '--source-branch', 'refs/heads/feature', '--ado']);
        assert.equal(configAdo.provider, 'azuredevops');
      },
    );
  });

  it('auto-detecta provider github baseado em envs', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
        GITHUB_ACTIONS: 'true',
      },
      () => {
        const config = loadConfig(['--dry-run', '--source-branch', 'refs/heads/feature']);
        assert.equal(config.provider, 'github');
      },
    );
  });

  it('auto-detecta provider azuredevops baseado em envs', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
        TF_BUILD: 'true',
        GITHUB_ACTIONS: undefined,
        GITHUB_TOKEN: undefined,
        GH_TOKEN: undefined,
        GITHUB_REPOSITORY: undefined,
      },
      () => {
        const config = loadConfig(['--dry-run', '--source-branch', 'refs/heads/feature']);
        assert.equal(config.provider, 'azuredevops');
      },
    );
  });

  it('sucedes para github com contexto incompleto e sem dry-run', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
      },
      () => {
        const config = loadConfig(['--source-branch', 'refs/heads/feature', '--gh']);
        assert.equal(config.provider, 'github');
      },
    );
  });

  describe('stack selection', () => {
    it('inicia com a stack padrão ABP/Angular se nenhuma for informada e o projeto for vazio/desconhecido', () => {
      const dir = 'test-temp-default-abp';
      mkdirSync(dir, { recursive: true });
      try {
        withEnv(
          {
            CURSOR_API_KEY: 'cursor_test',
          },
          () => {
            const config = loadConfig([
              '--dry-run',
              '--repo-root',
              dir,
              '--source-branch',
              'refs/heads/feature',
            ]);
            assert.equal(config.stack, 'ABP/Angular');
            assert.ok(config.includePatterns.includes('**/*.cs'));
          },
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('permite selecionar stack via variável de ambiente', () => {
      withEnv(
        {
          CURSOR_API_KEY: 'cursor_test',
          CURSOR_REVIEWER_STACK: 'PHP/Laravel',
        },
        () => {
          const config = loadConfig(['--dry-run', '--source-branch', 'refs/heads/feature']);
          assert.equal(config.stack, 'PHP/Laravel');
          assert.ok(config.includePatterns.includes('**/*.php'));
        },
      );
    });

    it('permite selecionar stack via argumento CLI --stack <nome>', () => {
      withEnv(
        {
          CURSOR_API_KEY: 'cursor_test',
        },
        () => {
          const config = loadConfig([
            '--dry-run',
            '--source-branch',
            'refs/heads/feature',
            '--stack',
            'Next.js/React',
          ]);
          assert.equal(config.stack, 'Next.js/React');
          assert.ok(config.includePatterns.includes('**/*.tsx'));
        },
      );
    });

    it('permite selecionar stack via argumento CLI --stack=<nome>', () => {
      withEnv(
        {
          CURSOR_API_KEY: 'cursor_test',
        },
        () => {
          const config = loadConfig([
            '--dry-run',
            '--source-branch',
            'refs/heads/feature',
            '--stack=PHP/Laravel',
          ]);
          assert.equal(config.stack, 'PHP/Laravel');
          assert.ok(config.includePatterns.includes('**/*.php'));
        },
      );
    });

    it('cai para o fallback se uma stack inválida for passada', () => {
      withEnv(
        {
          CURSOR_API_KEY: 'cursor_test',
        },
        () => {
          const config = loadConfig([
            '--dry-run',
            '--source-branch',
            'refs/heads/feature',
            '--stack',
            'invalid-tech-stack',
          ]);
          assert.equal(config.stack, 'TypeScript');
        },
      );
    });

    it('usa default ABP/Angular quando CURSOR_REVIEWER_STACK é macro ADO não expandida e o projeto for vazio/desconhecido', () => {
      const dir = 'test-temp-macro-abp';
      mkdirSync(dir, { recursive: true });
      try {
        withEnv(
          {
            CURSOR_API_KEY: 'cursor_test',
            CURSOR_REVIEWER_STACK: '$(CURSOR_REVIEWER_STACK)',
          },
          () => {
            const config = loadConfig([
              '--dry-run',
              '--repo-root',
              dir,
              '--source-branch',
              'refs/heads/feature',
            ]);
            assert.equal(config.stack, 'ABP/Angular');
            assert.ok(config.includePatterns.includes('**/*.cs'));
          },
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    describe('autodetect stack', () => {
      it('detecta PHP/Laravel se artisan ou composer.json estiver presente', () => {
        const dir = 'test-temp-autodetect-laravel';
        mkdirSync(dir, { recursive: true });
        writeFileSync(`${dir}/artisan`, '');
        try {
          withEnv({ CURSOR_API_KEY: 'cursor_test' }, () => {
            const config = loadConfig([
              '--dry-run',
              '--repo-root',
              dir,
              '--source-branch',
              'refs/heads/feature',
            ]);
            assert.equal(config.stack, 'PHP/Laravel');
            assert.equal(config.stackSource, 'detected');
          });
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      });

      it('detecta Next.js/React se next.config.js estiver presente', () => {
        const dir = 'test-temp-autodetect-next';
        mkdirSync(dir, { recursive: true });
        writeFileSync(`${dir}/next.config.js`, '');
        try {
          withEnv({ CURSOR_API_KEY: 'cursor_test' }, () => {
            const config = loadConfig([
              '--dry-run',
              '--repo-root',
              dir,
              '--source-branch',
              'refs/heads/feature',
            ]);
            assert.equal(config.stack, 'Next.js/React');
            assert.equal(config.stackSource, 'detected');
          });
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      });

      it('detecta TypeScript se tsconfig.json estiver presente', () => {
        const dir = 'test-temp-autodetect-ts';
        mkdirSync(dir, { recursive: true });
        writeFileSync(`${dir}/tsconfig.json`, '{}');
        try {
          withEnv({ CURSOR_API_KEY: 'cursor_test' }, () => {
            const config = loadConfig([
              '--dry-run',
              '--repo-root',
              dir,
              '--source-branch',
              'refs/heads/feature',
            ]);
            assert.equal(config.stack, 'TypeScript');
            assert.equal(config.stackSource, 'detected');
          });
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      });

      it('detecta ABP/Angular se arquivos .sln ou .csproj estiverem presentes', () => {
        const dir = 'test-temp-autodetect-abp';
        mkdirSync(dir, { recursive: true });
        writeFileSync(`${dir}/Foo.sln`, '');
        try {
          withEnv({ CURSOR_API_KEY: 'cursor_test' }, () => {
            const config = loadConfig([
              '--dry-run',
              '--repo-root',
              dir,
              '--source-branch',
              'refs/heads/feature',
            ]);
            assert.equal(config.stack, 'ABP/Angular');
            assert.equal(config.stackSource, 'detected');
          });
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      });

      it('cai no fallback padrão ABP/Angular se nada for detectado', () => {
        const dir = 'test-temp-autodetect-empty';
        mkdirSync(dir, { recursive: true });
        try {
          withEnv({ CURSOR_API_KEY: 'cursor_test' }, () => {
            const config = loadConfig([
              '--dry-run',
              '--repo-root',
              dir,
              '--source-branch',
              'refs/heads/feature',
            ]);
            assert.equal(config.stack, 'ABP/Angular');
            assert.equal(config.stackSource, 'fallback');
          });
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      });
    });
  });

  it('usa SCORE_MIN=6 por padrão', () => {
    withEnv({ CURSOR_API_KEY: 'cursor_test', SCORE_MIN: undefined }, () => {
      const config = loadConfig(['--dry-run', '--source-branch', 'refs/heads/feature']);
      assert.equal(config.scoreMin, 6);
    });
  });

  it('aceita --score-min e SCORE_MIN', () => {
    withEnv({ CURSOR_API_KEY: 'cursor_test' }, () => {
      const fromCli = loadConfig(['--dry-run', '--source-branch', 'refs/heads/feature', '--score-min', '4']);
      assert.equal(fromCli.scoreMin, 4);

      withEnv({ SCORE_MIN: '5' }, () => {
        const fromEnv = loadConfig(['--dry-run', '--source-branch', 'refs/heads/feature']);
        assert.equal(fromEnv.scoreMin, 5);
      });
    });
  });

  it('CLI --score-min tem precedência sobre SCORE_MIN', () => {
    withEnv({ CURSOR_API_KEY: 'cursor_test', SCORE_MIN: '8' }, () => {
      const config = loadConfig([
        '--dry-run',
        '--source-branch',
        'refs/heads/feature',
        '--score-min',
        '4',
      ]);
      assert.equal(config.scoreMin, 4);
    });
  });

  it('ignora SCORE_MIN inválido e usa default 6', () => {
    withEnv({ CURSOR_API_KEY: 'cursor_test', SCORE_MIN: 'invalid' }, () => {
      const config = loadConfig(['--dry-run', '--source-branch', 'refs/heads/feature']);
      assert.equal(config.scoreMin, 6);
    });
  });
});
