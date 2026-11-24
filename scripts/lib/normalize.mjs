// Converte eventos "crus" (ICS ou API do Google) no modelo usado pelo site,
// e recolhe avisos de revisão. Regra de ouro: nunca inventar valores.
import { districtFor, isPortugal, normalizeKey } from './places.mjs';

const TZ = 'Europe/Lisbon';

// Campos reconhecidos na descrição. Nomes em maiúsculas, como no template;
// aceitam-se as variantes com acentos. "Check-in:" (minúsculas) nos detalhes
// originais NÃO é um campo — por isso a comparação é sensível a maiúsculas.
const FIELD_ALIASES = {
  TIPO: 'tipo', FORMATO: 'formato', RONDA: 'ronda', FASE: 'fase', LOJA: 'loja',
  LOCALIDADE: 'localidade', DISTRITO: 'distrito', PAIS: 'pais', 'PAÍS': 'pais',
  SET: 'set', PRECO: 'preco', 'PREÇO': 'preco', CHECKIN: 'checkin', 'CHECK-IN': 'checkin',
  JUIZ: 'juiz', 'JUÍZ': 'juiz', VAGAS: 'vagas', LIGACAO: 'ligacao', 'LIGAÇÃO': 'ligacao',
  PREMIOS: 'premios', 'PRÉMIOS': 'premios', NOTAS: 'notas',
  QUALIFICA: 'qualifica', 'QUALIFICA PARA': 'qualifica',
  'DETALHES ORIGINAIS': 'detalhes', REVER: 'rever', SITE: 'site',
};
const FIELD_RE = new RegExp(
  `^\\s*(${Object.keys(FIELD_ALIASES).sort((a, b) => b.length - a.length)
    .map(k => k.replace(/[-]/g, '\\-')).join('|')})\\s*:\\s*(.*)$`,
);

// Catálogo de tipos. "short" é o texto da etiqueta; "family" decide a cor.
// Tipos novos no calendário funcionam na mesma (etiqueta = TIPO, família "outro").
export const TYPE_CATALOG = {
  'rcq': { label: 'RCQ', short: 'RCQ', family: 'rcq' },
  'lpp': { label: 'LPP', short: 'LPP', family: 'lpp' },
  'lll': { label: 'LLL', short: 'LLL', family: 'lll' },
  'cedh': { label: 'cEDH', short: 'cEDH', family: 'cedh' },
  'prerelease': { label: 'Prerelease', short: 'Prerelease', family: 'prerelease' },
  'qualificador': { label: 'Qualificador', short: 'Qualificador', family: 'qualificador' },
  'spotlight': { label: 'Spotlight', short: 'Spotlight', family: 'premier', premier: true },
  'regional championship': { label: 'Regional Championship', short: 'RC', family: 'premier', premier: true },
  'pro tour': { label: 'Pro Tour', short: 'Pro Tour', family: 'premier', premier: true },
  'world championship': { label: 'World Championship', short: 'Worlds', family: 'premier', premier: true },
  'campeonato / evento especial': { label: 'Campeonato / Evento especial', short: 'Especial', family: 'especial' },
  'paupergeddon': { label: 'Paupergeddon', short: 'Paupergeddon', family: 'especial', premier: true },
  'anuncio': { label: 'Anúncio', short: 'Anúncio', family: 'info' },
  'outro': { label: 'Outro', short: 'Outro', family: 'outro' },
};

// Circuitos locais: sem outra indicação, assume-se torneio em Portugal (e avisa-se se faltar a localidade).
const LOCAL_CIRCUITS = new Set(['rcq', 'lpp', 'lll', 'cedh', 'qualificador']);

const PENDING = new Set(['a confirmar', 'tba', 'tbd', 'a anunciar', 'por confirmar', '?', '-', '—']);
const isPending = v => PENDING.has(normalizeKey(v));
const clean = v => {
  if (v == null) return null;
  const s = String(v).trim();
  return s && !isPending(s) ? s : null;
};

// ---------- descrição ----------

