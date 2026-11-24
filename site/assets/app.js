'use strict';
/* Torneios MTG Portugal — agenda gerada a partir do Google Calendar (data/events.json). */

/* ---------- Tema (igual à POC) ---------- */
(function () {
  const toggle = document.getElementById('theme-toggle');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  function updateTheme(theme) {
    const dark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    toggle.setAttribute('aria-pressed', String(dark));
    toggle.setAttribute('aria-label', dark ? 'Ativar modo claro' : 'Ativar modo escuro');
    toggle.setAttribute('title', dark ? 'Ativar modo claro' : 'Ativar modo escuro');
    if (themeMeta) themeMeta.setAttribute('content', dark ? '#11151e' : '#ffffff');
  }
  updateTheme(document.documentElement.getAttribute('data-theme'));
  toggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    updateTheme(next);
    try { localStorage.setItem('torneios-portugal-theme', next); } catch (e) {}
  });
})();

/* ---------- Logótipo: cabe sempre ao lado da navegação ---------- */
// O CSS dá um tamanho aproximado; aqui reduz-se só se, com a fonte do aparelho, o logótipo não couber.
(function () {
  const identity = document.querySelector('.identity');
  const brand = document.querySelector('.brand');
  const MIN = 10;
  const overflows = () => identity.scrollWidth > identity.clientWidth + 0.5;
  function shrink() {
    let size = parseFloat(getComputedStyle(brand).fontSize);
    while (overflows() && size > MIN) { size = Math.max(MIN, size - 0.25); brand.style.fontSize = size + 'px'; }
  }
  function fit() {
    brand.classList.remove('brand-wrap');
    brand.style.fontSize = '';
    shrink();
    // Último recurso (ecrãs muito estreitos com fontes largas): logótipo em duas linhas.
    if (overflows()) { brand.classList.add('brand-wrap'); brand.style.fontSize = '13px'; shrink(); }
  }
  fit();
  if (window.ResizeObserver) new ResizeObserver(fit).observe(document.querySelector('.site-header .wrapper'));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
})();

/* ---------- Utilitários ---------- */
const months_ = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const weekdays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const shortWeek = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const asDate = s => new Date(s + 'T12:00:00');
const mon3 = d => months_[d.getMonth()].slice(0, 3);
const formatDate = s => { const d = asDate(s); return `${d.getDate()} ${months_[d.getMonth()]} ${d.getFullYear()} · ${weekdays[d.getDay()]}`; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normalize = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const euro = n => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n);
const todayLisbon = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const daysBetween = (a, b) => Math.round((asDate(b) - asDate(a)) / 86400000);
const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : null);

/** «Hoje», «Amanhã» ou «Este fim de semana» (sábado/domingo dos próximos 6 dias), em relação a hoje em Lisboa. */
function relativeDay(date) {
  const diff = daysBetween(today, date);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  const wd = asDate(date).getDay();
  if (diff > 1 && diff <= 6 && (wd === 6 || wd === 0)) return 'Este fim de semana';
  return null;
}

/** «daqui a 5 dias», «daqui a 3 semanas», «daqui a 4 meses» (só para dias futuros sem «Hoje/Amanhã/Fim de semana»). */
function countdown(date) {
  const diff = daysBetween(today, date);
  if (diff < 2) return null;
  if (diff < 14) return `daqui a ${diff} dias`;
  if (diff < 60) { const w = Math.round(diff / 7); return `daqui a ${w} semanas`; }
  const m = Math.round(diff / 30.4);
  return m === 1 ? 'daqui a 1 mês' : `daqui a ${m} meses`;
}

/* ---------- Países e bandeiras (eventos internacionais) ---------- */
const COUNTRY_CODES = {
  portugal: 'PT', espanha: 'ES', spain: 'ES', franca: 'FR', france: 'FR', italia: 'IT', italy: 'IT', alemanha: 'DE', germany: 'DE',
  'reino unido': 'GB', inglaterra: 'GB', 'united kingdom': 'GB', uk: 'GB', irlanda: 'IE', 'paises baixos': 'NL', holanda: 'NL', netherlands: 'NL',
  belgica: 'BE', belgium: 'BE', suica: 'CH', austria: 'AT', polonia: 'PL', poland: 'PL', 'republica checa': 'CZ', chequia: 'CZ',
  croacia: 'HR', croatia: 'HR', grecia: 'GR', suecia: 'SE', dinamarca: 'DK', noruega: 'NO', finlandia: 'FI', hungria: 'HU', romenia: 'RO', turquia: 'TR',
  'estados unidos': 'US', eua: 'US', usa: 'US', 'united states': 'US', canada: 'CA', mexico: 'MX', brasil: 'BR', brazil: 'BR', argentina: 'AR', chile: 'CL',
  japao: 'JP', japan: 'JP', china: 'CN', taiwan: 'TW', 'taipe chines': 'TW', 'coreia do sul': 'KR', tailandia: 'TH', thailand: 'TH', singapura: 'SG', singapore: 'SG',
  australia: 'AU', 'nova zelandia': 'NZ',
};
// Cidades habituais do circuito internacional, para quando o calendário só tem a cidade (o ideal é «Cidade, País»).
const CITY_COUNTRY = {
  lille: 'França', paris: 'França', lyon: 'França', ghent: 'Bélgica', gante: 'Bélgica', bruxelas: 'Bélgica', utrecht: 'Países Baixos', amesterdao: 'Países Baixos', amsterdam: 'Países Baixos',
  bilbau: 'Espanha', bilbao: 'Espanha', valencia: 'Espanha', barcelona: 'Espanha', madrid: 'Espanha', sevilha: 'Espanha', zagrebe: 'Croácia', zagreb: 'Croácia',
  londres: 'Reino Unido', london: 'Reino Unido', birmingham: 'Reino Unido', milao: 'Itália', bolonha: 'Itália', frankfurt: 'Alemanha', dortmund: 'Alemanha', praga: 'Chéquia',
  atlanta: 'EUA', detroit: 'EUA', minneapolis: 'EUA', 'las vegas': 'EUA', chicago: 'EUA', seattle: 'EUA', 'nova iorque': 'EUA', orlando: 'EUA', 'st. louis': 'EUA', toquio: 'Japão', tokyo: 'Japão',
};
const countryOf = e => {
  if (e.pais && e.pais !== 'Portugal') return e.pais;
  const local = e.local || '';
  if (local.includes(',')) return local.split(',').pop().trim();
  return CITY_COUNTRY[normalize(local).trim()] || '';
};
function flagFor(country) {
  const code = COUNTRY_CODES[normalize(country).trim()];
  return code ? String.fromCodePoint(...[...code].map(c => 0x1f1e6 + c.charCodeAt(0) - 65)) : '';
}

