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

test('evento que acaba às 00:00 do dia seguinte fica num só dia; eventos de vários dias não mudam', () => {
  const night = normalizeEvent({ id: 'n', summary: 'LCQ', start: { dateTime: '2025-11-07T20:00:00Z' }, end: { dateTime: '2025-11-08T00:00:00Z' }, description: 'TIPO: Qualificador' });
  assert.deepEqual([night.dateStart, night.dateEnd, night.timeStart, night.timeEnd], ['2025-11-07', '2025-11-07', '20:00', '00:00']);
  // Verão (UTC+1): 21:00–00:00 em Lisboa
  const summer = normalizeEvent({ id: 's', summary: 'x', start: { dateTime: '2026-07-10T20:00:00Z' }, end: { dateTime: '2026-07-10T23:00:00Z' }, description: 'TIPO: Outro' });
  assert.deepEqual([summer.dateStart, summer.dateEnd, summer.timeEnd], ['2026-07-10', '2026-07-10', '00:00']);
  const twoDays = normalizeEvent({ id: 't', summary: 'x', start: { dateTime: '2026-12-19T10:00:00Z' }, end: { dateTime: '2026-12-20T18:00:00Z' }, description: 'TIPO: Outro' });
  assert.deepEqual([twoDays.dateStart, twoDays.dateEnd], ['2026-12-19', '2026-12-20']);
  const toMidnightTwoDaysLater = normalizeEvent({ id: 'u', summary: 'x', start: { dateTime: '2026-12-19T10:00:00Z' }, end: { dateTime: '2026-12-21T00:00:00Z' }, description: 'TIPO: Outro' });
  assert.equal(toMidnightTwoDaysLater.dateEnd, '2026-12-21');
  const allDay = normalizeEvent({ id: 'a', summary: 'x', start: { date: '2027-01-15' }, end: { date: '2027-01-18' }, description: 'TIPO: Prerelease' });
  assert.deepEqual([allDay.dateStart, allDay.dateEnd], ['2027-01-15', '2027-01-17']);
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
  assert.equal(p.formato, 'Sealed'); // pré-releases são sempre Sealed
  assert.equal(p.formatoPendente, false);
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

test('épocas: R2 de 2026/27 ≠ R2 de 2027/28; a janela indica o RC para que apura (QUALIFICA do calendário prevalece)', async () => {
  const { applyRoundWindows } = await import('../scripts/build-data.mjs');
  const windows = [
    { circuit: 'RCQ', ronda: 'R2', season: '2026/27', start: '2026-08-15', end: '2026-11-29', qualifica: 'Regional Championship Bilbao' },
    { circuit: 'RCQ', ronda: 'R3', season: '2026/27', start: '2026-12-11', end: '2027-03-07' },
    { circuit: 'RCQ', ronda: 'R2', season: '2027/28', start: '2027-07-03', end: '2027-09-26' },
  ];
  const mk = (date, extra = '') => normalizeEvent({ id: date + extra, summary: 'RCQ', start: { date }, description: 'TIPO: RCQ\nRONDA: A confirmar' + extra });
  const [a, b, c, d] = applyRoundWindows([mk('2026-10-03'), mk('2027-08-14'), mk('2027-01-09'), mk('2026-11-01', '\nQUALIFICA: Outro RC')], windows);
  assert.deepEqual([a.ronda, a.epoca, a.qualifica], ['R2', '2026/27', 'Regional Championship Bilbao']);
  assert.deepEqual([b.ronda, b.epoca, b.qualifica], ['R2', '2027/28', null]);
  assert.deepEqual([c.ronda, c.epoca, c.qualifica], ['R3', '2026/27', null]);
  assert.equal(d.qualifica, 'Outro RC');
});

test('pré-releases sem FORMATO ficam Sealed; com FORMATO mantém-se o do calendário', () => {
  const a = normalizeEvent({ id: 'p1', summary: 'Prerelease X', start: { date: '2027-01-29' }, description: 'TIPO: Prerelease' });
  const b = normalizeEvent({ id: 'p2', summary: 'Prerelease Y', start: { date: '2027-01-29' }, description: 'TIPO: Prerelease\nFORMATO: Two-Headed Giant' });
  assert.equal(a.formato, 'Sealed');
  assert.equal(b.formato, 'Two-Headed Giant');
});

test('eventos antigos sem PREMIOS: prémios tirados dos detalhes originais, sem cabeçalhos nem formato/check-in', () => {
  const e = normalizeEvent({ id: 'old', summary: 'RCQ Praga - Magus', start: { date: '2026-01-31' }, description: 'TIPO: RCQ\nDETALHES ORIGINAIS:\nStandard 22€\nCheck-in: 10h00-10h30\nJudge: TBA\nPrémios (min 16 jogadores):\n1º lugar: 40€ em Store Credit\n• Promo Pack para o top 8\nTorneio com pausa para almoço e corte para Top 8\nPromo Manifold Mouse FOIL para o vencedor' });
  assert.deepEqual(e.premios, ['1º lugar: 40€ em Store Credit', 'Promo Pack para o top 8', 'Promo Manifold Mouse FOIL para o vencedor']);
  assert.equal(e.premiosDosDetalhes, true);
  const f = normalizeEvent({ id: 'new', summary: 'RCQ', start: { date: '2026-12-12' }, description: 'TIPO: RCQ\nPREMIOS:\n1º Carta X\nDETALHES ORIGINAIS:\n1º Carta Y' });
  assert.deepEqual(f.premios, ['1º Carta X']);
  assert.equal(f.premiosDosDetalhes, false);
});

test('dados reais (opcional, só local): todos os eventos lidos e todos os tipos reconhecidos', { skip: !existsSync(new URL('./fixtures/private/torneios-mtg-real.ics', import.meta.url)) }, async () => {
  const { events } = parseIcs(await readFile(new URL('./fixtures/private/torneios-mtg-real.ics', import.meta.url), 'utf8'));
  const norm = events.map(normalizeEvent);
  assert.ok(norm.length > 50, `${norm.length} eventos`);
  assert.equal(norm.filter(e => e.issues.some(i => i.level === 'erro')).length, 0);
  assert.equal(norm.filter(e => e.typeFamily === 'outro').length, 0);
});

// ---------- Vencedores a partir das listas oficiais (Google Docs) ----------
import { parseWinnersText, fetchWinners, splitStore, docExportUrl } from '../scripts/lib/winners.mjs';
import { updateWinners } from '../scripts/build-data.mjs';

test('vencedores: lê a secção «Vencedores» da lista da Round 2 e ignora os anúncios', async () => {
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(new URL('./fixtures/rcq-r2.txt', import.meta.url), 'utf8');
  const r = parseWinnersText(text, { round: 'R2' });
  assert.equal(r.length, 26);
  assert.deepEqual(r[0], { date: '2026-08-15', store: 'Ventura Games', city: 'Barreiro', name: 'Miguel Valente', deck: 'Dimir Midrange', players: 16, format: 'Standard', round: 'R2' });
  const sealed = r.find(x => x.name === 'Vitor Bessa');
  assert.deepEqual([sealed.date, sealed.store, sealed.city, sealed.deck, sealed.players, sealed.format], ['2026-08-30', 'Arena Porto', 'Porto', null, 26, 'Sealed The Hobbit']);
  const last = r.at(-1);
  assert.deepEqual([last.date, last.store, last.city, last.name, last.deck, last.players], ['2026-11-15', 'Mulligan Quarteira', 'Quarteira', 'Tiago Jesus', 'Azorius Momo', null]);
  assert.equal(r.find(x => x.name === 'Nuno Vale').city, 'Vila Nova de Famalicão', '«V.N. de Famalicão» por extenso');
  // Torneios anunciados sem vencedor (com preço, check-in, prémios) não entram.
  assert.ok(!r.some(x => ['2026-11-01', '2026-11-14', '2026-11-22'].includes(x.date)));
  assert.ok(!r.some(x => /check-in|judge|promo|http/i.test(x.name)));
  // A lista da Round 3 ainda não tem vencedores.
  assert.deepEqual(parseWinnersText(await readFile(new URL('./fixtures/rcq-r3.txt', import.meta.url), 'utf8'), { round: 'R3' }), []);
});

test('vencedores: Round 1 (Abril a Agosto) fica toda no 1.º ano da época', () => {
  const text = 'Season 26/27 Round 1 MODERN\n\nVencedores\n4 ABRIL (Sábado)\nVentura Games (Barreiro) - Modern (43 jogadores)\nEmanuel Noivo (Boros Energy)\n2 AGOSTO (Domingo)\nArena Porto - Modern (20 jogadores)\nAna Silva (Affinity)\n';
  assert.deepEqual(parseWinnersText(text, { round: 'R1' }).map(x => [x.round, x.date, x.store, x.players]), [
    ['R1', '2026-04-04', 'Ventura Games', 43],
    ['R1', '2026-08-02', 'Arena Porto', 20],
  ]);
});

test('vencedores: anos da época, lojas sem parênteses e quebras de linha do Google Docs', () => {
  const text = '﻿Season 26/27 Round 3 STANDARD\r\n\r\nVencedores\r\n13 DEZEMBRO (Domingo)\r\nArena Porto - Standard (30 jogadores)\r\nAna Silva (Izzet Prowess)\r\n10 JANEIRO (Domingo)\u000bZenith (Leiria) - Sealed Nauctis (12 jogadores)\u000bRui Costa\r\n';
  const r = parseWinnersText(text, { round: 'R3' });
  assert.deepEqual(r.map(x => [x.date, x.store, x.city, x.name, x.deck, x.players]), [
    ['2026-12-13', 'Arena Porto', 'Porto', 'Ana Silva', 'Izzet Prowess', 30],
    ['2027-01-10', 'Zenith', 'Leiria', 'Rui Costa', null, 12],
  ]);
  assert.deepEqual(splitStore('Mulligan Portimão'), { store: 'Mulligan Portimão', city: 'Portimão' });
  assert.deepEqual(splitStore('Loja Sem Cidade'), { store: 'Loja Sem Cidade', city: null });
  assert.deepEqual(parseWinnersText('Sem secção de vencedores'), []);
  assert.equal(docExportUrl('abc'), 'https://docs.google.com/document/d/abc/export?format=txt');
});

test('vencedores: erros de rede ou documento privado mantêm o ficheiro anterior', async () => {
  const { mkdtemp, writeFile, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'vencedores-'));
  const out = join(dir, 'winners.json');
  const before = { title: 'x', results: Array.from({ length: 10 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, store: 'Loja', city: 'Porto', name: 'N' + i, deck: null, players: 8 })) };
  await writeFile(out, JSON.stringify(before));
  const cfg = { title: 'RCQ · Época 2026/27', sources: [{ round: 'R2', docId: 'doc' }] };
  const ok = text => async () => ({ ok: true, status: 200, text: async () => text });
  // Documento privado (Google pede sessão) → mantém.
  let msg = await updateWinners(cfg, 'agora', { out, fetchImpl: async () => ({ ok: false, status: 401, text: async () => '' }) });
  assert.match(msg, /mantidos os 10 anteriores.*HTTP 401/);
  // Erro de rede → mantém.
  msg = await updateWinners(cfg, 'agora', { out, fetchImpl: async () => { throw new Error('offline'); } });
  assert.match(msg, /mantidos os 10 anteriores.*erro de rede/);
  // Lista quase vazia (ex.: secção apagada por engano) → mantém.
  msg = await updateWinners(cfg, 'agora', { out, fetchImpl: ok('Season 26/27\nVencedores\n1 SETEMBRO (Sábado)\nLoja (Porto) - Standard (8 jogadores)\nAlguém (Deck)\n') });
  assert.match(msg, /mantidos os anteriores/);
  assert.equal(JSON.parse(await readFile(out, 'utf8')).results.length, 10);
  // Lista boa → actualiza.
  const { readFile: rf } = await import('node:fs/promises');
  const real = await rf(new URL('./fixtures/rcq-r2.txt', import.meta.url), 'utf8');
  msg = await updateWinners(cfg, '2026-11-24T00:00:00Z', { out, fetchImpl: ok(real) });
  assert.match(msg, /Vencedores: 26/);
  const after = JSON.parse(await readFile(out, 'utf8'));
  assert.equal(after.title, 'RCQ · Época 2026/27');
  assert.equal(after.results.length, 26);
  assert.ok(after.results.every((r, i, a) => !i || a[i - 1].date <= r.date), 'por ordem de data');
  // fetchWinners devolve erro (sem lançar) se um documento falhar.
  const res = await fetchWinners([{ round: 'R2', docId: 'a' }], { fetchImpl: async () => ({ ok: false, status: 404 }) });
  assert.equal(res.results, null);
  assert.match(res.error, /HTTP 404/);
});

