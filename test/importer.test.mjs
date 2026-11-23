import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parseIcs } from '../scripts/lib/ics.mjs';
import { normalizeEvent, descriptionToText, parseCheckin, parsePrice, flagDuplicates } from '../scripts/lib/normalize.mjs';

const ics = (body, extra = '') => `BEGIN:VCALENDAR\r\nX-WR-TIMEZONE:Europe/Lisbon\r\n${extra}BEGIN:VEVENT\r\n${body}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;

test('ICS: hora de Lisboa no Verão e no Inverno, linhas dobradas e escapes', () => {
  const { events } = parseIcs(ics([
    'UID:abc@google.com', 'DTSTART;TZID=Europe/Lisbon:20260830T100000', 'DTEND;TZID=Europe/Lisbon:20260830T180000',
    'SUMMARY:RCQ Standard\\, Magus', 'DESCRIPTION:TIPO: RCQ\\nFORMATO: Stan', ' dard',
  ].join('\r\n')));
  assert.equal(events[0].id, 'abc');
  assert.equal(events[0].start.dateTime, '2026-08-30T09:00:00.000Z'); // UTC+1
  assert.equal(events[0].summary, 'RCQ Standard, Magus');
  assert.equal(events[0].description, 'TIPO: RCQ\nFORMATO: Standard');
  const winter = normalizeEvent({ ...events[0], start: { dateTime: '2026-12-13T10:00:00Z' }, end: null });
  assert.equal(winter.timeStart, '10:00'); // UTC+0
});

test('ICS: dia inteiro com fim exclusivo e alarmes ignorados', () => {
  const { events } = parseIcs(ics('UID:x\r\nDTSTART;VALUE=DATE:20271203\r\nDTEND;VALUE=DATE:20271206\r\nSUMMARY:Worlds\r\nBEGIN:VALARM\r\nDESCRIPTION:alarme\r\nEND:VALARM'));
  const e = normalizeEvent(events[0]);
  assert.deepEqual([e.allDay, e.dateStart, e.dateEnd], [true, '2027-12-03', '2027-12-05']);
  assert.equal(events[0].description, '');
});

test('descrição em HTML do editor do Google', () => {
  const t = descriptionToText('<p>TIPO: Spotlight</p><p>LIGACAO: https://melee.gg/T/1</p><p>DETALHES ORIGINAIS:</p><p>Standard<br />&lt;https://melee.gg/T/1&gt;</p>');
  assert.equal(t, 'TIPO: Spotlight\nLIGACAO: https://melee.gg/T/1\nDETALHES ORIGINAIS:\nStandard\n<https://melee.gg/T/1>');
});

test('descrição mista: HTML com quebras de linha reais separa os prémios', () => {
  const e = normalizeEvent({ id: 'm', summary: 'x', start: { date: '2026-11-28' }, description: '<p>TIPO: RCQ</p><p>PREMIOS:\n1º Prémio A\n2º Prémio B</p><p>DETALHES ORIGINAIS:</p><p>Standard<br />Judge: TBA</p>' });
  assert.deepEqual(e.premios, ['1º Prémio A', '2º Prémio B']);
  assert.deepEqual(e.detalhesOriginais, ['Standard', 'Judge: TBA']);
});

const base = { id: '1', summary: 'Teste', start: { dateTime: '2026-11-28T10:30:00Z' }, end: { dateTime: '2026-11-28T18:30:00Z' } };

test('RCQ completo: preço, check-in, vagas, distrito pela localidade', () => {
  const e = normalizeEvent({ ...base, description: 'TIPO: RCQ\n\nFORMATO: Standard\n\nRONDA: r2\n\nLOJA: Magus\n\nLOCALIDADE: Vila Nova de Famalicão\n\nPRECO: 23,50 €\n\nCHECKIN: 10h00-10h20\n\nJUIZ: A confirmar\n\nVAGAS: 32' });
  assert.equal(e.scope, 'portugal');
  assert.equal(e.distrito, 'Braga');
  assert.equal(e.preco, 23.5);
  assert.equal(e.checkin, '10:00–10:20');
  assert.equal(e.ronda, 'R2');
  assert.equal(e.juiz, null); // «A confirmar» nunca é mostrado como nome
  assert.equal(e.vagas, 32);
  assert.equal(e.issues.length, 0);
});

test('«Check-in:» dentro dos detalhes originais não substitui CHECKIN', () => {
  const e = normalizeEvent({ ...base, description: 'TIPO: RCQ\nCHECKIN: 10h00-10h30\nDETALHES ORIGINAIS:\nCheck-in: 09h00-09h30\nJudge: TBA' });
  assert.equal(e.checkin, '10:00–10:30');
  assert.deepEqual(e.detalhesOriginais, ['Check-in: 09h00-09h30', 'Judge: TBA']);
});

test('janela de prerelease e anúncios são datas informativas', () => {
  const p = normalizeEvent({ ...base, start: { date: '2027-05-28' }, end: { date: '2027-05-31' }, description: 'TIPO: Prerelease\n\nFORMATO: A confirmar\n\nNOTAS: Janela geral de prerelease.' });
  assert.equal(p.scope, 'informativo');
  assert.equal(p.formato, null);
  assert.equal(p.formatoPendente, true);
  assert.equal(normalizeEvent({ ...base, description: 'TIPO: Anúncio' }).scope, 'informativo');
  const store = normalizeEvent({ ...base, description: 'TIPO: Prerelease\nFORMATO: Sealed\nLOJA: Magus\nLOCALIDADE: Braga' });
  assert.equal(store.scope, 'portugal');
});

test('eventos premier sem PAIS são internacionais; PAIS explícito prevalece', () => {
  assert.equal(normalizeEvent({ ...base, location: 'Baltimore', description: 'TIPO: Spotlight\nFORMATO: Standard' }).scope, 'internacional');
  assert.equal(normalizeEvent({ ...base, description: 'TIPO: Spotlight\nPAIS: Portugal\nLOCALIDADE: Lisboa' }).scope, 'portugal');
  assert.equal(normalizeEvent({ ...base, description: 'TIPO: LPP\nPAIS: Espanha\nLOCALIDADE: Vigo' }).scope, 'internacional');
});

test('LIGACAO na linha seguinte e LIGACAO cortada reparada pelos detalhes', () => {
  const a = normalizeEvent({ ...base, description: 'TIPO: Outro\nLIGACAO:\nhttps://exemplo.pt/evento#x' });
  assert.equal(a.ligacao, 'https://exemplo.pt/evento#x');
  const b = normalizeEvent({ ...base, description: 'TIPO: cEDH\nLIGACAO: https://topdeck.gg/event/abc-\nDETALHES ORIGINAIS:\n<https://topdeck.gg/event/abc-\ninvitational>' });
  assert.equal(b.ligacao, 'https://topdeck.gg/event/abc-invitational');
  assert.ok(b.issues.some(i => i.code === 'ligacao-reparada'));
});

test('valores desconhecidos não são inventados', () => {
  const e = normalizeEvent({ ...base, description: 'TIPO: LPP\nLOJA: Duelos de Honra' });
  assert.equal(e.localidade, null);
  assert.equal(e.distrito, null);
  assert.equal(e.preco, null);
  assert.ok(e.issues.some(i => i.code === 'localidade-em-falta'));
  assert.deepEqual(parsePrice('20 € / 25 € no dia'), { value: null, text: '20 € / 25 € no dia' });
  assert.equal(parseCheckin('9h').text, '09:00');
});

test('tipos novos funcionam com estilo genérico', () => {
  const e = normalizeEvent({ ...base, description: 'TIPO: Liga de Verão' });
  assert.equal(e.tipo, 'Liga de Verão');
  assert.equal(e.typeFamily, 'outro');
});

test('duplicados prováveis são assinalados', () => {
  const d = 'TIPO: RCQ\nLOJA: Magus\nLOCALIDADE: Braga';
  const list = flagDuplicates([normalizeEvent({ ...base, id: 'a', description: d }), normalizeEvent({ ...base, id: 'b', description: d })]);
  assert.ok(list.every(e => e.issues.some(i => i.code === 'duplicado')));
});

test('RCQ sem RONDA recebe a round pela janela oficial; fora das janelas fica vazio', async () => {
  const { applyRoundWindows } = await import('../scripts/build-data.mjs');
  const windows = [{ circuit: 'RCQ', ronda: 'R3', start: '2026-12-11', end: '2027-03-07' }];
  const mk = date => normalizeEvent({ id: date, summary: 'RCQ', start: { date }, end: null, description: 'TIPO: RCQ\nRONDA: A confirmar\nLOJA: X\nLOCALIDADE: Porto' });
  const [inside, outside] = applyRoundWindows([mk('2027-01-10'), mk('2026-12-05')], windows);
  assert.equal(inside.ronda, 'R3');
  assert.equal(inside.rondaDeduzida, true);
  assert.equal(outside.ronda, null);
  const explicit = applyRoundWindows([normalizeEvent({ id: 'e', summary: 'RCQ', start: { date: '2027-01-10' }, description: 'TIPO: RCQ\nRONDA: R2' })], windows)[0];
  assert.equal(explicit.ronda, 'R2'); // valor do calendário prevalece
});

test('dados reais (opcional, só local): 259 eventos, todos os tipos reconhecidos', { skip: !existsSync(new URL('./fixtures/private/torneios-mtg-real.ics', import.meta.url)) }, async () => {
  const { events } = parseIcs(await readFile(new URL('./fixtures/private/torneios-mtg-real.ics', import.meta.url), 'utf8'));
  const norm = events.map(normalizeEvent);
  assert.equal(norm.length, 259);
  assert.equal(norm.filter(e => e.issues.some(i => i.level === 'erro')).length, 0);
  assert.equal(norm.filter(e => e.typeFamily === 'outro').length, 0);
});
