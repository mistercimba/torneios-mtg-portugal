#!/usr/bin/env node
// Gera site/data/events.json a partir do Google Calendar «Torneios MTG».
//
// Uso:
//   CALENDAR_ICS_URL=<endereço secreto iCal> node scripts/build-data.mjs
//   node scripts/build-data.mjs --input exportacao.ics        (ficheiro local, ICS ou JSON da API)
//
// Só lê o calendário. Nunca escreve no Google Calendar.
//
// SEGURANÇA
// - O endereço secreto vem apenas da variável de ambiente CALENDAR_ICS_URL.
//   Nunca é escrito em ficheiros nem em mensagens: todos os erros passam por redact().
// - O events.json é construído a partir de uma LISTA EXPLÍCITA de campos públicos
//   (PUBLIC_FIELDS). Um campo novo no importador só fica público se for acrescentado aí.
// - Eventos marcados como Privado/Confidencial no Calendar, ou com SITE: Não, não são publicados.
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIcs } from './lib/ics.mjs';
import { normalizeEvent, flagDuplicates } from './lib/normalize.mjs';
import { fetchWinners, fetchListTexts } from './lib/winners.mjs';
import { parseAnnouncements, compareWithCalendar, rcqCheckMarkdown } from './lib/rcq-check.mjs';
import { FEEDS, buildFeed } from './lib/feeds.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'site/data/events.json');
const REVIEW_DIR = resolve(ROOT, 'build');

/** Únicos campos que podem sair para o site público. */
export const PUBLIC_FIELDS = [
  'id', 'title', 'allDay', 'dateStart', 'dateEnd', 'timeStart', 'timeEnd',
  'tipo', 'typeKey', 'typeShort', 'typeFamily', 'scope',
  'formato', 'formatFamily', 'ronda', 'rondaDeduzida', 'epoca', 'fase',
  'loja', 'localidade', 'distrito', 'pais', 'local', 'set',
  'preco', 'precoTexto', 'checkin', 'juiz', 'vagas', 'ligacao',
  'premios', 'notas', 'detalhesOriginais', 'emRevisao', 'qualifica',
];

const SECRET = process.env.CALENDAR_ICS_URL || '';

/** Remove o endereço secreto (e qualquer endereço iCal privado) de um texto. */
export function redact(text, secret = SECRET) {
  let out = String(text ?? '');
  if (secret) {
    out = out.split(secret).join('[endereço iCal omitido]');
    out = out.split(encodeURIComponent(secret)).join('[endereço iCal omitido]');
  }
  return out
    .replace(/https?:\/\/calendar\.google\.com\/calendar\/ical\/\S+/gi, '[endereço iCal omitido]')
    .replace(/private-[0-9a-f]{16,}/gi, '[token omitido]');
}

/** ID público estável que não revela o ID interno do Google Calendar. */
export const publicId = rawId => createHash('sha256').update(`torneios-mtg:${rawId}`).digest('hex').slice(0, 12);

/** Evento normalizado → objecto público (só os campos permitidos). */
export function toPublic(e) {
  const out = {};
  const src = { ...e, id: publicId(e.id), emRevisao: !!e.rever };
  for (const k of PUBLIC_FIELDS) {
    const v = src[k];
    if (v === undefined || v === null || v === false || (Array.isArray(v) && !v.length)) continue;
    out[k] = v;
  }
  return out;
}

/** RCQ sem RONDA: atribui a round cuja janela oficial (config/site.json) contém a data.
 *  Todos os RCQs ficam também com a época da janela (ex.: R2 de 2026/27 ≠ R2 de 2027/28). */
export function applyRoundWindows(events, milestones) {
  const windows = milestones.filter(w => w.circuit === 'RCQ' && w.ronda);
  for (const e of events) {
    if (e.typeKey !== 'rcq') continue;
    if (!e.ronda) {
      const m = windows.find(w => w.start <= e.dateStart && e.dateStart <= w.end);
      if (m) {
        e.ronda = m.ronda;
        e.rondaDeduzida = true;
        e.issues = e.issues.filter(i => i.code !== 'ronda-em-falta');
        e.issues.push({ code: 'ronda-deduzida', level: 'info', message: `RONDA «A confirmar»; mostrada como ${m.ronda} pela janela ${m.start} a ${m.end}.` });
      }
    }
    if (!e.ronda) continue;
    // Época: a janela da mesma round que contém a data; senão, a última janela dessa round que já começou.
    const same = windows.filter(w => w.ronda === e.ronda && w.season);
    const m = same.find(w => w.start <= e.dateStart && e.dateStart <= w.end)
      || same.filter(w => w.start <= e.dateStart).sort((a, b) => b.start.localeCompare(a.start))[0];
    if (m) e.epoca = m.season;
    // RCQs de uma round apuram para o RC indicado na janela (o campo QUALIFICA do calendário prevalece).
    if (m && m.qualifica && !e.qualifica) e.qualifica = m.qualifica;
  }
  return events;
}