// ---------- Listas oficiais dos RCQs vs calendário ----------
import { parseAnnouncements, compareWithCalendar, rcqCheckMarkdown, storeKeyFor } from '../scripts/lib/rcq-check.mjs';

test('listas RCQ: lê os torneios anunciados (preço, check-in, juiz, vagas, link)', async () => {
  const { readFile } = await import('node:fs/promises');
  const r2 = parseAnnouncements(await readFile(new URL('./fixtures/rcq-r2.txt', import.meta.url), 'utf8'), { round: 'R2' });
  const r3 = parseAnnouncements(await readFile(new URL('./fixtures/rcq-r3.txt', import.meta.url), 'utf8'), { round: 'R3' });
  assert.equal(r2.length, 12); // 6 de 28–29 Nov + 6 anunciados na secção dos vencedores (1, 14 e 22 Nov)
  assert.equal(r3.length, 4);
  const lotus = r2.find(a => a.store === 'Lotus Valley');
  assert.deepEqual([lotus.date, lotus.city, lotus.format, lotus.price, lotus.vagas, lotus.checkin, lotus.judge], ['2026-11-28', 'Arruda dos Vinhos', 'Standard', 30, 32, '10:00–10:30', 'Daniel Candeias L2']);
  const magus = r2.find(a => a.store === 'Magus' && a.date === '2026-11-28');
  assert.equal(magus.judge, null, '«Judge: TBA» → sem juiz');
  assert.equal(magus.link, 'https://www.facebook.com/events/1817063529417416/');
  assert.deepEqual(r3.map(a => [a.date, a.store, a.format]), [['2026-12-13', 'Arena Porto', 'Standard'], ['2027-01-10', 'Arena Porto', 'Standard'], ['2027-02-07', 'Arena Porto', 'Sealed Nauctis'], ['2027-03-07', 'Arena Porto', 'Standard']]);
  assert.ok(!r2.some(a => a.store.includes('Ventura')), 'vencedores não são anúncios');
});