/* ---------- Adicionar ao calendário (Google Calendar ou ficheiro .ics) ---------- */
// Converte data + hora de Lisboa para UTC (as horas do events.json estão em hora de Lisboa).
function lisbonToUtc(date, time) {
  const [y, mo, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Lisbon', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess)).map(p => [p.type, p.value]));
  const asLisbon = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return new Date(guess - (asLisbon - guess));
}
const icsStamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsDate = s => s.replace(/-/g, '');
const nextDay = s => { const d = asDate(s); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function calendarData(e) {
  const timed = !e.allDay && e.timeStart && e.dateStart === e.dateEnd;
  let start, end;
  if (timed) {
    start = lisbonToUtc(e.dateStart, e.timeStart);
    end = e.timeEnd && e.timeEnd > e.timeStart ? lisbonToUtc(e.dateStart, e.timeEnd) : new Date(start.getTime() + 4 * 3600000);
  }
  const local = e.scope === 'portugal' ? addressOf(e) || e.local || e.localidade || '' : placeLine(e) || e.local || '';
  const where = e.scope === 'portugal' && e.loja && !local.toLowerCase().includes(e.loja.toLowerCase()) ? [e.loja, local].filter(Boolean).join(', ') : (local || placeLine(e) || '');
  const info = [
    e.tipo + (e.ronda ? ' · ' + e.ronda : '') + (e.fase ? ' · ' + e.fase : ''),
    e.formato ? 'Formato: ' + e.formato + (e.set ? ' · ' + e.set : '') : null,
    e.checkin ? 'Check-in: ' + e.checkin : null,
    e.scope === 'portugal' ? 'Inscrição: ' + (e.preco != null ? (e.preco === 0 ? 'Grátis' : euro(e.preco)) : (e.precoTexto || 'a confirmar')) : null,
    safeUrl(e.ligacao) ? 'Inscrição / anúncio: ' + e.ligacao : null,
    'Torneios MTG Portugal: ' + eventUrl(e.id),
  ].filter(Boolean).join('\n');
  return { title: e.title, timed, start, end, where, info };
}

function googleCalendarUrl(e) {
  const c = calendarData(e);
  const dates = c.timed ? `${icsStamp(c.start)}/${icsStamp(c.end)}` : `${icsDate(e.dateStart)}/${icsDate(nextDay(e.dateEnd))}`;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: c.title, dates, details: c.info, location: c.where, ctz: 'Europe/Lisbon' });
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

function icsFile(e) {
  const c = calendarData(e);
  const txt = v => String(v).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  // Linhas de no máximo 75 octetos (RFC 5545), contando os acentos em UTF-8.
  const enc = new TextEncoder();
  const fold = line => { const out = []; let cur = '', size = 0; for (const ch of line) { const n = enc.encode(ch).length; if (size + n > 75) { out.push(cur); cur = ' '; size = 1; } cur += ch; size += n; } out.push(cur); return out.join('\r\n'); };
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Torneios MTG Portugal//PT', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${e.id}@torneios-mtg-portugal`, `DTSTAMP:${icsStamp(new Date())}`,
    ...(c.timed ? [`DTSTART:${icsStamp(c.start)}`, `DTEND:${icsStamp(c.end)}`] : [`DTSTART;VALUE=DATE:${icsDate(e.dateStart)}`, `DTEND;VALUE=DATE:${icsDate(nextDay(e.dateEnd))}`]),
    `SUMMARY:${txt(c.title)}`, ...(c.where ? [`LOCATION:${txt(c.where)}`] : []), `DESCRIPTION:${txt(c.info)}`,
    ...(safeUrl(e.ligacao) ? [`URL:${e.ligacao}`] : []), 'END:VEVENT', 'END:VCALENDAR'];
  return lines.map(fold).join('\r\n') + '\r\n';
}


