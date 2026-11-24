// Verificação das listas oficiais dos RCQs contra o calendário.
// Compara os torneios anunciados nas listas (com preço «21€», check-in, juiz, link) com os RCQs do calendário
// e devolve as diferenças para o relatório de revisão. Nunca impede a publicação.

import { parseCheckin, parsePrice } from './normalize.mjs';
import { splitStore, seasonYear } from './winners.mjs';

const MONTHS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const plain = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const clean = text => String(text).replace(/^\uFEFF/, '').replace(/\r\n?|\u000b|\u2028/g, '\n').replace(/\u00a0/g, ' ').split('\n').map(l => l.trim());
const TBA = /^(tba|tbd|a confirmar|a anunciar|-|—)$/i;

// Mesma regra do site (app.js · storeKeyFor): nome sem palavras genéricas nem a cidade + localidade.
const STORE_STOPWORDS = /\b(games?|gamestore|gamecenter|gaming|store|loja|de|jogos)\b/g;
const CITY_ALIAS = { benfica: 'lisboa' };
const slug = v => plain(v).replace(/[^a-z0-9]+/g, '');
export function storeKeyFor(name, city) {
  if (!name || !city) return null;
  const c = CITY_ALIAS[slug(city)] || slug(city);
  let n = plain(name).replace(/['’]/g, '').replace(STORE_STOPWORDS, ' ');
  n = n.replace(new RegExp('\\b' + plain(city).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g'), ' ');
  const core = n.replace(/[^a-z0-9]+/g, '');
  return core ? `${core}-${c}` : null;
}

/** Torneios anunciados numa lista (com preço). Devolve [{ date, store, city, format, price, checkin, judge, vagas, link, round }]. */
export function parseAnnouncements(text, { round = null, season = null } = {}) {
  const lines = clean(text);
  const m = String(text).match(/Season\s+(\d{2})\s*\/\s*(\d{2})/i);
  if (!season && m) season = `20${m[1]}/${m[2]}`;
  const out = [];
  let date = null, cur = null;
  for (const line of lines) {
    if (!line) continue;
    const d = line.match(/^(\d{1,2})\s+([A-Za-zÇçÃãÉéÍíÓóÚúÂâÊêÔô]+)\b(?:\s*\(.*\))?\s*$/);
    if (d && MONTHS.includes(plain(d[2]))) {
      const month = MONTHS.indexOf(plain(d[2])) + 1;
      const year = seasonYear(season, month); // mesmo critério dos vencedores
      date = year ? `${year}-${String(month).padStart(2, '0')}-${String(Number(d[1])).padStart(2, '0')}` : null;
      cur = null;
      continue;
    }
    const ev = line.match(/^(.+?)\s+[-–]\s+(.+?)\s*(\d+(?:[.,]\d+)?)\s*€\s*(?:\((\d+)\s*vagas?\))?\s*$/i);
    if (ev && date) {
      cur = { date, ...splitStore(ev[1]), format: ev[2].trim(), price: Number(ev[3].replace(',', '.')), vagas: ev[4] ? Number(ev[4]) : null, checkin: null, judge: null, link: null, round };
      out.push(cur);
      continue;
    }
    if (/^.+\s+[-–]\s+\S/.test(line) && /jogadores|\b(standard|sealed|draft|pioneer|modern|pauper)\b/i.test(line)) { cur = null; continue; } // linha de vencedor
    if (!cur) continue;
    let m;
    if ((m = line.match(/^check-?in\s*:\s*(.+)$/i))) cur.checkin = parseCheckin(m[1]).text;
    else if ((m = line.match(/^(?:judge|juiz)\s*:\s*(.+)$/i))) cur.judge = TBA.test(m[1].trim()) ? null : m[1].trim();
    else if (/^<?https?:\/\/\S+>?$/i.test(line) && !cur.link) cur.link = line.replace(/^<|>$/g, '');
  }
  return out;
}

const fmtKey = s => plain(s).replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Compara anúncios (de hoje em diante) com os RCQs do calendário (eventos normalizados do importador).
 * Devolve { checked, ok, problems: [{ kind, date, store, message }] }.
 */
export function compareWithCalendar(announcements, events, today) {
  const ann = announcements.filter(a => a.date >= today);
  const cal = events.filter(e => e.typeKey === 'rcq' && e.scope === 'portugal' && e.dateStart >= today);
  const used = new Set();
  const problems = [];
  let ok = 0;
  const label = a => `${a.store}${a.city && !plain(a.store).includes(plain(a.city)) ? ` (${a.city})` : ''}`;
  for (const a of ann) {
    const key = storeKeyFor(a.store, a.city);
    let storeMismatch = false;
    let e = cal.find(x => !used.has(x) && x.dateStart === a.date && key && storeKeyFor(x.loja, x.localidade) === key);
    if (!e) {
      // Mesmo dia, mas loja/localidade diferentes (ex.: Templar Games de Tomar vs Templars Arena de Rio de Mouro).
      const sameDay = cal.filter(x => !used.has(x) && x.dateStart === a.date && fmtKey(x.formato) === fmtKey(a.format.split(' ')[0])
        && (x.preco == null || x.preco === a.price) && (!a.checkin || !x.checkin || x.checkin === a.checkin));
      if (sameDay.length === 1) {
        e = sameDay[0];
        storeMismatch = true;
        problems.push({ kind: 'loja', date: a.date, store: label(a), message: `no calendário está «${e.loja || '?'}${e.localidade ? ', ' + e.localidade : ''}»; na lista é «${label(a)}».` });
      } else {
        problems.push({ kind: 'falta', date: a.date, store: label(a), message: `está na lista (${a.format}, ${a.price} €) mas não no calendário.` });
        continue;
      }
    }
    used.add(e);
    const diffs = [];
    const fmtCal = [e.formato, e.set].filter(Boolean).join(' ');
    if (fmtKey(fmtCal) !== fmtKey(a.format)) diffs.push(`formato: calendário «${fmtCal || 'vazio'}», lista «${a.format}»`);
    if (e.preco !== a.price) diffs.push(`preço: calendário ${e.preco == null ? 'vazio' : e.preco + ' €'}, lista ${a.price} €`);
    if (a.checkin && e.checkin !== a.checkin) diffs.push(`check-in: calendário ${e.checkin || 'vazio'}, lista ${a.checkin}`);
    if (a.judge && plain(e.juiz || '') !== plain(a.judge)) diffs.push(`juiz: calendário ${e.juiz || 'a confirmar'}, lista ${a.judge}`);
    if (a.vagas && e.vagas !== a.vagas) diffs.push(`vagas: calendário ${e.vagas ?? 'vazio'}, lista ${a.vagas}`);
    if (a.link && !e.ligacao) diffs.push(`ligação em falta no calendário (lista: ${a.link})`);
    if (a.round && e.ronda && e.ronda !== a.round) diffs.push(`round: calendário ${e.ronda}, lista ${a.round}`);
    if (diffs.length) problems.push({ kind: 'diferente', date: a.date, store: label(a), message: diffs.join('; ') + '.' });
    else if (!storeMismatch) ok++;
  }
  for (const e of cal) {
    if (used.has(e)) continue;
    // Só se queixa de RCQs do calendário dentro das rounds que as listas cobrem.
    if (!announcements.some(a => a.round && a.round === e.ronda)) continue;
    problems.push({ kind: 'sobra', date: e.dateStart, store: e.loja || e.title, message: `RCQ no calendário (${e.ronda || 'sem round'}) que não está na lista.` });
  }
  problems.sort((a, b) => a.date.localeCompare(b.date));
  return { checked: ann.length, ok, problems };
}

export function rcqCheckMarkdown(result) {
  const lines = ['## Listas oficiais dos RCQs vs calendário', ''];
  if (!result) return [...lines, 'Não foi possível ler as listas nesta publicação.', ''].join('\n');
  lines.push(`${result.checked} RCQs anunciados (de hoje em diante) · ${result.ok} iguais · ${result.problems.length} diferenças.`, '');
  const names = { loja: 'Loja diferente', falta: 'Falta no calendário', sobra: 'Não está na lista', diferente: 'Dados diferentes' };
  for (const p of result.problems) lines.push(`- ${p.date} · ${p.store} — **${names[p.kind]}**: ${p.message}`);
  if (result.problems.length) lines.push('');
  return lines.join('\n');
}