const SOFT = '\u0000'; // marcador interno de quebra de linha "suave"
const LIST_FIELDS = new Set(['premios', 'notas']);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Descrição do Google (HTML do editor ou texto simples) → texto com quebras de linha. */
export function descriptionToText(desc) {
  if (!desc) return '';
  let s = String(desc);
  if (/<\/?(p|br|div|span|a|b|i|u|ul|ol|li|strong|em|h\d)\b[^>]*>/i.test(s)) {
    // Quebras de linha reais dentro do HTML ficam marcadas como "suaves" (SOFT): nos campos
    // de lista (PREMIOS, NOTAS) separam itens; nos restantes valem um espaço.
    s = s.replace(/\r?\n/g, SOFT)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h\d)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, '');
  }
  s = decodeEntities(s).replace(/ /g, ' ');
  return s.split('\n').map(l => l.replace(/\s+$/, '')).join('\n').trim();
}

/** Texto → { campo: [linhas] } mais as linhas soltas antes do primeiro campo. */
export function parseFields(text) {
  const fields = {};
  const loose = [];
  let current = null;
  for (const fullLine of text.split('\n')) {
    const [line, ...soft] = fullLine.split(SOFT);
    parseLine(line);
    for (const seg of soft) {
      if (!seg.trim()) continue;
      const target = current ? fields[current] : loose;
      if ((current && LIST_FIELDS.has(current)) || !target.length) target.push(seg.trim());
      else target[target.length - 1] += ' ' + seg.trim();
    }
  }
  return { fields, loose };

  function parseLine(line) {
    const m = line.match(FIELD_RE);
    if (m) {
      current = FIELD_ALIASES[m[1]];
      fields[current] ||= [];
      if (m[2].trim()) fields[current].push(m[2].trim());
      return;
    }
    if (!line.trim()) return;
    if (current) fields[current].push(line.trim());
    else loose.push(line.trim());
  }
}

// ---------- valores ----------

export function parsePrice(raw) {
  const s = clean(raw);
  if (!s) return { value: null, text: null };
  if (/gr[aá]tis|gratuit|free/i.test(s)) return { value: 0, text: null };
  const m = s.match(/^(\d+(?:[.,]\d{1,2})?)\s*(€|eur|euros?)?$/i);
  if (m) return { value: Number(m[1].replace(',', '.')), text: null };
  return { value: null, text: s }; // ex.: "20 € / 25 € no dia" — mostra-se tal como está
}

const hhmm = t => {
  const m = String(t).trim().match(/^(\d{1,2})\s*[h:.]\s*(\d{2})?$/i);
  if (!m) return null;
  const h = +m[1], mi = m[2] ? +m[2] : 0;
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
};

export function parseCheckin(raw) {
  const s = clean(raw);
  if (!s) return { from: null, to: null, text: null };
  const parts = s.split(/\s*[-–—a]\s*|\s+às\s+/i).filter(Boolean);
  if (parts.length === 2 && hhmm(parts[0]) && hhmm(parts[1])) {
    return { from: hhmm(parts[0]), to: hhmm(parts[1]), text: `${hhmm(parts[0])}–${hhmm(parts[1])}` };
  }
  if (parts.length === 1 && hhmm(parts[0])) return { from: hhmm(parts[0]), to: null, text: hhmm(parts[0]) };
  return { from: null, to: null, text: s };
}