/** "24–26 Outubro" ou "31 Outubro – 2 Novembro" (com ano se mudar). */
function rangeLabel(e, short) {
  const a = asDate(e.dateStart), b = asDate(e.dateEnd);
  const m = d => (short ? mon3(d) : months_[d.getMonth()]);
  if (e.dateStart === e.dateEnd) return `${a.getDate()} ${m(a)}`;
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${a.getDate()}–${b.getDate()} ${m(a)}`;
  return `${a.getDate()} ${m(a)} – ${b.getDate()} ${m(b)}${a.getFullYear() !== b.getFullYear() ? ' ' + b.getFullYear() : ''}`;
}

/* ---------- Cor por tipo de evento ---------- */
// Cada tipo tem a sua cor (definida em styles.css como .t-<chave>); tipos novos usam o estilo genérico .t-outro.
const TYPE_CLASS = {
  rcq: 'rcq', lpp: 'lpp', lll: 'lll', cedh: 'cedh', prerelease: 'prerelease', qualificador: 'qualificador',
  spotlight: 'spotlight', 'regional championship': 'rc', 'pro tour': 'pt', 'world championship': 'worlds',
  'campeonato / evento especial': 'especial', paupergeddon: 'paupergeddon', anuncio: 'anuncio',
};
const typeClass = e => 't-' + (TYPE_CLASS[e.typeKey] || 'outro');
const TYPE_LABEL = { 'campeonato / evento especial': 'Evento especial' };
const typeLabel = e => TYPE_LABEL[e.typeKey] || e.tipo || 'Outro';
const longWeek = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

/* ---------- Estado ---------- */
let events = [];
let milestones = [];
let showPast = false;
const $ = s => document.querySelector(s);
const eventsEl = $('#events');

const isInfo = e => e.scope === 'informativo';
const displayName = e => (e.scope === 'portugal' && e.loja ? e.loja : e.title);
const placeLine = e => {
  if (e.scope === 'portugal') {
    if (!e.localidade) return e.local || '';
    return e.distrito && normalize(e.distrito) !== normalize(e.localidade) ? `${e.localidade} · ${e.distrito}` : e.localidade;
  }
  // Internacionais: «Cidade, País» (o país vem da localização ou das cidades habituais).
  const country = countryOf(e);
  const city = (e.local || '').includes(',') ? e.local.split(',').slice(0, -1).join(',').trim() : (e.local || '');
  return [city && normalize(city) !== normalize(country) ? city : null, country].filter(Boolean).join(', ');
};
const flagHtml = e => { const f = e.scope === 'internacional' ? flagFor(countryOf(e)) : ''; return f ? ` <span class="flag" aria-hidden="true">${f}</span>` : ''; };

const byCount = (list, key) => {
  const counts = new Map();
  for (const e of list) { const k = key(e); if (k) counts.set(k, (counts.get(k) || 0) + 1); }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt')).map(([k]) => k);
};
// Filtro de formato: um só valor por torneio, por ordem lógica (construídos do mais recente ao mais antigo,
// Commander (inclui cEDH), e por fim «Limited», que junta Draft, Sealed, Team Sealed, etc.).
// Torneios com dois formatos («Draft + Standard») ficam no formato que não é limitado (Standard).
// Na agenda e no modal o formato continua a aparecer tal como está escrito no calendário.
const FORMAT_ORDER = ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'pauper', 'premodern', 'commander'];
// cEDH, EDH e Duel Commander entram todos em «Commander».
const FORMAT_NAME = { standard: 'Standard', pioneer: 'Pioneer', modern: 'Modern', legacy: 'Legacy', vintage: 'Vintage', pauper: 'Pauper', premodern: 'Premodern', commander: 'Commander', cedh: 'Commander', edh: 'Commander', 'duel commander': 'Commander' };
const isLimitedFormat = k => /sealed|draft|limited|cube|jumpstart|booster/.test(k);
function filterFormat(e) {
  if (!e.formato) return null;
  const parts = String(e.formato).split(/\s*(?:\+|\/|,|&|\be\b|\band\b)\s*/i).map(p => p.trim()).filter(Boolean);
  const main = parts.find(p => !isLimitedFormat(normalize(p)));
  if (!main) return 'Limited';
  const k = normalize(main);
  if (/commander|\bc?edh\b/.test(k)) return 'Commander';
  return FORMAT_NAME[k] || main;
}
function formatRank(f) {
  if (f === 'Limited') return 2000;
  const i = FORMAT_ORDER.indexOf(normalize(f));
  return i >= 0 ? i : 1000;
}
const byFormatOrder = (a, b) => formatRank(a) - formatRank(b) || a.localeCompare(b, 'pt');

/* ---------- Filtros: listas com escolha múltipla e subopções (Portugal → distritos, RCQ → rounds) ---------- */
// Cada filtro guarda um conjunto de «fichas». Cada torneio tem uma ficha por filtro; passa se o filtro
// estiver vazio ou se a sua ficha estiver escolhida. Um grupo (Portugal, RCQ) representa todas as fichas filhas.
const sel = { format: new Set(), place: new Set(), circuit: new Set() };
const PLACEHOLDER = { format: 'Formato', place: 'Onde', circuit: 'Circuito' };
let trees = { format: [], place: [], circuit: [] };
const TOKEN = {
  format: e => filterFormat(e),
  place: e => e.scope === 'portugal' ? 'pt:' + (e.distrito || '') : 'intl:' + countryOf(e),
  circuit: e => e.typeKey === 'rcq' ? 'RCQ:' + roundKey(e) : 'type:' + e.tipo,
};
// Round com época (R2 de 2026/27 ≠ R2 de 2027/28).
const roundKey = e => (e.ronda ? e.ronda + (e.epoca ? ' ' + e.epoca : '') : '');
const roundText = e => (e.ronda ? e.ronda + (e.epoca ? ' ' + e.epoca : '') : '');
const typeName = t => (t === 'Campeonato / Evento especial' ? 'Evento especial' : t);
const leaf = (value, label, extra = {}) => ({ label, values: [value], ...extra });
const group = (id, label, children) => ({ id, label, children, values: children.flatMap(c => c.values) });
const allValues = key => trees[key].flatMap(n => n.values);

function buildFilters() {
  const pool = events.filter(e => !isInfo(e) && (showPast || !isPastEvent(e)));
  // Formatos: lista fixa dos habituais (mesmo sem torneios marcados) + formatos novos que apareçam no calendário.
  const formats = [...new Set([...FORMAT_ORDER.map(k => FORMAT_NAME[k]), 'Limited', ...pool.map(filterFormat).filter(Boolean)])].sort(byFormatOrder);
  trees.format = formats.map(f => leaf(f, f));
  const pt = [...new Set(pool.filter(e => e.scope === 'portugal').map(e => e.distrito || ''))].sort((a, b) => (!a) - (!b) || a.localeCompare(b, 'pt'));
  const intl = [...new Set(pool.filter(e => e.scope !== 'portugal').map(countryOf))].sort((a, b) => (!a) - (!b) || a.localeCompare(b, 'pt'));
  trees.place = [
    group('pt', 'Portugal', pt.map(d => leaf('pt:' + d, d || 'Outros locais'))),
    group('intl', 'Internacional', intl.map(c => leaf('intl:' + c, c || 'Vários locais', { flag: flagFor(c) }))),
  ].filter(g => g.children.length);
  const types = byCount(events.filter(e => showPast || !isPastEvent(e)), e => e.tipo);
  // Rounds por época e depois por número (época 2026/27 antes de 2027/28).
  const roundSort = k => { const [r, ep = ''] = k.split(' '); return ep + ' ' + r; };
  const rounds = [...new Set(pool.filter(e => e.typeKey === 'rcq').map(roundKey))].sort((a, b) => (!a) - (!b) || roundSort(a).localeCompare(roundSort(b)));
  trees.circuit = types.map(t => (t === 'RCQ' && rounds.length > 1)
    ? group('rcq', 'RCQ', rounds.map(r => leaf('RCQ:' + r, r ? `Round ${r.split(' ')[0].replace(/\D/g, '')}${r.includes(' ') ? ' · ' + r.split(' ')[1] : ''}` : 'Sem round')))
    : t === 'RCQ' ? leaf('RCQ:' + (rounds[0] || ''), 'RCQ') : leaf('type:' + t, typeName(t)));
  // Escolhas que deixaram de existir (por exemplo ao esconder os passados) saem do filtro.
  for (const key of Object.keys(sel)) { const ok = new Set(allValues(key)); for (const v of sel[key]) if (!ok.has(v)) sel[key].delete(v); }
  for (const key of Object.keys(sel)) renderPanel(key);
}

/** Eventos que passam em todos os filtros menos `skip` (para os números ao lado de cada opção). */
const facetPool = (skip, q) => events.filter(e => matches(e, q, skip));
const nodeState = (key, n) => { const c = n.values.filter(v => sel[key].has(v)).length; return c === 0 ? 'off' : c === n.values.length ? 'on' : 'some'; };

function optionHtml(key, n, counts, child) {
  const count = n.values.reduce((s, v) => s + (counts.get(v) || 0), 0);
  const st = nodeState(key, n);
  const id = `${key}-opt-${n.id || n.values[0]}`.replace(/[^\w-]/g, '_');
  return `<label class="ms-opt${child ? ' child' : ''}${n.children ? ' parent' : ''}${count ? '' : ' zero'}" for="${id}">`
    + `<input type="checkbox" id="${id}" data-values="${esc(JSON.stringify(n.values))}"${st === 'on' ? ' checked' : ''}${st === 'some' ? ' data-some="1"' : ''}>`
    + `<span class="ms-text">${n.flag ? `<span class="flag" aria-hidden="true">${n.flag}</span>` : ''}${esc(n.label)}</span><span class="ms-count">${count}</span></label>`;
}

function renderPanel(key) {
  const root = document.querySelector(`.ms[data-key="${key}"]`);
  const q = normalize($('#search').value.trim());
  const counts = new Map();
  for (const e of facetPool(key, q)) { if (key !== 'circuit' && isInfo(e)) continue; /* os números contam torneios, como o contador */ const t = TOKEN[key](e); counts.set(t, (counts.get(t) || 0) + 1); }
  root.querySelector('.ms-list').innerHTML = trees[key].map(n => n.children
    ? optionHtml(key, n, counts, false) + n.children.map(c => optionHtml(key, c, counts, true)).join('')
    : optionHtml(key, n, counts, false)).join('');
  root.querySelectorAll('input[data-some]').forEach(i => { i.indeterminate = true; });
  // Texto do botão: o nome escolhido (um grupo completo conta como um só nome) ou «nome +N».
  const names = [];
  for (const n of trees[key]) {
    const st = nodeState(key, n);
    if (st === 'on') names.push(n.label);
    else if (st === 'some') n.children.forEach(c => { if (nodeState(key, c) === 'on') names.push(c.label); });
  }
  const btn = root.querySelector('.ms-btn');
  btn.classList.toggle('active', names.length > 0);
  // Nome curto no botão (rounds: «R3 2026/27»); o «+N» fica fora do corte para nunca desaparecer.
  const short = names.map(n => n.replace(/^Round (\d+) · /, 'R$1 '));
  btn.querySelector('.ms-label').innerHTML = !names.length ? esc(PLACEHOLDER[key]) : `<span class="ms-main">${esc(short[0])}</span>${names.length > 1 ? ` <span class="ms-more">+${names.length - 1}</span>` : ''}`;
  btn.title = names.length ? names.join(', ') : '';
  btn.setAttribute('aria-label', names.length ? `${PLACEHOLDER[key]}: ${names.join(', ')}` : PLACEHOLDER[key]);
}

let openMs = null;
function closePanel(focusButton) {
  if (!openMs) return;
  const btn = openMs.querySelector('.ms-btn');
  openMs.querySelector('.ms-panel').hidden = true;
  btn.setAttribute('aria-expanded', 'false');
  openMs.classList.remove('open');
  if (focusButton) btn.focus();
  openMs = null;
}
function openPanel(root, focusFirst) {
  closePanel(false);
  openMs = root;
  root.classList.add('open');
  root.querySelector('.ms-panel').hidden = false;
  root.querySelector('.ms-btn').setAttribute('aria-expanded', 'true');
  fitPanel(root);
  const first = root.querySelector('.ms-list input');
  if (first && focusFirst) first.focus({ preventScroll: true });
}
/** A lista nunca passa do fundo do ecrã: «Limpar/Feito» ficam sempre visíveis (ecrãs baixos, telemóvel deitado). */
function fitPanel(root) {
  const list = root.querySelector('.ms-list'), foot = root.querySelector('.ms-foot');
  const avail = () => innerHeight - list.getBoundingClientRect().top - foot.offsetHeight - 12;
  list.style.maxHeight = '';
  if (avail() < 180) {
    // Sobe a página o necessário (sem esconder o botão debaixo do cabeçalho fixo).
    const header = document.querySelector('.site-header')?.getBoundingClientRect().bottom || 0;
    const room = root.querySelector('.ms-btn').getBoundingClientRect().top - header - 8;
    window.scrollBy({ top: Math.max(0, Math.min(180 - avail(), room)), behavior: 'instant' });
  }
  list.style.maxHeight = Math.max(120, Math.min(360, avail())) + 'px';
}
window.addEventListener('resize', () => { if (openMs) fitPanel(openMs); });
document.querySelectorAll('.ms').forEach(root => {
  const key = root.dataset.key;
  // Com o rato o foco fica no botão; com o teclado (detail 0) passa para a primeira opção.
  root.querySelector('.ms-btn').addEventListener('click', ev => (openMs === root ? closePanel(true) : openPanel(root, ev.detail === 0)));
  root.querySelector('.ms-list').addEventListener('change', ev => {
    const input = ev.target.closest('input[type=checkbox]');
    if (!input) return;
    const values = JSON.parse(input.dataset.values);
    const allOn = values.every(v => sel[key].has(v));
    for (const v of values) allOn ? sel[key].delete(v) : sel[key].add(v);
    const focusId = input.id;
    renderEvents();
    const again = document.getElementById(focusId);
    if (again) again.focus({ preventScroll: true });
  });
  root.querySelector('.ms-clear').addEventListener('click', () => { sel[key].clear(); renderEvents(); const f = root.querySelector('.ms-list input'); if (f) f.focus({ preventScroll: true }); });
  root.querySelector('.ms-done').addEventListener('click', () => closePanel(true));
  root.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && openMs === root) { ev.preventDefault(); ev.stopPropagation(); closePanel(true); return; }
    if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && openMs === root) {
      const inputs = [...root.querySelectorAll('.ms-list input')];
      const i = inputs.indexOf(document.activeElement);
      const next = inputs[Math.max(0, Math.min(inputs.length - 1, i + (ev.key === 'ArrowDown' ? 1 : -1)))];
      if (next) { ev.preventDefault(); next.focus(); }
    }
  });
});
document.addEventListener('pointerdown', ev => { if (openMs && !openMs.contains(ev.target)) closePanel(false); });
document.addEventListener('focusin', ev => { if (openMs && !openMs.contains(ev.target)) closePanel(false); });
const hasFilters = () => Object.values(sel).some(s => s.size);

let today = todayLisbon();
const isPastEvent = e => e.dateEnd < today;

function matchesQuery(e, q) {
  return !q || [e.title, e.loja, e.localidade, e.distrito, e.formato, e.set, e.tipo, e.ronda, e.epoca, roundText(e), e.fase, e.local, e.pais, countryOf(e), e.qualifica].some(v => normalize(v).includes(q));
}
function matches(e, q, skip) {
  const on = k => k !== skip && sel[k].size;
  if (!showPast && isPastEvent(e)) return false;
  if (!matchesQuery(e, q)) return false;
  if (on('circuit') && !sel.circuit.has(TOKEN.circuit(e))) return false;
  // Datas informativas: sem filtro de local; com filtro de formato só as que têm formato (pré-releases → Limited).
  if (isInfo(e)) return !on('place') && (!on('format') || (!!e.formato && sel.format.has(TOKEN.format(e))));
  if (on('format') && !sel.format.has(TOKEN.format(e))) return false;
  if (on('place') && !sel.place.has(TOKEN.place(e))) return false;
  return true;
}

/* ---------- Agenda: cartões por dia ---------- */
const spanDays = e => daysBetween(e.dateStart, e.dateEnd) + 1;
const formatText = e => (e.formato ? `${e.formato}${e.set ? ' · ' + e.set : ''}` : null);

function typePillHtml(e) {
  const extra = [roundText(e), e.fase].filter(Boolean).map(esc).join(' · ');
  const title = e.ronda && e.rondaDeduzida ? ' title="Round atribuída pela data (janela oficial da round)"' : '';
  return `<span class="type-pill"${title}>${esc(typeLabel(e))}${extra ? ' · ' + extra : ''}</span>`;
}

function rowHtml(e) {
  // Três colunas: tipo, onde (loja/evento + local) e formato. Preço e horário ficam no detalhe do torneio.
  const place = placeLine(e);
  const fmt = formatText(e);
  const multi = e.dateStart !== e.dateEnd;
  const n = spanDays(e);
  const range = multi ? `<span class="range-pill">${esc(rangeLabel(e, true))} · ${n} dias</span>` : '';
  const placeHtml = place ? esc(place) + flagHtml(e) : '';
  const meta = [`<b>${esc(fmt || 'Formato a confirmar')}</b>`, placeHtml].filter(Boolean).join('  ·  ');
  return `<button type="button" class="event-row ${typeClass(e)}${e.scope === 'internacional' ? ' intl' : ''}" data-id="${esc(e.id)}" aria-label="Detalhes de ${esc(displayName(e))}, ${esc(formatDate(e.dateStart))}">`
    + `<span class="event-type">${typePillHtml(e)}${range}</span>`
    + `<span class="event-main"><span class="store">${esc(displayName(e))}</span>${place ? `<span class="subline">${placeHtml}</span>` : ''}<span class="meta-m">${meta}</span>${e.qualifica ? `<span class="qualifies">Qualifica para ${esc(e.qualifica)}</span>` : ''}</span>`
    + `<span class="format-col${fmt ? '' : ' pending'}">${esc(fmt || 'Formato a confirmar')}</span></button>`;
}

function infoHtml(e) {
  const when = e.dateStart !== e.dateEnd ? rangeLabel(e) : (!e.allDay && e.timeStart ? `${e.timeStart} (hora de Lisboa)` : '');
  return `<button type="button" class="info-row ${typeClass(e)}" data-id="${esc(e.id)}" aria-label="${esc(e.tipo)}: ${esc(e.title)}, ${esc(formatDate(e.dateStart))}"><span class="info-kind">${esc(typeLabel(e))}</span><span class="info-name">${esc(e.title)}</span>${when ? `<span class="info-when">${esc(when)}</span>` : ''}</button>`;
}

/** Dia seguinte de um evento com vários dias: linha discreta que abre o mesmo evento (não é outro torneio). */
function contHtml(e, date) {
  const label = `Dia ${daysBetween(e.dateStart, date) + 1} de ${spanDays(e)}`;
  const name = displayName(e);
  return `<button type="button" class="cont-row ${typeClass(e)}" data-id="${esc(e.id)}" aria-label="A decorrer: ${esc(name)}, ${esc(label.toLowerCase())} (${esc(rangeLabel(e))})"><span class="cont-kind">A decorrer</span><span class="cont-name">${esc(name)}</span><span class="cont-when">${esc(label)}  ·  ${esc(rangeLabel(e, true))}</span></button>`;
}

function milestoneHtml(m, kind) {
  const date = kind === 'end' ? m.end : m.start;
  const label = kind === 'end' ? 'Fim' : 'Início';
  return `<div class="round-milestone ${kind}" role="note" aria-label="${label} da ${esc(m.label)} em ${esc(formatDate(date))}"><span class="milestone-name">${label} ${esc(m.circuit)} ${esc(m.label)}</span></div>`;
}

function milestoneVisible(m) {
  if (sel.format.size || sel.place.size || $('#search').value.trim()) return false;
  if (!sel.circuit.size) return true;
  return m.circuit === 'RCQ' ? (m.ronda ? sel.circuit.has('RCQ:' + m.ronda + (m.season ? ' ' + m.season : '')) : [...sel.circuit].some(v => v.startsWith('RCQ:'))) : sel.circuit.has('type:' + m.circuit);
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const COL_HEAD = '<div class="col-head" aria-hidden="true"><span>Tipo</span><span>Evento</span><span>Formato</span></div>';


/** Separa o total em Portugal e internacionais quando há dos dois. */
function countText(list) {
  const tournaments = list.filter(e => !isInfo(e));
  const info = list.length - tournaments.length;
  if (!tournaments.length && info) return plural(info, 'data informativa', 'datas informativas');
  const pt = tournaments.filter(e => e.scope === 'portugal').length, intl = tournaments.length - pt;
  if (pt && intl) return `${pt} em Portugal · ${intl} ${intl === 1 ? 'internacional' : 'internacionais'}`;
  return plural(tournaments.length, 'torneio', 'torneios');
}

/** Cartões por dia, agrupados por mês. withMilestones: marcos das rounds (só na agenda principal). */
function monthsHtml(filtered, withMilestones) {
  // Mês → dias (cada evento aparece uma só vez, no dia em que começa) com torneios, datas informativas e marcos.
  const months = new Map();
  const dayFor = date => {
    const key = date.slice(0, 7);
    if (!months.has(key)) months.set(key, { date: asDate(key + '-01'), days: new Map(), total: 0 });
    const m = months.get(key);
    if (!m.days.has(date)) m.days.set(date, { events: [], info: [], before: [], after: [] });
    return m.days.get(date);
  };
  for (const e of filtered) {
    const day = dayFor(e.dateStart);
    if (isInfo(e)) day.info.push(e);
    else { day.events.push(e); months.get(e.dateStart.slice(0, 7)).total++; }
  }
  // Eventos de vários dias já começados: há sempre um cartão de hoje com «A decorrer».
  if (!showPast) for (const e of filtered) if (e.dateStart < today && e.dateEnd >= today) dayFor(today);
  if (withMilestones) for (const m of milestones) {
    if (!milestoneVisible(m)) continue;
    for (const kind of ['start', 'end']) {
      const date = kind === 'start' ? m.start : m.end;
      if (!months.has(date.slice(0, 7)) || (!showPast && date < today)) continue;
      dayFor(date)[kind === 'start' ? 'before' : 'after'].push(milestoneHtml(m, kind));
    }
  }
  const multiDay = filtered.filter(e => e.dateStart !== e.dateEnd);
  const sortedKeys = [...months.keys()].sort();
  const html = sortedKeys.map(key => {
    const g = months.get(key);
    const cards = [...g.days.keys()].sort().map(date => {
      const day = g.days.get(date), dt = asDate(date);
      const cont = multiDay.filter(e => e.dateStart < date && e.dateEnd >= date);
      const count = day.events.length ? plural(day.events.length, 'torneio', 'torneios')
        : day.info.length ? plural(day.info.length, 'data informativa', 'datas informativas') : '';
      const rel = relativeDay(date);
      const label = `${rel ? rel + ', ' : ''}${longWeek[dt.getDay()]}, ${dt.getDate()} de ${months_[dt.getMonth()]} de ${dt.getFullYear()}`;
      return `<article class="day-card" data-date="${date}" aria-label="${esc(label)}"><div class="day-head"><span class="day-num" aria-hidden="true">${dt.getDate()}</span><span class="day-names"><span class="day-wd">${longWeek[dt.getDay()]}${rel ? ` <span class="day-rel">${rel}</span>` : ''}</span><span class="day-mon">${months_[dt.getMonth()]} ${dt.getFullYear()}${!rel && countdown(date) ? ` · <span class="day-countdown">${countdown(date)}</span>` : ''}</span></span>${count ? `<span class="day-count">${count}</span>` : ''}</div>`
        + day.before.join('') + day.events.map(rowHtml).join('') + day.info.map(infoHtml).join('')
        + cont.map(e => contHtml(e, date)).join('') + day.after.join('') + `</article>`;
    }).join('');
    const total = g.total ? plural(g.total, 'torneio', 'torneios') : '';
    return `<section class="month-block"${withMilestones ? ` id="m-${key}"` : ''} aria-label="${months_[g.date.getMonth()]} ${g.date.getFullYear()}"><div class="month-title"><h3>${months_[g.date.getMonth()]}</h3><span class="year">${g.date.getFullYear()}</span><span class="total">${total}</span></div>${COL_HEAD}${cards}</section>`;
  }).join('');
  return { months, sortedKeys, html };
}

function renderEvents() {
  const q = normalize($('#search').value.trim());
  const filtered = events.filter(e => matches(e, q));
  $('#count').textContent = countText(filtered);
  renderQuick();
  // «Limpar filtros» só aparece quando há algum filtro ou pesquisa activa.
  $('#reset').hidden = !hasFilters() && !$('#search').value.trim();
  for (const key of Object.keys(sel)) renderPanel(key);
  syncFiltersToUrl();
  if (!filtered.length) {
    $('#month-jump').innerHTML = '<option value="">Ir para mês…</option>';
    eventsEl.innerHTML = `<div class="empty"><p>Nenhum torneio encontrado com estes filtros.</p><button type="button" class="empty-reset">Limpar filtros</button></div>`;
    return;
  }
  const { months, sortedKeys, html } = monthsHtml(filtered, true);
  $('#month-jump').innerHTML = '<option value="">Ir para mês…</option>' + sortedKeys.map(key => { const g = months.get(key); return `<option value="${key}">${months_[g.date.getMonth()]} ${g.date.getFullYear()}</option>`; }).join('');
  eventsEl.innerHTML = html;
}

eventsEl.addEventListener('click', ev => {
  const el = ev.target.closest('[data-id]');
  if (el) openDetails(el.dataset.id);
});
document.getElementById('store').addEventListener('click', ev => {
  const el = ev.target.closest('[data-id]');
  if (el) openDetails(el.dataset.id);
});

/* ---------- Lojas ---------- */
// A mesma loja aparece escrita de formas diferentes («End Turn»/«EndTurn», «Magus»/«Magus Gamestore»,
// «Mulligan Games»/«Mulligan Quarteira»). A chave junta o nome sem palavras genéricas nem a cidade + a localidade.
const STORE_STOPWORDS = /\b(games?|gamestore|gamecenter|gaming|store|loja|de|jogos)\b/g;
const CITY_ALIAS = { benfica: 'lisboa' };
const slug = v => normalize(v).replace(/[^a-z0-9]+/g, '');
function storeKeyFor(name, city) {
  if (!name || !city) return null;
  const c = CITY_ALIAS[slug(city)] || slug(city);
  let n = normalize(name).replace(/['’]/g, '').replace(STORE_STOPWORDS, ' ');
  n = n.replace(new RegExp('\\b' + normalize(city).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g'), ' ');
  const core = n.replace(/[^a-z0-9]+/g, '');
  return core ? `${core}-${c}` : null;
}
const storeKey = e => (e.scope === 'portugal' ? storeKeyFor(e.loja, e.localidade) : null);
// Ficha das lojas (data/stores.json): morada e redes sociais por defeito; o calendário prevalece.
const STORE_INFO = new Map();
function loadStoreInfo(list) {
  for (const s of list || []) for (const n of [s.nome, ...(s.aliases || [])]) { const k = storeKeyFor(n, s.localidade); if (k) STORE_INFO.set(k, s); }
}
const storeInfo = e => STORE_INFO.get(storeKey(e)) || null;
const looksLikeAddress = v => /\d/.test(v || '') && /,/.test(v || '');
/** Morada completa: a do calendário se for uma morada; senão a da ficha da loja. */
// Sem o nome da loja no início («Arena Porto, R. de Santa Catarina…» → «R. de Santa Catarina…») nem «, Portugal» no fim.
const cleanAddress = v => v.replace(/,\s*Portugal\s*$/i, '').replace(/^(?!\s*(?:rua|r\.|av\.?|avenida|largo|pra[cç]a|estrada|travessa|tv\.|urb\.?|urbaniza[cç][aã]o|alameda|cal[cç]ada|lugar|bairro)\b)[^,\d]+,\s*(?=.*\d)/i, '');
const addressOf = e => (e.scope !== 'portugal' ? null : looksLikeAddress(e.local) ? cleanAddress(e.local) : storeInfo(e)?.morada || null);
const socialUrl = (v, base) => (!v ? null : /^https?:\/\//i.test(v) ? safeUrl(v) : base + encodeURIComponent(v.replace(/^@/, '').replace(/^\/+|\/+$/g, '')));
function storeLinksHtml(info) {
  if (!info) return '';
  return [[socialUrl(info.instagram, 'https://www.instagram.com/'), 'Instagram'], [socialUrl(info.facebook, 'https://www.facebook.com/'), 'Facebook'], [safeUrl(info.site), 'Site da loja']]
    .filter(([u]) => u).map(([u, t]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${t} ↗</a>`).join('');
}
let winners = [];