/** Eventos crus → eventos normalizados publicáveis, mais a contagem dos excluídos. */
export function buildEvents(raw, milestones = []) {
  const seen = new Set();
  const excluded = { privados: 0, ocultos: 0, cancelados: 0 };
  const kept = [];
  for (const r of raw) {
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    if (r.status === 'cancelled') { excluded.cancelados++; continue; }
    if (['private', 'confidential'].includes(String(r.visibility || '').toLowerCase())) { excluded.privados++; continue; }
    const e = normalizeEvent(r);
    if (!e.dateStart) continue;
    if (e.hidden) { excluded.ocultos++; continue; }
    kept.push(e);
  }
  const events = applyRoundWindows(flagDuplicates(kept), milestones).sort((a, b) =>
    a.dateStart.localeCompare(b.dateStart)
    || (a.timeStart || '').localeCompare(b.timeStart || '')
    || a.title.localeCompare(b.title, 'pt'));
  return { events, excluded };
}

const args = process.argv.slice(2);
const inputs = args.flatMap((a, i) => (a === '--input' ? [args[i + 1]] : []));
const force = args.includes('--force') || process.env.FORCE_SYNC === 'true';

async function loadRaw() {
  if (inputs.length) {
    const all = [];
    for (const file of inputs) {
      const text = await readFile(file, 'utf8');
      if (text.trimStart().startsWith('{')) {
        const json = JSON.parse(text);
        all.push(...(json.events || json.items || []).map(e => ({ ...e, summary: e.summary || '' })));
      } else {
        all.push(...parseIcs(text).events);
      }
    }
    return all;
  }
  if (!SECRET) throw new Error('Define CALENDAR_ICS_URL (endereço secreto iCal) ou usa --input <ficheiro>.');
  if (!/^https:\/\//i.test(SECRET)) throw new Error('CALENDAR_ICS_URL tem de começar por https://.');
  let res;
  try {
    res = await fetch(SECRET, { headers: { 'user-agent': 'torneios-mtg-portugal-sync' } });
  } catch {
    // A causa original pode conter o endereço; nunca é mostrada.
    throw new Error('Não foi possível contactar o Google Calendar (erro de rede).');
  }
  if (!res.ok) throw new Error(`O Google Calendar respondeu HTTP ${res.status}. Confirma o segredo CALENDAR_ICS_URL.`);
  const text = await res.text();
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('A resposta não é um ficheiro iCal válido. Confirma o segredo CALENDAR_ICS_URL.');
  return parseIcs(text).events;
}

/** Nº de eventos da última publicação (lido do site publicado), para a protecção anti-esvaziamento. */
async function previousCount() {
  const url = process.env.PREVIOUS_EVENTS_URL;
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()).count ?? null;
  } catch { return null; }
}

/** Relatório de revisão. Vai para o resumo do Actions, que é público num repositório público:
 *  só contém títulos, datas e nomes de campos — nada que o site não mostre já (o texto de REVER fica de fora). */
function reviewMarkdown(events, excluded, generatedAt) {
  const withIssues = events.filter(e => e.issues.length);
  const byCode = {};
  for (const e of withIssues) for (const i of e.issues) (byCode[i.code] ||= []).push({ e, i });
  const lines = [
    `# Revisão do calendário — ${generatedAt}`, '',
    `${events.length} eventos publicados · ${withIssues.length} com observações · não publicados: ${excluded.privados} privados/confidenciais, ${excluded.ocultos} com SITE: Não, ${excluded.cancelados} cancelados.`, '',
  ];
  const order = ['erro', 'aviso', 'info'];
  const codes = Object.keys(byCode).sort((a, b) =>
    order.indexOf(byCode[a][0].i.level) - order.indexOf(byCode[b][0].i.level) || a.localeCompare(b));
  for (const code of codes) {
    const items = byCode[code];
    lines.push(`## ${code} (${items.length}) — ${items[0].i.level}`, '');
    for (const { e, i } of items.slice(0, 60)) lines.push(`- ${e.dateStart} · ${e.title} — ${i.message}`);
    if (items.length > 60) lines.push(`- … mais ${items.length - 60}`);
    lines.push('');
  }
  return lines.join('\n');
}