test('listas RCQ: diferenças com o calendário (loja, falta, sobra, dados) e iguais', () => {
  const ann = [
    { date: '2026-11-28', store: 'Templar Games', city: 'Tomar', format: 'Standard', price: 28, vagas: null, checkin: '14:00–14:30', judge: 'Filipe Silvestre L1', link: null, round: 'R2' },
    { date: '2026-11-28', store: 'End Turn', city: 'Avintes', format: 'Standard', price: 22, vagas: null, checkin: '09:30–10:00', judge: 'Diogo Ferreira L1', link: null, round: 'R2' },
    { date: '2026-11-29', store: 'Arena Porto', city: 'Porto', format: 'Standard', price: 21, vagas: null, checkin: '09:30–10:00', judge: null, link: 'https://x.pt/e', round: 'R2' },
    { date: '2026-12-13', store: 'Arena Porto', city: 'Porto', format: 'Standard', price: 21, vagas: null, checkin: '09:30–10:00', judge: null, link: null, round: 'R3' },
    { date: '2026-11-01', store: 'Passado', city: 'Porto', format: 'Standard', price: 21, round: 'R2' },
  ];
  const ev = (o) => ({ typeKey: 'rcq', scope: 'portugal', set: null, vagas: null, ligacao: null, juiz: null, ...o });
  const events = [
    ev({ dateStart: '2026-11-28', loja: 'Templars Arena Gamecenter', localidade: 'Rio de Mouro', formato: 'Standard', preco: 28, checkin: '14:00–14:30', juiz: 'Filipe Silvestre L1', ronda: 'R2' }),
    ev({ dateStart: '2026-11-28', loja: 'EndTurn', localidade: 'Avintes', formato: 'Standard', preco: 22, checkin: '09:30–10:00', juiz: 'Diogo Ferreira L1', ronda: 'R2' }),
    ev({ dateStart: '2026-11-29', loja: 'Arena Porto', localidade: 'Porto', formato: 'Standard', preco: 20, checkin: '09:30–10:00', ronda: 'R2' }),
    ev({ dateStart: '2027-01-17', loja: 'Zenith', localidade: 'Leiria', formato: 'Standard', preco: 20, ronda: 'R3' }),
    ev({ dateStart: '2026-12-05', loja: 'Outro circuito', localidade: 'Porto', formato: 'Pauper', typeKey: 'lpp' }),
  ];
  const r = compareWithCalendar(ann, events, '2026-11-24');
  assert.equal(r.checked, 4);
  assert.equal(r.ok, 1, 'End Turn igual (EndTurn no calendário conta como a mesma loja)');
  const kinds = r.problems.map(p => `${p.date} ${p.kind}`);
  assert.deepEqual(kinds, ['2026-11-28 loja', '2026-11-29 diferente', '2026-12-13 falta', '2027-01-17 sobra']);
  assert.match(r.problems[1].message, /preço: calendário 20 €, lista 21 €; ligação em falta/);
  const md = rcqCheckMarkdown(r);
  assert.match(md, /4 RCQs anunciados .* 1 iguais · 4 diferenças/);
  assert.match(md, /Templar Games \(Tomar\) — \*\*Loja diferente\*\*/);
  assert.match(rcqCheckMarkdown(null), /Não foi possível ler as listas/);
});