const slug = s => normalizeKey(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Formato → família de cor. */
export function formatFamily(format) {
  const k = normalizeKey(format);
  if (!k) return 'outro';
  if (/sealed|draft|limited/.test(k)) return 'limited';
  for (const f of ['standard', 'modern', 'pioneer', 'pauper', 'legacy', 'vintage', 'premodern', 'cedh', 'commander']) {
    if (k.includes(f)) return f;
  }
  return 'outro';
}

// ---------- datas ----------

const lisbonParts = iso => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function normalizeDates(start, end) {
  if (!start) return null;
  if (start.date) {
    const last = end?.date ? addDays(end.date, -1) : start.date; // fim exclusivo no Calendar
    return { allDay: true, dateStart: start.date, dateEnd: last < start.date ? start.date : last, timeStart: null, timeEnd: null };
  }
  const s = lisbonParts(start.dateTime);
  const e = end?.dateTime ? lisbonParts(end.dateTime) : s;
  // Um evento que termina exactamente às 00:00 do dia seguinte (ex.: 20:00–00:00) não é de vários dias.
  const endsAtMidnight = e.time === '00:00' && e.date === addDays(s.date, 1) && s.time !== '00:00';
  return { allDay: false, dateStart: s.date, dateEnd: endsAtMidnight ? s.date : e.date, timeStart: s.time, timeEnd: e.time, instantStart: new Date(start.dateTime).toISOString() };
}

// ---------- ligações ----------

const URL_RE = /https?:\/\/[^\s<>"]+/;

/** Junta URLs partidos em várias linhas dentro de < > (vindos da migração). */
function wrappedUrls(text) {
  const out = [];
  for (const m of String(text).matchAll(/<(https?:\/\/[^>]+)>/g)) out.push(m[1].replace(/\s+/g, ''));
  return out;
}

// ---------- evento ----------

export function normalizeEvent(raw) {
  const issues = [];
  const issue = (code, message, level = 'aviso') => issues.push({ code, level, message });

  const text = descriptionToText(raw.description);
  const { fields, loose } = parseFields(text);
  const single = k => (fields[k] ? fields[k].join(' ').trim() : null);
  const list = k => (fields[k] || []).map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);

  const tipoRaw = clean(single('tipo'));
  const typeKey = normalizeKey(tipoRaw);
  const known = TYPE_CATALOG[typeKey];
  const type = known
    ? { key: typeKey, ...known }
    : { key: tipoRaw ? slug(tipoRaw) : 'outro', label: tipoRaw || 'Outro', short: tipoRaw || 'Outro', family: 'outro' };
  if (!tipoRaw) issue('tipo-em-falta', 'Sem campo TIPO; tratado como «Outro».');
  else if (!known) issue('tipo-novo', `TIPO «${tipoRaw}» não está no catálogo; aparece com estilo genérico.`, 'info');

  const dates = normalizeDates(raw.start, raw.end);
  if (!dates) issue('data-invalida', 'Data de início ilegível.', 'erro');

  const formatoRaw = single('formato');
  const formato = clean(formatoRaw);
  const loja = clean(single('loja'));
  const localidade = clean(single('localidade'));
  const paisRaw = clean(single('pais'));
  const distritoCampo = clean(single('distrito'));
  const distritoTabela = districtFor(localidade);
  const distrito = distritoCampo || distritoTabela;

  // Âmbito: torneio em Portugal, evento internacional, ou data informativa.
  let scope;
  if (type.key === 'anuncio') scope = 'informativo';
  else if (type.key === 'prerelease' && !loja && !localidade) scope = 'informativo';
  else if (paisRaw) scope = isPortugal(paisRaw) ? 'portugal' : 'internacional';
  else if (distrito) scope = 'portugal';
  else if (type.premier) scope = 'internacional';
  else if (loja || localidade || LOCAL_CIRCUITS.has(type.key)) scope = 'portugal';
  else if (raw.location) {
    scope = 'internacional';
    issue('ambito-deduzido', 'Sem LOJA, LOCALIDADE nem PAIS; considerado internacional pela localização do Calendar.', 'info');
  } else scope = 'informativo';

  if (scope === 'portugal') {
    if (!localidade) issue('localidade-em-falta', 'Torneio em Portugal sem LOCALIDADE (não aparece no filtro de distrito).');
    else if (!distrito) issue('distrito-desconhecido', `Localidade «${localidade}» não está na tabela de distritos (scripts/lib/places.mjs).`);
    if (distritoCampo && distritoTabela && distritoCampo !== distritoTabela) {
      issue('distrito-divergente', `DISTRITO «${distritoCampo}» difere da tabela («${distritoTabela}»); usado o do calendário.`);
    }
  }

  // Ligação: valor na mesma linha ou na seguinte; reparar se vier partida.
  const ligRaw = single('ligacao');
  let ligacao = ((fields.ligacao || []).join('').match(URL_RE) || [null])[0];
  const fromDetails = wrappedUrls((fields.detalhes || []).join('\n')).concat(wrappedUrls(text));
  if (ligacao) {
    const longer = fromDetails.find(u => u.startsWith(ligacao) && u.length > ligacao.length);
    if (longer) {
      issue('ligacao-reparada', 'LIGACAO estava cortada; completada a partir de DETALHES ORIGINAIS.', 'info');
      ligacao = longer;
    }
  } else if (ligRaw) {
    issue('ligacao-invalida', `LIGACAO sem URL válido: «${ligRaw}».`);
  }

  const preco = parsePrice(single('preco'));
  const checkin = parseCheckin(single('checkin'));
  if (single('checkin') && checkin.text && !checkin.from) issue('checkin-formato', `CHECKIN em formato não reconhecido: «${single('checkin')}».`, 'info');
  if (checkin.from && dates?.timeStart && checkin.from > dates.timeStart) {
    issue('checkin-depois-inicio', `Check-in (${checkin.from}) começa depois da hora de início do Calendar (${dates.timeStart}).`);
  }

  const vagasRaw = clean(single('vagas'));
  const vagas = vagasRaw && /^\d+$/.test(vagasRaw) ? Number(vagasRaw) : null;
  if (vagasRaw && vagas == null) issue('vagas-formato', `VAGAS não é um número: «${vagasRaw}».`, 'info');

  const ronda = clean(single('ronda'));
  const rondaNorm = ronda && /^r?\s*(\d+)$/i.test(ronda) ? `R${ronda.match(/\d+/)[0]}` : ronda;
  if (type.key === 'rcq' && !rondaNorm) issue('ronda-em-falta', 'RCQ sem RONDA definida.', 'info');

  if (!formato && scope === 'portugal') issue('formato-em-falta', 'Torneio sem FORMATO confirmado.', 'info');

  const rever = fields.rever?.length ? fields.rever.join(' ') : null;
  if (rever) issue('rever', 'Campo REVER preenchido (o texto não é publicado).');

  // SITE: valores que pedem para não publicar. Por omissão, publica.
  const siteRaw = single('site');
  const hidden = !!siteRaw && /^(n[aã]o|no|ocultar|oculto|privado|rascunho|false|0)$/i.test(siteRaw.trim());

  if (raw.recurrence?.length) issue('recorrente', 'Evento recorrente: só a primeira ocorrência é mostrada.');

  // Detalhes originais: manter só linhas que acrescentam informação.
  const detalhes = (fields.detalhes || [])
    .join('\n')
    .replace(/<(https?:\/\/[^>]+)>/g, (_, u) => u.replace(/\s+/g, ''))
    .split('\n').map(l => l.trim()).filter(Boolean)
    .filter(l => !/^https?:\/\/\S+$/.test(l) && normalizeKey(l) !== normalizeKey(formatoRaw) && !isPending(l));

  return {
    id: raw.id,
    title: (raw.summary || '').trim(),
    status: raw.status || 'confirmed',
    ...dates,
    tipo: type.label,
    typeKey: type.key,
    typeShort: type.short,
    typeFamily: type.family,
    scope,
    formato,
    formatoPendente: !formato && !!formatoRaw,
    formatFamily: formatFamily(formato),
    ronda: rondaNorm || null,
    fase: clean(single('fase')),
    loja,
    localidade,
    distrito: scope === 'portugal' ? distrito : null,
    pais: paisRaw || (scope === 'portugal' ? 'Portugal' : null),
    local: (raw.location || '').trim() || null,
    set: clean(single('set')),
    qualifica: clean(single('qualifica')),
    preco: preco.value,
    precoTexto: preco.text,
    checkin: checkin.text,
    checkinInicio: checkin.from,
    juiz: clean(single('juiz')),
    vagas,
    ligacao,
    premios: list('premios'),
    notas: list('notas').concat(loose),
    detalhesOriginais: detalhes,
    rever,
    hidden,
    issues,
  };
}

/** Marca duplicados prováveis (mesmo dia, mesmo tipo, mesma loja/título). */
export function flagDuplicates(events) {
  const groups = new Map();
  for (const e of events) {
    const key = [e.dateStart, e.typeKey, normalizeKey(e.loja || e.title)].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    for (const e of list) {
      e.issues.push({ code: 'duplicado', level: 'aviso', message: `Possível duplicado (${list.length} eventos no mesmo dia com o mesmo tipo e loja).` });
    }
  }
  return events;
}
