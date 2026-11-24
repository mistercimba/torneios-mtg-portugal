// Leitor mínimo de iCalendar (RFC 5545), sem dependências.
// Converte cada VEVENT num objecto "cru" comum ao adaptador da API do Google:
// { id, summary, description, location, status, start, end, recurrence }
// em que start/end são { date: 'YYYY-MM-DD' } ou { dateTime: ISO-UTC, timeZone }.

/** Desdobra linhas continuadas (linhas que começam por espaço ou tab). */
function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
}

/** Remove os escapes de TEXT: \n, \, \; \\ */
function unescapeText(value) {
  return value.replace(/\\([nN,;\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
}

function parseLine(line) {
  // NOME;PARAM=valor;PARAM2="v":VALOR — os dois pontos dentro de aspas não contam.
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ':' && !inQuotes) { colon = i; break; }
  }
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...rawParams] = head.split(';');
  const params = {};
  for (const p of rawParams) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value };
}

/** Diferença (ms) entre a hora local num fuso e UTC, para um instante. */
export function tzOffsetMs(timestamp, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date(timestamp)).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(timestamp / 1000) * 1000;
}

/** Converte hora "de parede" num fuso IANA para um instante UTC. */
export function zonedTimeToUtc(y, mo, d, h, mi, s, timeZone) {
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  let guess = wall - tzOffsetMs(wall, timeZone);
  // Segunda passagem resolve mudanças de hora (DST) perto do instante.
  guess = wall - tzOffsetMs(guess, timeZone);
  return guess;
}

function parseDateValue(prop, calendarTz) {
  const v = prop.value.trim();
  if (prop.params.VALUE === 'DATE' || /^\d{8}$/.test(v)) {
    return { date: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` };
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const tz = prop.params.TZID || calendarTz || 'Europe/Lisbon';
  const ts = z
    ? Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)
    : zonedTimeToUtc(+y, +mo, +d, +h, +mi, +s, tz);
  return { dateTime: new Date(ts).toISOString(), timeZone: tz };
}

export function parseIcs(text) {
  const lines = unfold(text).split('\n');
  const events = [];
  let calendarTz = null;
  let calendarName = null;
  let current = null;
  let depth = 0; // ignora VALARM e outros blocos dentro do VEVENT

  for (const raw of lines) {
    if (!raw.trim()) continue;
    const prop = parseLine(raw);
    if (!prop) continue;
    if (prop.name === 'BEGIN') {
      if (prop.value === 'VEVENT' && !current) { current = { _props: {} }; depth = 0; }
      else if (current) depth++;
      continue;
    }
    if (prop.name === 'END') {
      if (current && prop.value === 'VEVENT' && depth === 0) {
        events.push(finishEvent(current._props, calendarTz));
        current = null;
      } else if (current) depth--;
      continue;
    }
    if (!current) {
      if (prop.name === 'X-WR-TIMEZONE') calendarTz = prop.value.trim();
      if (prop.name === 'X-WR-CALNAME') calendarName = unescapeText(prop.value);
      continue;
    }
    if (depth > 0) continue;
    (current._props[prop.name] ||= []).push(prop);
  }
  return { calendarName, timeZone: calendarTz, events };
}

function finishEvent(props, calendarTz) {
  const one = name => props[name]?.[0];
  const text = name => (one(name) ? unescapeText(one(name).value) : undefined);
  const uid = text('UID') || '';
  const recurrenceId = one('RECURRENCE-ID');
  return {
    id: uid.replace(/@google\.com$/, '') + (recurrenceId ? `_${recurrenceId.value}` : ''),
    summary: text('SUMMARY') || '',
    description: text('DESCRIPTION') || '',
    location: text('LOCATION') || '',
    status: (text('STATUS') || 'CONFIRMED').toLowerCase(),
    visibility: (text('CLASS') || 'PUBLIC').toLowerCase(), // public | private | confidential
    start: one('DTSTART') ? parseDateValue(one('DTSTART'), calendarTz) : null,
    end: one('DTEND') ? parseDateValue(one('DTEND'), calendarTz) : null,
    recurrence: props.RRULE ? props.RRULE.map(p => p.value) : null,
    updated: text('LAST-MODIFIED') || null,
    created: text('CREATED') || null,
  };
}