function renderStore(key) {
  const el = document.getElementById('store');
  const list = events.filter(e => storeKey(e) === key);
  const wins = winners.filter(w => storeKeyFor(w.store, w.city) === key);
  if (!list.length && !wins.length) {
    document.title = 'Loja não encontrada — Torneios MTG Portugal';
    el.innerHTML = `<div class="store-page"><a href="#agenda" class="back-link">← Agenda</a><div class="empty"><p>Não encontrámos esta loja.</p></div></div>`;
    return;
  }
  // Nome mais usado (de preferência nos próximos torneios), localidade e morada.
  const upcoming = list.filter(e => !isPastEvent(e)), past = list.filter(isPastEvent).reverse();
  const counts = new Map();
  for (const e of (upcoming.length ? upcoming : list)) counts.set(e.loja, (counts.get(e.loja) || 0) + 1);
  const name = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || wins[0].store;
  const ref = list[list.length - 1] || {};
  const place = [ref.localidade || wins[0]?.city, ref.distrito && ref.distrito !== ref.localidade ? ref.distrito : null].filter(Boolean).join(' · ');
  const info = STORE_INFO.get(key);
  const address = info?.morada || list.map(addressOf).filter(Boolean).pop() || list.map(e => e.local).filter(v => v && normalize(v) !== normalize(name) && normalize(v) !== normalize(ref.loja)).pop();
  const map = safeUrl(info?.mapa) || (address || ref.localidade ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address ? [name, address].join(', ') : [name, ref.localidade].join(', '))}` : null);
  const stats = [plural(upcoming.length, 'torneio marcado', 'torneios marcados'), past.length ? plural(past.length, 'torneio anterior', 'torneios anteriores') : null, wins.length ? plural(wins.length, 'vencedor registado', 'vencedores registados') : null].filter(Boolean).join(' · ');
  document.title = `${name} — Torneios MTG Portugal`;
  el.innerHTML = `<div class="store-page">
    <a href="#agenda" class="back-link">← Agenda</a>
    <div class="store-head"><div><h2>${esc(name)}</h2><p class="store-place">${esc(place)}${address ? `<span class="store-address">${esc(address)}</span>` : ''}</p><p class="store-stats">${esc(stats)}</p></div>
    <div class="store-actions">${map ? `<a href="${esc(map)}" target="_blank" rel="noopener">Ver no mapa ↗</a>` : ''}${storeLinksHtml(info)}<button type="button" class="share-btn" id="share-store">Partilhar</button></div></div>
    <h3 class="store-section">Próximos torneios</h3>
    ${upcoming.length ? `<div class="store-events">${monthsHtml(upcoming, false).html}</div>` : '<p class="store-none">Sem torneios marcados de momento.</p>'}
    ${wins.length ? `<h3 class="store-section">Vencedores</h3><div class="store-results">${[...wins].reverse().map(resultHtml).join('')}</div>` : ''}
    ${past.length ? `<details class="store-past"><summary>Torneios anteriores (${past.length})</summary><div class="store-events">${monthsHtml(past, false).html}</div></details>` : ''}
  </div>`;
  el.querySelector('#share-store').addEventListener('click', async ev => {
    const btn = ev.currentTarget, msg = await shareLink(location.origin + location.pathname + '#loja-' + key, name);
    if (msg) { btn.textContent = msg; setTimeout(() => { btn.textContent = 'Partilhar'; }, 2000); }
  });
}

function resultHtml(r) {
  const d = asDate(r.date);
  const key = storeKeyFor(r.store, r.city);
  // A localidade não se repete quando já faz parte do nome da loja («Mulligan Quarteira»).
  const city = r.city && !normalize(r.store).includes(normalize(r.city)) ? r.city : '';
  const storeName = key ? `<a href="#loja-${esc(key)}" class="store-name-link">${esc(r.store)}</a>` : esc(r.store);
  const meta = [storeName, city && esc(city), esc(r.deck || 'Deck não indicado')].filter(Boolean).join(' · ');
  return `<div class="result"><span class="date">${d.getDate()} ${mon3(d).toUpperCase()}<br>${d.getFullYear()}</span><span class="win">${esc(r.name)}</span><span class="store-cell">${storeName}${city ? `<span class="location">${esc(city)}</span>` : ''}</span><span class="deck">${esc(r.deck || 'Não indicado')}</span><span class="num">${r.players == null ? '—' : r.players}<small>jogadores</small></span><span class="result-meta">${meta}</span></div>`;
}

/* ---------- Endereços partilháveis ---------- */
// Filtros no endereço (?formato=Standard&onde=portugal&distrito=Lisboa&circuito=RCQ&round=R3&q=...&passados=1)
// e torneio aberto (?t=<id>). A vista (Agenda, Vencedores, loja) continua no #.
let urlReady = false;
const listParam = v => (v ? v.split(',').map(x => x.trim()).filter(Boolean) : []);
const findNode = (key, pred) => { for (const n of trees[key]) { if (pred(n)) return n; for (const c of n.children || []) if (pred(c)) return c; } return null; };

/** Endereço: grupos completos pelo nome (onde=portugal, circuito=RCQ); escolhas parciais em distrito/pais/round. */
function currentParams() {
  const p = new URLSearchParams();
  const q = document.getElementById('search').value.trim();
  if (q) p.set('q', q);
  if (sel.format.size) p.set('formato', trees.format.filter(n => nodeState('format', n) === 'on').map(n => n.label).join(','));
  const onde = [], distrito = [], pais = [];
  for (const n of trees.place) {
    const st = nodeState('place', n);
    if (st === 'on') onde.push(n.id === 'pt' ? 'portugal' : 'internacional');
    else if (st === 'some') for (const c of n.children) if (nodeState('place', c) === 'on') (n.id === 'pt' ? distrito : pais).push(c.values[0].replace(/^\w+:/, ''));
  }
  if (onde.length) p.set('onde', onde.join(','));
  if (distrito.length) p.set('distrito', distrito.join(','));
  if (pais.length) p.set('pais', pais.join(','));
  const circuito = [], round = [];
  for (const n of trees.circuit) {
    const st = nodeState('circuit', n);
    const name = n.values[0].startsWith('RCQ:') ? 'RCQ' : n.values[0].slice(5);
    if (st === 'on') circuito.push(name);
    else if (st === 'some') for (const c of n.children) if (nodeState('circuit', c) === 'on') round.push(c.values[0].slice(4));
  }
  if (circuito.length) p.set('circuito', circuito.join(','));
  if (round.length) p.set('round', round.join(','));
  if (showPast) p.set('passados', '1');
  return p;
}

function writeUrl(params) {
  const q = params.toString();
  history.replaceState(history.state, '', location.pathname + (q ? '?' + q : '') + location.hash);
}

function syncFiltersToUrl() {
  if (!urlReady) return;
  const p = currentParams();
  const t = new URLSearchParams(location.search).get('t');
  if (t && dialog.open) p.set('t', t);
  writeUrl(p);
  document.getElementById('share-filters').hidden = ![...p.keys()].some(k => k !== 't' && k !== 'passados');
}

function applyFiltersFromUrl() {
  const p = new URLSearchParams(location.search);
  if (p.get('passados') === '1' && !showPast) document.getElementById('past').click();
  if (p.get('q')) document.getElementById('search').value = p.get('q');
  const add = (key, node) => { if (node) node.values.forEach(v => sel[key].add(v)); };
  for (const f of listParam(p.get('formato'))) add('format', findNode('format', n => normalize(n.label) === normalize(f)));
  for (const o of listParam(p.get('onde'))) add('place', trees.place.find(n => n.id === ({ portugal: 'pt', internacional: 'intl' })[normalize(o)]));
  for (const d of listParam(p.get('distrito'))) add('place', findNode('place', n => !n.children && normalize(n.values[0]) === normalize('pt:' + d)));
  for (const c of listParam(p.get('pais'))) add('place', findNode('place', n => !n.children && normalize(n.values[0]) === normalize('intl:' + c)));
  const rounds = listParam(p.get('round'));
  for (const c of listParam(p.get('circuito'))) {
    if (normalize(c) === 'rcq' && rounds.length) continue; // RCQ só com alguns rounds: tratado a seguir
    add('circuit', normalize(c) === 'rcq' ? findNode('circuit', n => n.values[0].startsWith('RCQ:') && (n.children || n.label === 'RCQ')) : findNode('circuit', n => normalize(n.values[0]) === normalize('type:' + c)));
  }
  // «round=R3» (links antigos) apanha a R3 de qualquer época; «round=R3 2026/27» só essa.
  for (const r of rounds) for (const n of trees.circuit.flatMap(x => x.children || [x])) if (n.values[0] === 'RCQ:' + r || n.values[0].startsWith('RCQ:' + r + ' ')) add('circuit', n);
  urlReady = true;
  renderEvents();
  const t = p.get('t');
  if (t && events.some(e => e.id === t)) openDetails(t);
}

const eventUrl = id => { const p = currentParams(); p.set('t', id); return location.origin + location.pathname + '?' + p.toString(); };

/** Partilha (menu do telemóvel) ou copia o link; devolve o texto a mostrar no botão. */
async function shareLink(url, title) {
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ title, url }); return null; }
  } catch (err) { if (err && err.name === 'AbortError') return null; }
  try { await navigator.clipboard.writeText(url); return 'Link copiado ✓'; } catch { /* sem acesso à área de transferência */ }
  window.prompt('Copia este link:', url);
  return null;
}

/* ---------- Detalhes ---------- */
const dialog = document.getElementById('detail-dialog');
let originFocus = null;

function openDetails(id) {
  const e = events.find(x => x.id === id);
  if (!e) return;
  originFocus = document.activeElement;
  const name = displayName(e);
  const dateMeta = e.dateStart === e.dateEnd ? formatDate(e.dateStart) : `${rangeLabel(e)} ${asDate(e.dateEnd).getFullYear()}`;

  // A etiqueta do tipo usa a cor do tipo (como na agenda); as restantes mantêm o estilo da v10.3.
  const tabs = [
    `<span class="dialog-tab dialog-type ${typeClass(e)}">${esc(typeName(e.tipo) + (e.fase ? ' · ' + e.fase : ''))}</span>`,
    ...[e.formato ? `${e.formato}${e.set ? ' · ' + e.set : ''}` : null,
      roundText(e) || null, e.vagas ? `${e.vagas} vagas` : null,
      e.scope === 'internacional' ? 'Internacional' : null,
    ].filter(Boolean).map(t => `<span class="dialog-tab">${esc(t)}</span>`),
  ];

  const details = [];
  const add = (label, value, muted) => details.push(`<div class="detail"><div class="detail-label">${esc(label)}</div><div class="detail-value${muted ? ' muted' : ''}">${esc(value)}</div></div>`);
  if (e.scope === 'portugal') add('Inscrição', e.preco != null ? (e.preco === 0 ? 'Grátis' : euro(e.preco)) : (e.precoTexto || 'A confirmar'), e.preco == null && !e.precoTexto);
  if (e.checkin) add('Check-in', e.checkin);
  if (e.dateStart !== e.dateEnd) add('Datas', `${rangeLabel(e)} ${asDate(e.dateEnd).getFullYear()}`);
  else if (!e.allDay && e.timeStart) add(e.timeEnd && e.timeEnd !== e.timeStart ? 'Horário' : 'Início', `${e.timeStart}${e.timeEnd && e.timeEnd !== e.timeStart ? '–' + e.timeEnd : ''}`);
  if (!isInfo(e)) add('Formato', e.formato ? `${e.formato}${e.set ? ' · ' + e.set : ''}` : 'A confirmar', !e.formato);
  if (e.scope === 'portugal') add('Juiz', e.juiz || 'A confirmar', !e.juiz);
  if (e.ronda) add('Ronda', e.rondaDeduzida ? `${roundText(e)} (pela data)` : roundText(e));
  if (e.fase) add('Fase', e.fase);
  if (e.vagas) add('Vagas', String(e.vagas));
  if (e.qualifica) add('Qualifica para', e.qualifica);

  const list = (title, items) => (items && items.length ? `<div class="detail-section"><h3>${esc(title)}</h3><ul>${items.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : '');
  const sub = [];
  if (name !== e.title) sub.push(e.title);
  const addr = addressOf(e);
  const where = e.scope === 'portugal' ? (addr ? null : [placeLine(e), e.local && normalize(e.local) !== normalize(e.loja) ? e.local : null].filter(Boolean).join(' — ')) || null : placeLine(e);
  if (addr) sub.push(addr);
  if (where) sub.push(e.scope === 'internacional' && flagFor(countryOf(e)) ? `${where} ${flagFor(countryOf(e))}` : where);

  document.getElementById('dialog-body').innerHTML =
    `<div class="dialog-top"><div><div class="dialog-meta">${esc(dateMeta)}</div><h2 id="modal-title">${esc(name)}</h2>${sub.map(s => `<div class="dialog-location">${esc(s)}</div>`).join('')}</div><button type="button" class="dialog-close" id="close-dialog" aria-label="Fechar detalhes">×</button></div>`
    + `<div class="dialog-tabs">${tabs.join('')}</div>`
    + (details.length ? `<div class="detail-grid">${details.join('')}</div>` : '')
    + list('Prémios', e.premios)
    + list('Notas', e.notas)
    + (e.emRevisao ? '<div class="dialog-note">Alguns dados deste evento estão a ser confirmados. Consulta o anúncio original antes de te inscreveres.</div>' : '');

  const link = safeUrl(e.ligacao);
  const map = safeUrl(storeInfo(e)?.mapa) || (e.scope === 'portugal' && (addr || e.local || e.localidade)
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr ? [e.loja, addr].filter(Boolean).join(', ') : [e.local || e.loja, e.localidade].filter(Boolean).join(', '))}` : null);
  const icsName = (e.title || 'evento').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) + '.ics';
  const store = storeKey(e);
  document.getElementById('dialog-actions').innerHTML =
    `<span class="add-cal"><span class="add-cal-label">Adicionar ao calendário:</span><a href="${esc(googleCalendarUrl(e))}" target="_blank" rel="noopener">Google Calendar</a><a href="#" class="ics-link" data-name="${esc(icsName)}">Apple / Outlook (.ics)</a></span>`
    + `<button type="button" class="share-btn" id="share-event">Partilhar</button>`
    + (store ? `<a href="#loja-${esc(store)}" class="store-link">Ver a loja</a>` : '')
    + (map ? `<a href="${esc(map)}" target="_blank" rel="noopener">Ver no mapa ↗</a>` : '')
    + storeLinksHtml(storeInfo(e))
    + (link ? `<a class="primary" href="${esc(link)}" target="_blank" rel="noopener">${isInfo(e) ? 'Mais informação' : 'Inscrição / anúncio'} ↗</a>` : (isInfo(e) ? '' : '<span class="unavailable">Ligação para inscrição não indicada</span>'));

  document.querySelector('#dialog-actions .ics-link').addEventListener('click', ev => {
    ev.preventDefault();
    const url = URL.createObjectURL(new Blob([icsFile(e)], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = ev.currentTarget.dataset.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
  document.getElementById('share-event').addEventListener('click', async ev => {
    const btn = ev.currentTarget, msg = await shareLink(eventUrl(e.id), e.title);
    if (msg) { btn.textContent = msg; setTimeout(() => { btn.textContent = 'Partilhar'; }, 2000); }
  });
  if (urlReady) { const p = currentParams(); p.set('t', e.id); writeUrl(p); }
  dialog.showModal();
  document.getElementById('close-dialog').addEventListener('click', () => dialog.close());
  document.getElementById('close-dialog').focus();
}
dialog.addEventListener('close', () => { if (urlReady) writeUrl(currentParams()); originFocus?.focus(); });
dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

/* ---------- Vistas ---------- */
/* ---------- Vistas (Agenda / Vencedores), ligadas ao endereço ---------- */
// #winners → Vencedores; qualquer outro endereço (#agenda, #m-2026-11, vazio) → Agenda.
// Mudar de vista cria uma entrada no histórico, por isso o botão Voltar funciona.
const viewFromHash = () => (location.hash === '#winners' ? 'winners' : location.hash.startsWith('#loja-') ? 'store' : 'agenda');
let dataReady = false;
let currentView = null;

function applyView(view) {
  if (view === 'store' && dataReady) renderStore(location.hash.slice(6));
  if (view !== 'store') document.title = 'Torneios MTG Portugal — Agenda de torneios de Magic';
  const changed = view !== currentView || view === 'store';
  currentView = view;
  document.body.dataset.view = view;
  document.querySelectorAll('.view').forEach(e => e.classList.toggle('active', e.id === view));
  document.querySelectorAll('[data-view]').forEach(b => { const is = b.dataset.view === view; b.classList.toggle('active', is); b.setAttribute('aria-current', is ? 'page' : 'false'); });
  if (!changed) return;
  const target = location.hash.startsWith('#m-') ? document.getElementById(location.hash.slice(1)) : null;
  if (target) target.scrollIntoView();
  else window.scrollTo({ top: 0, behavior: 'instant' });
}

function setView(view) {
  if (viewFromHash() === view && location.hash) { applyView(view); window.scrollTo({ top: 0, behavior: 'instant' }); return; }
  location.hash = view; // dispara hashchange → applyView
}

window.addEventListener('hashchange', () => { if (dialog.open && viewFromHash() !== 'agenda') dialog.close(); applyView(viewFromHash()); });
// Voltar/Avançar entre entradas com query diferente (ex.: loja → torneio aberto) não dispara «hashchange».
window.addEventListener('popstate', () => {
  const view = viewFromHash();
  if (view !== currentView) { if (dialog.open) dialog.close(); applyView(view); }
  const t = new URLSearchParams(location.search).get('t');
  if (view === 'agenda' && t && !dialog.open && events.some(e => e.id === t)) openDetails(t);
});
document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
document.getElementById('home').addEventListener('click', e => { e.preventDefault(); setView('agenda'); });
applyView(viewFromHash());

eventsEl.addEventListener('click', ev => { if (ev.target.closest('.empty-reset')) document.getElementById('reset').click(); });
document.getElementById('search').addEventListener('input', () => renderEvents());
document.getElementById('reset').addEventListener('click', () => { document.getElementById('search').value = ''; Object.values(sel).forEach(x => x.clear()); renderEvents(); });
document.getElementById('share-filters').addEventListener('click', async ev => {
  const btn = ev.currentTarget, msg = await shareLink(location.origin + location.pathname + '?' + currentParams().toString(), 'Torneios MTG Portugal');
  if (msg) { btn.textContent = msg; setTimeout(() => { btn.textContent = 'Partilhar filtros'; }, 2000); }
});
document.getElementById('past').addEventListener('click', ev => {
  showPast = !showPast;
  ev.currentTarget.setAttribute('aria-pressed', String(showPast));
  ev.currentTarget.innerHTML = `${showPast ? 'Ocultar' : 'Ver'} <span class="past-word">eventos </span>passados`;
  buildFilters();
  renderEvents();
});

/* ---------- Atalhos por tipo (botões rápidos) ---------- */
const QUICK = [
  { label: 'Todos', circuit: null, place: null },
  { label: 'RCQ', circuit: n => n.values[0].startsWith('RCQ:'), place: null, cls: 'rcq' },
  { label: 'LPP', circuit: n => n.values[0] === 'type:LPP', place: null, cls: 'lpp' },
  { label: 'Internacionais', circuit: null, place: n => n.id === 'intl' },
];
const quickValues = (key, pred) => (pred ? trees[key].filter(pred).flatMap(n => n.values) : []);
const sameSet = (set, arr) => set.size === arr.length && arr.every(v => set.has(v));
function renderQuick() {
  const el = document.getElementById('quick-types');
  el.innerHTML = QUICK.map((q, i) => {
    const c = quickValues('circuit', q.circuit), pl = quickValues('place', q.place);
    if ((q.circuit && !c.length) || (q.place && !pl.length)) return '';
    const on = sameSet(sel.circuit, c) && sameSet(sel.place, pl);
    return `<button type="button" class="quick ${q.cls ? typeClass({ typeKey: q.cls }) : ''}" data-quick="${i}" aria-pressed="${on}">${q.label}</button>`;
  }).join('');
}
document.getElementById('quick-types').addEventListener('click', ev => {
  const b = ev.target.closest('button.quick');
  if (!b) return;
  const q = QUICK[b.dataset.quick];
  sel.circuit = new Set(quickValues('circuit', q.circuit));
  sel.place = new Set(quickValues('place', q.place));
  renderEvents();
});

/* ---------- Subscrever o calendário (webcal) ---------- */
const FEEDS = [
  { file: 'calendar.ics', title: 'Todos os torneios', desc: 'Torneios em Portugal, internacionais e datas importantes.', filter: () => true },
  { file: 'calendar-rcq.ics', title: 'Só RCQs', desc: 'Regional Championship Qualifiers em Portugal.', filter: e => e.typeKey === 'rcq' },
  { file: 'calendar-internacional.ics', title: 'Só internacionais', desc: 'Spotlights, Regional Championships, Pro Tours e Worlds.', filter: e => e.scope === 'internacional' },
];
function openSubscribe() {
  originFocus = document.activeElement;
  const base = new URL('.', location.href);
  const upcoming = events.filter(e => !isPastEvent(e));
  const items = FEEDS.map(f => {
    const https = new URL(f.file, base).href, webcal = https.replace(/^https?:/, 'webcal:');
    const google = 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(webcal);
    const n = upcoming.filter(f.filter).length;
    return `<div class="feed"><div class="feed-head"><h3>${f.title}</h3><span class="feed-count">${plural(n, 'evento marcado', 'eventos marcados')}</span></div><p>${f.desc}</p>
      <div class="feed-actions"><a href="${esc(webcal)}">Apple / Outlook</a><a href="${esc(google)}" target="_blank" rel="noopener">Google Calendar</a><button type="button" class="share-btn feed-copy" data-url="${esc(https)}">Copiar link</button></div></div>`;
  }).join('');
  document.getElementById('dialog-body').innerHTML = `<div class="dialog-top"><div><div class="dialog-meta">Calendário</div><h2 id="modal-title">Subscrever no teu calendário</h2><div class="dialog-location">Os torneios aparecem no calendário do telemóvel ou do computador e actualizam-se sozinhos quando a agenda muda (o calendário verifica de poucas em poucas horas).</div></div><button type="button" class="dialog-close" id="close-dialog" aria-label="Fechar">×</button></div><div class="feeds">${items}</div>`;
  document.getElementById('dialog-actions').innerHTML = '';
  dialog.showModal();
  document.getElementById('close-dialog').addEventListener('click', () => dialog.close());
  document.querySelectorAll('.feed-copy').forEach(b => b.addEventListener('click', async ev => {
    const btn = ev.currentTarget;
    try { await navigator.clipboard.writeText(btn.dataset.url); btn.textContent = 'Link copiado ✓'; } catch { window.prompt('Copia este link:', btn.dataset.url); }
    setTimeout(() => { btn.textContent = 'Copiar link'; }, 2000);
  }));
  document.getElementById('close-dialog').focus();
}
document.getElementById('subscribe').addEventListener('click', openSubscribe);
document.getElementById('month-jump').addEventListener('change', ev => {
  const key = ev.target.value;
  if (!key) return;
  document.getElementById('m-' + key)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  ev.target.value = '';
});

/* ---------- Instalar no telemóvel (app web) ---------- */
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let installPrompt = null;
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker:', err.message)));
}
window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); installPrompt = ev; updateInstallLink(); });
window.addEventListener('appinstalled', () => { installPrompt = null; updateInstallLink(); });
function updateInstallLink() {
  // Aparece quando o navegador permite instalar, ou em telemóveis (com instruções), e nunca dentro da app já instalada.
  document.getElementById('install-wrap').hidden = isStandalone() || !(installPrompt || matchMedia('(pointer: coarse)').matches);
}
function openInstallHelp() {
  originFocus = document.activeElement;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const steps = ios
    ? ['Abre este site no <b>Safari</b>.', 'Toca no botão <b>Partilhar</b> (o quadrado com a seta para cima).', 'Escolhe <b>Adicionar ao ecrã principal</b> e confirma.']
    : ['Abre o menu do navegador (<b>⋮</b> no Chrome).', 'Escolhe <b>Instalar app</b> ou <b>Adicionar ao ecrã principal</b>.', 'Confirma. O ícone fica no ecrã do telemóvel.'];
  document.getElementById('dialog-body').innerHTML = `<div class="dialog-top"><div><div class="dialog-meta">App web</div><h2 id="modal-title">Instalar no telemóvel</h2><div class="dialog-location">Fica com um ícone no ecrã e abre em ecrã inteiro. Sem rede, mostra a última agenda guardada.</div></div><button type="button" class="dialog-close" id="close-dialog" aria-label="Fechar">×</button></div><ol class="install-steps">${steps.map(t => `<li>${t}</li>`).join('')}</ol>`;
  document.getElementById('dialog-actions').innerHTML = '';
  dialog.showModal();
  document.getElementById('close-dialog').addEventListener('click', () => dialog.close());
  document.getElementById('close-dialog').focus();
}
document.getElementById('install-app').addEventListener('click', async () => {
  if (installPrompt) {
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null; updateInstallLink();
      return;
    } catch { /* o navegador recusou: mostra as instruções */ }
  }
  openInstallHelp();
});
updateInstallLink();
// Aviso quando não há rede (a agenda vem da cópia guardada).
const updateOnline = () => { document.getElementById('offline-note').hidden = navigator.onLine !== false; };
window.addEventListener('online', updateOnline); window.addEventListener('offline', updateOnline); updateOnline();

/* ---------- Arranque ---------- */
async function loadJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function init() {
  // A ficha das lojas carrega em paralelo e fica pronta antes da agenda aparecer.
  const storesReady = loadJson('data/stores.json').then(s => loadStoreInfo(s.lojas)).catch(err => console.warn('Ficha das lojas indisponível', err));
  try {
    const data = await loadJson('data/events.json');
    events = data.events || [];
    milestones = data.milestones || [];
    today = todayLisbon();
    const updated = new Date(data.generatedAt);
    const stamp = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(updated);
    $('#footnote').innerHTML = `<strong>Fonte:</strong> Google Calendar «Torneios MTG», sincronizado automaticamente. Última actualização: ${esc(stamp)}. Horas em hora de Portugal continental.`;
    $('#updated').textContent = `actualizado ${stamp}`;
    await storesReady;
    buildFilters();
    renderEvents();
  } catch (err) {
    console.error(err);
    eventsEl.innerHTML = '<div class="empty">Não foi possível carregar a agenda. Tenta novamente daqui a pouco.</div>';
  }
  try {
    const w = await loadJson('data/winners.json');
    winners = w.results || [];
    $('#winners-title').textContent = w.title || '';
    $('#results').innerHTML = winners.map(resultHtml).join('');
  } catch (err) { console.error(err); }
  dataReady = true;
  if (events.length) applyFiltersFromUrl();
  applyView(viewFromHash());
}
init();
