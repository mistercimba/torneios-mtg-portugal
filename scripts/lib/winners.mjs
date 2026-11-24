// Vencedores dos RCQs a partir das listas oficiais (Google Docs «RCQs 26/27 R2/R3 STANDARD»).
// Os documentos são públicos («qualquer pessoa com o link»): lê-se a exportação em texto simples.
// Só se usa a secção «Vencedores»; os anúncios de torneios (com preço «21€», check-in, prémios) são ignorados.
//
// Formato esperado (como nos documentos):
//   15 AGOSTO (Sábado)
//   Ventura Games (Barreiro) - Standard (16 jogadores)
//   Miguel Valente (Dimir Midrange)
//
//   Mulligan Quarteira - Standard
//   Tiago Jesus (Azorius Momo)

import { districtFor } from './places.mjs';

const MONTHS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const plain = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const FORMAT_START = /^(standard|pioneer|modern|legacy|vintage|pauper|premodern|commander|cedh|sealed|draft|limited|team|booster|cube|jumpstart)\b/i;

export const docExportUrl = docId => `https://docs.google.com/document/d/${encodeURIComponent(docId)}/export?format=txt`;

/** Texto exportado → linhas limpas (sem BOM, quebras suaves, espaços duros). */
function lines(text) {
  return String(text).replace(/^\uFEFF/, '').replace(/\r\n?|\u000b|\u2028/g, '\n').replace(/\u00a0/g, ' ')
    .split('\n').map(l => l.trim().replace(/^[\u2022*\u00b7]\s+/, ''));
}

/** «Ventura Games (Barreiro)» → loja + localidade; sem parênteses, tenta a localidade no fim do nome («Arena Porto»). */
const expandCity = c => c.replace(/^V\.\s*N\.\s*/i, 'Vila Nova ').replace(/\s+/g, ' ').trim();

export function splitStore(raw) {
  const m = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (m) return { store: m[1].trim(), city: expandCity(m[2]) };
  const words = raw.trim().split(/\s+/);
  for (let n = Math.min(3, words.length - 1); n >= 1; n--) {
    const tail = words.slice(-n).join(' ');
    if (districtFor(tail)) return { store: raw.trim(), city: tail };
  }
  return { store: raw.trim(), city: null };
}

/**
 * Lê a secção «Vencedores» de uma lista. round: «R2», «R3»…
 * Devolve [{ date, store, city, name, deck, players, format, round }].
 */
export function parseWinnersText(text, { round = null } = {}) {
  const all = lines(text);
  const season = String(text).match(/Season\s+(\d{2})\s*\/\s*(\d{2})/i);
  const y1 = season ? 2000 + Number(season[1]) : null, y2 = season ? 2000 + Number(season[2]) : null;
  const start = all.findIndex(l => /^vencedores:?$/i.test(l));
  if (start < 0) return [];
  const results = [];
  let date = null, pending = null;
  for (const line of all.slice(start + 1)) {
    if (!line) continue;
    // Cabeçalho de data: «15 AGOSTO (Sábado)».
    const d = line.match(/^(\d{1,2})\s+([A-Za-zÇçÃãÉéÍíÓóÚúÂâÊêÔô]+)\b(?:\s*\(.*\))?\s*$/);
    if (d && MONTHS.includes(plain(d[2]))) {
      const month = MONTHS.indexOf(plain(d[2])) + 1;
      const year = y1 ? (month >= 7 ? y1 : y2) : null;
      date = year ? `${year}-${String(month).padStart(2, '0')}-${String(Number(d[1])).padStart(2, '0')}` : null;
      pending = null;
      continue;
    }
    // Linha do torneio: «Loja (Localidade) - Formato (N jogadores)»; com preço é um anúncio (ainda sem vencedor).
    const ev = line.match(/^(.+?)\s+[-–]\s+(.+)$/);
    if (ev && (FORMAT_START.test(ev[2]) || /\d+\s*jogadores|€/i.test(ev[2]))) {
      if (/€/.test(ev[2]) || !date) { pending = null; continue; }
      const players = ev[2].match(/\((\d+)\s*jogadores?\)/i);
      pending = { ...splitStore(ev[1]), format: ev[2].replace(/\(\s*\d+\s*jogadores?\s*\)/i, '').trim(), players: players ? Number(players[1]) : null };
      continue;
    }
    // Linha do vencedor: «Nome (Deck)» ou só «Nome».
    if (pending && !/^https?:\/\//i.test(line) && !/:/.test(line)) {
      const w = line.match(/^(.+?)(?:\s*\(([^)]+)\))?\s*$/);
      results.push({ date, store: pending.store, city: pending.city, name: w[1].trim(), deck: w[2] ? w[2].trim() : null, players: pending.players, format: pending.format, round });
      pending = null;
    }
  }
  return results;
}

/**
 * Junta os vencedores de várias listas. Erros de rede ou de leitura não param a publicação:
 * devolve { results: null, error } e o site mantém o winners.json anterior.
 */
export async function fetchWinners(sources, { fetchImpl = fetch } = {}) {
  const results = [];
  for (const s of sources || []) {
    let res;
    try {
      res = await fetchImpl(docExportUrl(s.docId), { headers: { 'user-agent': 'torneios-mtg-portugal-sync' }, redirect: 'follow' });
    } catch { return { results: null, error: `lista ${s.round}: erro de rede` }; }
    if (!res.ok) return { results: null, error: `lista ${s.round}: HTTP ${res.status} (o documento tem de estar partilhado com «qualquer pessoa com o link»)` };
    results.push(...parseWinnersText(await res.text(), { round: s.round }));
  }
  results.sort((a, b) => a.date.localeCompare(b.date));
  return { results, error: null };
}
