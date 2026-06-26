import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatWorkItemsLoadedLogMessage } from '../src/ado/work-items.js';

describe('formatWorkItemsLoadedLogMessage', () => {
  it('retorna string vazia sem work items', () => {
    assert.equal(formatWorkItemsLoadedLogMessage([]), '');
  });

  it('formata US e tasks com títulos e ids', () => {
    const message = formatWorkItemsLoadedLogMessage([
      { id: 100, type: 'User Story', title: 'CRUD de Talhões' },
      { id: 101, type: 'Task', title: 'Criar entidade' },
      { id: 102, type: 'Task', title: 'Adicionar testes' },
    ]);

    assert.equal(
      message,
      "Work Items carregados com sucesso: ['CRUD de Talhões' (#100)], [task 1: 'Criar entidade' (#101), task 2: 'Adicionar testes' (#102)]",
    );
  });

  it('coloca bugs e outros tipos no primeiro grupo', () => {
    const message = formatWorkItemsLoadedLogMessage([
      { id: 200, type: 'Bug', title: 'Corrigir login' },
      { id: 201, type: 'Task', title: 'Reproduzir cenário' },
    ]);

    assert.equal(
      message,
      "Work Items carregados com sucesso: ['Corrigir login' (#200)], [task 1: 'Reproduzir cenário' (#201)]",
    );
  });

  it('usa traço quando um dos grupos está vazio', () => {
    const onlyStory = formatWorkItemsLoadedLogMessage([
      { id: 300, type: 'User Story', title: 'Somente US' },
    ]);
    assert.equal(
      onlyStory,
      "Work Items carregados com sucesso: ['Somente US' (#300)], [—]",
    );

    const onlyTasks = formatWorkItemsLoadedLogMessage([
      { id: 401, type: 'Task', title: 'Task isolada' },
    ]);
    assert.equal(
      onlyTasks,
      "Work Items carregados com sucesso: [—], [task 1: 'Task isolada' (#401)]",
    );
  });
});
