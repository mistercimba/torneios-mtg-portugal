// Testes de segurança: o endereço secreto nunca sai, e o events.json só tem campos públicos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseIcs } from '../scripts/lib/ics.mjs';
import { buildEvents, toPublic, redact, publicId, PUBLIC_FIELDS } from '../scripts/build-data.mjs';

const run = promisify(execFile);
const FAKE = 'https://calendar.google.com/calendar/ical/abc%40group.calendar.google.com/private-0123456789abcdef0123456789abcdef/basic.ics';

async function syntheticPublic() {
  const { events: raw } = parseIcs(await readFile(new URL('./fixtures/exemplo.ics', import.meta.url), 'utf8'));
  const { events, excluded } = buildEvents(raw, [{ circuit: 'RCQ', ronda: 'R3', start: '2026-12-11', end: '2027-03-07' }]);
  return { raw, events, excluded, pub: events.map(toPublic) };
}

test('redact() remove o endereço secreto, a versão codificada e qualquer token privado', () => {
  const msg = `falhou ${FAKE} e ${encodeURIComponent(FAKE)} e private-ffffffffffffffffffff`;
  const out = redact(msg, FAKE);
  assert.ok(!out.includes('private-0123'));
  assert.ok(!out.includes('private-ffff'));
  assert.ok(!out.includes('calendar/ical'));
});

test('um erro de rede não mostra o endereço nos logs', { timeout: 60000 }, async () => {
  const r = await run(process.execPath, ['scripts/build-data.mjs'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, CALENDAR_ICS_URL: FAKE, GITHUB_STEP_SUMMARY: '' }, timeout: 55000,
  }).catch(e => e);
  const output = `${r.stdout || ''}${r.stderr || ''}`;
  assert.ok(output.includes('ERRO'), output);
  assert.ok(!output.includes('private-0123'), output);
  assert.ok(!output.includes('abc%40group'), output);
});

test('events.json só contém campos da lista pública', async () => {
  const { pub } = await syntheticPublic();
  for (const e of pub) for (const k of Object.keys(e)) assert.ok(PUBLIC_FIELDS.includes(k), `campo não público: ${k}`);
});

test('eventos privados, com SITE: Não e cancelados não são publicados', async () => {
  const { pub, excluded } = await syntheticPublic();
  const titles = pub.map(e => e.title);
  assert.ok(!titles.includes('Evento privado de teste'));
  assert.ok(!titles.includes('Evento oculto do site'));
  assert.ok(!titles.includes('Evento cancelado'));
  assert.deepEqual(excluded, { privados: 1, ocultos: 1, cancelados: 1 });
});

test('texto de REVER, descrição crua e IDs do Google não chegam ao público', async () => {
  const { raw, pub } = await syntheticPublic();
  const json = JSON.stringify(pub);
  assert.ok(!json.includes('Texto interno de revisão'));
  assert.ok(!json.includes('TIPO:'));
  for (const r of raw) assert.ok(!json.includes(`"${r.id}"`), `ID interno exposto: ${r.id}`);
  const q = pub.find(e => e.title === 'Qualificador Exemplo');
  assert.equal(q.emRevisao, true);
  assert.equal(q.id, publicId('ex14'));
});

test('fixture sintética cobre todos os tipos e casos do calendário', async () => {
  const { pub } = await syntheticPublic();
  const types = new Set(pub.map(e => e.tipo));
  for (const t of ['RCQ', 'LPP', 'LLL', 'cEDH', 'Prerelease', 'Spotlight', 'Regional Championship', 'Pro Tour', 'World Championship', 'Qualificador', 'Campeonato / Evento especial', 'Anúncio', 'Paupergeddon', 'Liga de Verão']) {
    assert.ok(types.has(t), t);
  }
  const sul = pub.find(e => e.title === 'RCQ Sealed - Loja Exemplo Sul');
  assert.equal(sul.ligacao, 'https://exemplo.pt/eventos/rcq-sealed-sul');
  assert.equal(sul.ronda, 'R3');
  assert.equal(sul.rondaDeduzida, true);
  assert.equal(pub.find(e => e.title === 'Prerelease Edição Exemplo').scope, 'informativo');
  assert.equal(pub.find(e => e.title === 'Prerelease Edição Exemplo - Loja Exemplo Norte').scope, 'portugal');
});