const WINNERS_OUT = resolve(ROOT, 'site/data/winners.json');

/** Actualiza site/data/winners.json a partir das listas; mantém o ficheiro anterior se algo correr mal. */
export async function updateWinners(cfg, generatedAt, { fetchImpl = fetch, out = WINNERS_OUT, lists = null } = {}) {
  let previous = [];
  try { previous = JSON.parse(await readFile(out, 'utf8')).results || []; } catch { /* sem ficheiro anterior */ }
  const { results, error } = await fetchWinners(cfg.sources, { fetchImpl, lists });
  if (error) return `Vencedores: mantidos os ${previous.length} anteriores (${error}).`;
  if (previous.length >= 6 && results.length < previous.length * 0.5) return `Vencedores: a lista devolveu ${results.length} (antes ${previous.length}); mantidos os anteriores.`;
  await writeFile(out, JSON.stringify({ title: cfg.title || '', generatedAt, results }, null, 1) + '\n');
  return `Vencedores: ${results.length} (listas ${cfg.sources.map(s => s.round).join(', ')}).`;
}

async function main() {
  const config = JSON.parse(await readFile(resolve(ROOT, 'config/site.json'), 'utf8'));
  const raw = await loadRaw();
  const { events, excluded } = buildEvents(raw, config.milestones || []);
  if (!events.length) throw new Error('O calendário não devolveu eventos públicos; publicação cancelada.');

  // Protecção contra um segredo errado ou um calendário esvaziado por engano.
  const prev = await previousCount();
  if (prev != null && prev >= 20 && events.length < prev * 0.5 && !force) {
    throw new Error(`Eventos caíram de ${prev} para ${events.length}. Corre o workflow com «force» se for intencional.`);
  }

  const generatedAt = new Date().toISOString();
  const payload = { generatedAt, timeZone: 'Europe/Lisbon', count: events.length, milestones: config.milestones || [], events: events.map(toPublic) };
  const json = JSON.stringify(payload, null, 1) + '\n';
  if (redact(json) !== json) throw new Error('Verificação de segurança falhou: o events.json conteria um endereço iCal privado.');

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, json);

  // Calendários para subscrever (todos, só RCQs, só internacionais), com os mesmos campos públicos.
  const siteUrl = config.siteUrl || 'https://mistercimba.github.io/torneios-mtg-portugal/';
  for (const f of FEEDS) {
    const ics = buildFeed(payload.events.filter(f.filter), { name: f.name, siteUrl, generatedAt });
    if (redact(ics) !== ics) throw new Error(`Verificação de segurança falhou: ${f.file} conteria um endereço iCal privado.`);
    await writeFile(resolve(ROOT, 'site', f.file), ics);
  }

  // Listas oficiais dos RCQs (só na sincronização real): vencedores + verificação contra o calendário.
  // Um erro aqui nunca impede a publicação.
  let rcqSection = '';
  const listsCfg = config.rcqLists;
  if (!inputs.length && listsCfg?.sources?.length) {
    const lists = await fetchListTexts(listsCfg.sources);
    console.log(await updateWinners(listsCfg, generatedAt, { lists }));
    let check = null;
    if (!lists.error) {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
      check = compareWithCalendar(lists.texts.flatMap(t => parseAnnouncements(t.text, { round: t.round })), events, today);
      console.log(`Listas RCQ: ${check.checked} anunciados · ${check.ok} iguais · ${check.problems.length} diferenças.`);
    }
    rcqSection = '\n' + rcqCheckMarkdown(check);
  }

  const review = redact(reviewMarkdown(events, excluded, generatedAt) + rcqSection);
  await mkdir(REVIEW_DIR, { recursive: true });
  await writeFile(resolve(REVIEW_DIR, 'review.md'), review);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, review);

  const scopes = events.reduce((acc, e) => ((acc[e.scope] = (acc[e.scope] || 0) + 1), acc), {});
  console.log(`OK: ${events.length} eventos (${Object.entries(scopes).map(([k, v]) => `${k} ${v}`).join(', ')}).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(`ERRO: ${redact(err && err.message)}`); process.exit(1); });
}
