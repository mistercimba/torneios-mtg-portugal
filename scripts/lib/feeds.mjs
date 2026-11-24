// Calendários para subscrever (webcal): gerados em cada publicação, só com campos públicos.
// O endereço secreto do Google Calendar nunca é usado aqui.

const pad = n => String(n).padStart(2, '0');
const stamp = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const dateOnly = s => s.replace(/-/g, '');
const nextDay = s => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

/** Data + hora de Lisboa → Date (UTC). */
export function lisbonToUtc(date, time) {
  const [y, mo, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Lisbon', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(guess)).map(p => [p.type, p.value]));
  const asLisbon = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return new Date(guess - (asLisbon - guess));
}

const txt = v => String(v).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// Dobra linhas com mais de 75 octetos (RFC 5545), sem partir caracteres UTF-8.
function fold(line) {
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const euro = v => (Number.isInteger(v) ? `${v} €` : `${String(v.toFixed(2)).replace('.', ',')} €`);

function vevent(e, { siteUrl, generatedAt }) {
  const timed = !e.allDay && e.timeStart && e.dateStart === e.dateEnd;
  const lines = ['BEGIN:VEVENT', `UID:${e.id}@torneios-mtg-portugal`, `DTSTAMP:${stamp(new Date(generatedAt))}`];
  if (timed) {
    const start = lisbonToUtc(e.dateStart, e.timeStart);
    const end = e.timeEnd && e.timeEnd > e.timeStart ? lisbonToUtc(e.dateStart, e.timeEnd) : new Date(start.getTime() + 4 * 3600000);
    lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${dateOnly(e.dateStart)}`, `DTEND;VALUE=DATE:${dateOnly(nextDay(e.dateEnd))}`);
  }
  const local = e.local || e.localidade || '';
  const where = e.scope === 'portugal' && e.loja && !local.toLowerCase().includes(e.loja.toLowerCase()) ? [e.loja, local].filter(Boolean).join(', ') : local;
  const url = `${siteUrl}?t=${encodeURIComponent(e.id)}`;
  const info = [
    e.tipo + (e.ronda ? ' · ' + e.ronda : '') + (e.fase ? ' · ' + e.fase : ''),
    e.formato ? `Formato: ${e.formato}${e.set ? ' · ' + e.set : ''}` : null,
    e.checkin ? `Check-in: ${e.checkin}` : null,
    e.scope === 'portugal' ? `Inscrição: ${e.preco != null ? (e.preco === 0 ? 'Grátis' : euro(e.preco)) : (e.precoTexto || 'a confirmar')}` : null,
    e.qualifica ? `Qualifica para: ${e.qualifica}` : null,
    e.ligacao ? `Inscrição / anúncio: ${e.ligacao}` : null,
    `Detalhes: ${url}`,
  ].filter(Boolean).join('\n');
  lines.push(`SUMMARY:${txt(e.title)}`);
  if (where) lines.push(`LOCATION:${txt(where)}`);
  lines.push(`DESCRIPTION:${txt(info)}`, `URL:${url}`, 'END:VEVENT');
  return lines;
}

export const FEEDS = [
  { file: 'calendar.ics', name: 'Torneios MTG Portugal', filter: () => true },
  { file: 'calendar-rcq.ics', name: 'Torneios MTG Portugal · RCQs', filter: e => e.typeKey === 'rcq' },
  { file: 'calendar-internacional.ics', name: 'Torneios MTG Portugal · Internacionais', filter: e => e.scope === 'internacional' },
];

/** Gera o texto de um calendário (eventos públicos já filtrados por toPublic). */
export function buildFeed(events, { name, siteUrl, generatedAt }) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Torneios MTG Portugal//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${txt(name)}`, 'X-WR-TIMEZONE:Europe/Lisbon', `X-WR-CALDESC:${txt('Agenda de torneios de Magic: The Gathering em Portugal — ' + siteUrl)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'];
  for (const e of events) lines.push(...vevent(e, { siteUrl, generatedAt }));
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
