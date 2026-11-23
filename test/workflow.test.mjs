// Testes de regressão do workflow de publicação (sem dependências: leitura de texto do YAML).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const wf = await readFile(new URL('../.github/workflows/publicar.yml', import.meta.url), 'utf8');

// Versões verificadas a 23/11/2026: todas declaram «runs.using: node24».
const NODE24 = {
  'actions/checkout': 5, 'actions/setup-node': 5, 'actions/configure-pages': 6,
  'actions/upload-pages-artifact': 5, 'actions/deploy-pages': 5,
};

test('actions em versões compatíveis com Node 24 (nada fica em Node 20)', () => {
  const uses = [...wf.matchAll(/uses:\s*([\w.-]+\/[\w.-]+)@v(\d+)/g)].map(m => [m[1], Number(m[2])]);
  assert.ok(uses.length >= 5);
  for (const [action, major] of uses) {
    assert.ok(action in NODE24, `action não verificada: ${action}`);
    assert.ok(major >= NODE24[action], `${action}@v${major} ainda usa Node 20 (mínimo v${NODE24[action]})`);
  }
});

test('agendamento a cada 30 minutos e execução manual mantidos', () => {
  assert.match(wf, /schedule:\s*\n\s*- cron: '7,37 \* \* \* \*'/);
  assert.match(wf, /workflow_dispatch:/);
});

test('segredo só nos passos de leitura e verificação; permissões mínimas', () => {
  const secretLines = wf.split('\n').filter(l => l.includes('secrets.CALENDAR_ICS_URL'));
  assert.equal(secretLines.length, 3); // verificação de configuração + leitura + verificação anti-fuga
  assert.match(wf, /^permissions:\s*\n\s*contents: read/m);
  assert.ok(!/contents: write/.test(wf));
  assert.match(wf, /persist-credentials: false/);
  assert.match(wf, /node scripts\/check-public\.mjs site/);
});