test('listas RCQ: a chave da loja é a mesma do site (app.js)', async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../site/assets/app.js', import.meta.url), 'utf8');
  // As duas implementações usam as mesmas palavras genéricas e aliases de cidade.
  assert.ok(app.includes("const STORE_STOPWORDS = /\\b(games?|gamestore|gamecenter|gaming|store|loja|de|jogos)\\b/g;"));
  assert.ok(app.includes("const CITY_ALIAS = { benfica: 'lisboa' };"));
  assert.equal(storeKeyFor('End Turn', 'Avintes'), storeKeyFor('EndTurn', 'Avintes'));
  assert.equal(storeKeyFor('Mulligan Quarteira', 'Quarteira'), storeKeyFor('Mulligan Games', 'Quarteira'));
  assert.equal(storeKeyFor('Arena Porto', 'Porto'), 'arena-porto');
  assert.notEqual(storeKeyFor('Templar Games', 'Tomar'), storeKeyFor('Templars Arena Gamecenter', 'Rio de Mouro'));
});

// ---------- Calendários para subscrever ----------
import { buildFeed, FEEDS, lisbonToUtc } from '../scripts/lib/feeds.mjs';

test('calendários para subscrever: eventos públicos, horas de Lisboa, linhas dobradas e filtros', () => {
  const base = { allDay: false, timeEnd: null, set: null, ronda: null, fase: null, checkin: null, preco: null, precoTexto: null, ligacao: null, qualifica: null, local: null, loja: null, localidade: null };
  const ev = [
    { ...base, id: 'a1', title: 'RCQ Standard - Loja Ção', tipo: 'RCQ', typeKey: 'rcq', scope: 'portugal', dateStart: '2027-07-10', dateEnd: '2027-07-10', timeStart: '10:00', timeEnd: '18:00', formato: 'Standard', ronda: 'R3', loja: 'Loja Ção', localidade: 'Tomar', local: 'Loja Ção, Rua Muito Comprida de Exemplo com Acentuação Portuguesa 123, 2300-000 Tomar, Portugal', preco: 22, checkin: '09:30–10:00' },
    { ...base, id: 'b2', title: 'Spotlight: Nauctis', tipo: 'Spotlight', typeKey: 'spotlight', scope: 'internacional', dateStart: '2027-03-13', dateEnd: '2027-03-14', allDay: true, timeStart: null, formato: 'Sealed', local: 'Zagrebe, Croácia', qualifica: 'Pro Tour Las Vegas' },
  ];
  const ics = buildFeed(ev, { name: 'Teste', siteUrl: 'https://exemplo.pt/', generatedAt: '2026-11-24T10:00:00Z' });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 2);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `linha com ${Buffer.byteLength(line)} octetos`);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.match(unfolded, /DTSTART:20270710T090000Z\r\nDTEND:20270710T170000Z/, 'Verão: UTC+1');
  assert.match(unfolded, /DTSTART;VALUE=DATE:20270313\r\nDTEND;VALUE=DATE:20270315/, 'vários dias: fim exclusivo');
  assert.match(unfolded, /LOCATION:Loja Ção\\, Rua Muito Comprida/, 'sem repetir o nome da loja');
  assert.match(unfolded, /Qualifica para: Pro Tour Las Vegas/);
  assert.match(unfolded, /URL:https:\/\/exemplo.pt\/\?t=a1/);
  assert.match(unfolded, /X-WR-CALNAME:Teste/);
  assert.equal(lisbonToUtc('2026-11-28', '10:00').toISOString(), '2026-11-28T10:00:00.000Z');
  assert.deepEqual(FEEDS.map(f => [f.file, ev.filter(f.filter).length]), [['calendar.ics', 2], ['calendar-rcq.ics', 1], ['calendar-internacional.ics', 1]]);
});

test('QUALIFICA: campo lido do calendário e público', async () => {
  const { readFile } = await import('node:fs/promises');
  const { parseIcs } = await import('../scripts/lib/ics.mjs');
  const { buildEvents, toPublic, PUBLIC_FIELDS } = await import('../scripts/build-data.mjs');
  const { events: raw } = parseIcs(await readFile(new URL('./fixtures/exemplo.ics', import.meta.url), 'utf8'));
  const spot = buildEvents(raw, []).events.map(toPublic).find(e => e.typeKey === 'spotlight');
  assert.equal(spot.qualifica, 'Pro Tour Exemplo');
  assert.ok(PUBLIC_FIELDS.includes('qualifica'));
});
