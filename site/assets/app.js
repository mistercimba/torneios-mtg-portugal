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
  const where = e.scope === 'portugal' ? [e.loja, e.local || e.localidade].filter(Boolean).join(', ') : (e.local || placeLine(e) || '');
  const info = [
    e.tipo + (e.ronda ? ' · ' + e.ronda : '') + (e.fase ? ' · ' + e.fase : ''),
    e.formato ? 'Formato: ' + e.formato + (e.set ? ' · ' + e.set : '') : null,
    e.checkin ? 'Check-in: ' + e.checkin : null,
    e.scope === 'portugal' ? 'Inscrição: ' + (e.preco != null ? (e.preco === 0 ? 'Grátis' : euro(e.preco)) : (e.precoTexto || 'a confirmar')) : null,
    safeUrl(e.ligacao) ? 'Inscrição / anúncio: ' + e.ligacao : null,
    'Torneios MTG Portugal: ' + location.href.split('#')[0],
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
  const txt = v => String(v).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const fold = line => { const out = []; let rest = line; while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ' ' + rest.slice(74); } out.push(rest); return out.join('\r\n'); };
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
  return [e.local, e.pais].filter(Boolean).join(' · ');
};
const timeLine = e => {
  if (e.checkin) return `Check-in ${e.checkin}`;
  if (e.dateStart !== e.dateEnd) return rangeLabel(e, true);
  if (!e.allDay && e.timeStart) return `Início ${e.timeStart}`;
  return '';
};

/* ---------- Filtros dinâmicos (gerados a partir dos dados) ---------- */
function fillSelect(el, groups, all = 'Todos') {
  const keep = el.value;
  el.innerHTML = `<option value="">${all}</option>` + groups.map(g => g.label
    ? `<optgroup label="${esc(g.label)}">${g.options.map(o => `<option value="${esc(o.value)}">${esc(o.text)}</option>`).join('')}</optgroup>`
    : g.options.map(o => `<option value="${esc(o.value)}">${esc(o.text)}</option>`).join('')).join('');
  if ([...el.options].some(o => o.value === keep)) el.value = keep;
}
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

function setDependentVisibility() {
  // «Distrito» só com Portugal; «Round» só com RCQ (e só se houver rounds). Ao esconder, o valor volta a «Todos».
  const showDistrict = $('#scope').value === 'portugal' && $('#district').options.length > 1;
  const showRound = $('#circuit').value === 'type:RCQ' && $('#round').options.length > 1;
  $('#district-filter').hidden = !showDistrict;
  $('#round-filter').hidden = !showRound;
  if (!showDistrict) $('#district').value = '';
  if (!showRound) $('#round').value = '';
}

function buildFilters() {
  const pool = events.filter(e => !isInfo(e) && (showPast || !isPastEvent(e)));
  // Lista fixa dos formatos habituais (mesmo sem torneios marcados) + formatos novos que apareçam no calendário.
  const formats = [...new Set([...FORMAT_ORDER.map(k => FORMAT_NAME[k]), 'Limited', ...pool.map(filterFormat).filter(Boolean)])].sort(byFormatOrder);
  fillSelect($('#format'), [{ options: formats.map(f => ({ value: f, text: f })) }]);
  const districts = [...new Set(pool.filter(e => e.scope === 'portugal').map(e => e.distrito).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
  fillSelect($('#district'), [{ options: districts.map(d => ({ value: d, text: d })) }]);
  const types = byCount(events.filter(e => showPast || !isPastEvent(e)), e => e.tipo);
  fillSelect($('#circuit'), [{ options: types.map(t => ({ value: 'type:' + t, text: t === 'Campeonato / Evento especial' ? 'Evento especial' : t })) }]);
  const rounds = [...new Set(pool.filter(e => e.typeKey === 'rcq' && e.ronda).map(e => e.ronda))].sort();
  fillSelect($('#round'), [{ options: rounds.map(r => ({ value: r, text: `Round ${r.replace(/\D/g, '')}` })) }], 'Todas');
  setDependentVisibility();
}

let today = todayLisbon();
const isPastEvent = e => e.dateEnd < today;

function matches(e, q) {
  const f = $('#format').value, sc = $('#scope').value, d = $('#district').value, c = $('#circuit').value, r = $('#round').value;
  if (!showPast && isPastEvent(e)) return false;
  if (q && ![e.title, e.loja, e.localidade, e.distrito, e.formato, e.set, e.tipo, e.ronda, e.fase, e.local, e.pais].some(v => normalize(v).includes(q))) return false;
  if (c && e.tipo !== c.slice(5)) return false;
  if (r && e.ronda !== r) return false;
  if (isInfo(e)) return !f && !sc; // datas informativas só aparecem sem filtros de formato/local
  if (f && filterFormat(e) !== f) return false;
  if (sc && e.scope !== sc) return false;
  if (d && e.distrito !== d) return false;
  return true;
}

/* ---------- Agenda: cartões por dia ---------- */
const spanDays = e => daysBetween(e.dateStart, e.dateEnd) + 1;
const formatText = e => (e.formato ? `${e.formato}${e.set ? ' · ' + e.set : ''}` : null);

function priceHtml(e) {
  if (e.scope === 'internacional') {
    // País (última parte da localização); a duração já está na etiqueta das datas.
    const country = (e.pais && e.pais !== 'Portugal' ? e.pais : (e.local || '').split(',').pop().trim()) || '';
    return `<span class="price-col intl">${esc(country || 'Internacional')}${country ? '<small>Internacional</small>' : ''}</span>`;
  }
  if (e.preco != null) return `<span class="price-col">${esc(e.preco === 0 ? 'Grátis' : euro(e.preco))}<small>Inscrição</small></span>`;
  return `<span class="price-col unknown">${esc(e.precoTexto || 'A confirmar')}<small>Inscrição</small></span>`;
}

function typePillHtml(e) {
  const extra = [e.ronda, e.fase].filter(Boolean).map(esc).join(' · ');
  const title = e.ronda && e.rondaDeduzida ? ' title="Round atribuída pela data (janela oficial da round)"' : '';
  return `<span class="type-pill"${title}>${esc(typeLabel(e))}${extra ? ' · ' + extra : ''}</span>`;
}

function rowHtml(e) {
  const place = placeLine(e);
  const fmt = formatText(e);
  const time = timeLine(e);
  const multi = e.dateStart !== e.dateEnd;
  const n = spanDays(e);
  const range = multi ? `<span class="range-pill">${esc(rangeLabel(e, true))} · ${n} dias</span>` : '';
  const meta = [`<b>${esc(fmt || 'Formato a confirmar')}</b>`, place && esc(place), !multi && time && esc(time)].filter(Boolean).join('  ·  ');
  return `<button type="button" class="event-row ${typeClass(e)}" data-id="${esc(e.id)}" aria-label="Detalhes de ${esc(displayName(e))}, ${esc(formatDate(e.dateStart))}">`
    + `<span class="event-type">${typePillHtml(e)}${range}</span>`
    + `<span class="event-main"><span class="store">${esc(displayName(e))}</span>${place ? `<span class="subline">${esc(place)}</span>` : ''}<span class="meta-m">${meta}</span></span>`
    + `<span class="format-col${fmt ? '' : ' pending'}">${esc(fmt || 'Formato a confirmar')}</span>`
    + `<span class="event-time">${esc(time)}</span>`
    + priceHtml(e) + `</button>`;
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
  const c = $('#circuit').value, f = $('#format').value, sc = $('#scope').value, r = $('#round').value;
  if (f || sc) return false;
  if (!c) return true;
  return c === 'type:' + m.circuit && (!r || r === m.ronda);
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const COL_HEAD = '<div class="col-head" aria-hidden="true"><span>Tipo</span><span>Evento</span><span>Formato</span><span>Horário</span><span class="r">Inscrição</span></div>';

function renderLegend(list) {
  const seen = new Map();
  for (const e of list) { const k = typeClass(e); if (!seen.has(k)) seen.set(k, typeLabel(e)); }
  $('#type-legend').innerHTML = [...seen].map(([k, label]) => `<span class="legend-item ${k}" role="listitem">${esc(label)}</span>`).join('');
}

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
      return `<article class="day-card" data-date="${date}" aria-label="${esc(label)}"><div class="day-head"><span class="day-num" aria-hidden="true">${dt.getDate()}</span><span class="day-names"><span class="day-wd">${longWeek[dt.getDay()]}${rel ? ` <span class="day-rel">${rel}</span>` : ''}</span><span class="day-mon">${months_[dt.getMonth()]} ${dt.getFullYear()}</span></span>${count ? `<span class="day-count">${count}</span>` : ''}</div>`
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
  renderLegend(filtered);
  syncFiltersToUrl();
  if (!filtered.length) {
    $('#month-links').innerHTML = '';
    eventsEl.innerHTML = `<div class="empty"><p>Nenhum torneio encontrado com estes filtros.</p><button type="button" class="empty-reset">Limpar filtros</button></div>`;
    return;
  }
  const { months, sortedKeys, html } = monthsHtml(filtered, true);
  $('#month-links').innerHTML = sortedKeys.map(key => { const g = months.get(key); return `<a href="#m-${key}">${months_[g.date.getMonth()]} ${g.date.getFullYear()}</a>`; }).join('');
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
let winners = [];

function renderStore(key) {
  const el = document.getElementById('store');
  const list = events.filter(e => storeKey(e) === key);
  const wins = winners.filter(w => storeKeyFor(w.store, w.city) === key);
  if (!list.length && !wins.length) {
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
  const address = list.map(e => e.local).filter(v => v && normalize(v) !== normalize(name) && normalize(v) !== normalize(ref.loja)).pop();
  const map = address || ref.localidade ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || [name, ref.localidade].join(', '))}` : null;
  const stats = [plural(upcoming.length, 'torneio marcado', 'torneios marcados'), past.length ? plural(past.length, 'torneio anterior', 'torneios anteriores') : null, wins.length ? plural(wins.length, 'vencedor registado', 'vencedores registados') : null].filter(Boolean).join(' · ');
  document.title = `${name} — Torneios MTG Portugal`;
  el.innerHTML = `<div class="store-page">
    <a href="#agenda" class="back-link">← Agenda</a>
    <div class="store-head"><div><h2>${esc(name)}</h2><p class="store-place">${esc(place)}${address ? `<span class="store-address">${esc(address)}</span>` : ''}</p><p class="store-stats">${esc(stats)}</p></div>
    <div class="store-actions">${map ? `<a href="${esc(map)}" target="_blank" rel="noopener">Ver no mapa ↗</a>` : ''}<button type="button" class="share-btn" id="share-store">Partilhar</button></div></div>
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
  const meta = [r.store, r.city, r.deck || 'Deck não indicado'].filter(Boolean).map(esc).join(' · ');
  const storeName = key ? `<a href="#loja-${esc(key)}" class="store-name-link">${esc(r.store)}</a>` : esc(r.store);
  return `<div class="result"><span class="date">${d.getDate()} ${mon3(d).toUpperCase()}<br>${d.getFullYear()}</span><span class="win">${esc(r.name)}</span><span class="store-cell">${storeName}<span class="location">${esc(r.city)}</span></span><span class="deck">${esc(r.deck || 'Não indicado')}</span><span class="num">${r.players == null ? '—' : r.players}<small>jogadores</small></span><span class="result-meta">${meta}</span></div>`;
}

/* ---------- Endereços partilháveis ---------- */
// Filtros no endereço (?formato=Standard&onde=portugal&distrito=Lisboa&circuito=RCQ&round=R3&q=...&passados=1)
// e torneio aberto (?t=<id>). A vista (Agenda, Vencedores, loja) continua no #.
const URL_KEYS = { search: 'q', format: 'formato', scope: 'onde', district: 'distrito', circuit: 'circuito', round: 'round' };
let urlReady = false;

function currentParams() {
  const p = new URLSearchParams();
  for (const [id, key] of Object.entries(URL_KEYS)) {
    let v = document.getElementById(id).value.trim();
    if (id === 'circuit' && v) v = v.slice(5);
    if (v) p.set(key, v);
  }
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
  const setIf = (id, v) => { const el = document.getElementById(id); if (v != null && [...el.options].some(o => o.value === v)) el.value = v; };
  if (p.get('q')) document.getElementById('search').value = p.get('q');
  setIf('format', p.get('formato'));
  setIf('scope', p.get('onde'));
  setDependentVisibility();
  setIf('district', p.get('distrito'));
  setIf('circuit', p.get('circuito') ? 'type:' + p.get('circuito') : null);
  setDependentVisibility();
  setIf('round', p.get('round'));
  setDependentVisibility();
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
    `<span class="dialog-tab dialog-type ${typeClass(e)}">${esc(e.tipo + (e.fase ? ' · ' + e.fase : ''))}</span>`,
    ...[e.formato ? `${e.formato}${e.set ? ' · ' + e.set : ''}` : null,
      e.ronda, e.vagas ? `${e.vagas} vagas` : null,
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
  if (e.ronda) add('Ronda', e.rondaDeduzida ? `${e.ronda} (pela data)` : e.ronda);
  if (e.fase) add('Fase', e.fase);
  if (e.vagas) add('Vagas', String(e.vagas));

  const list = (title, items) => (items && items.length ? `<div class="detail-section"><h3>${esc(title)}</h3><ul>${items.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : '');
  const sub = [];
  if (name !== e.title) sub.push(e.title);
  const where = e.scope === 'portugal' ? [placeLine(e), e.local && normalize(e.local) !== normalize(e.loja) ? e.local : null].filter(Boolean).join(' — ') : placeLine(e);
  if (where) sub.push(where);

  document.getElementById('dialog-body').innerHTML =
    `<div class="dialog-top"><div><div class="dialog-meta">${esc(dateMeta)}</div><h2 id="modal-title">${esc(name)}</h2>${sub.map(s => `<div class="dialog-location">${esc(s)}</div>`).join('')}</div><button type="button" class="dialog-close" id="close-dialog" aria-label="Fechar detalhes">×</button></div>`
    + `<div class="dialog-tabs">${tabs.join('')}</div>`
    + (details.length ? `<div class="detail-grid">${details.join('')}</div>` : '')
    + list('Prémios', e.premios)
    + list('Notas', e.notas)
    + list('Informação original do anúncio', e.detalhesOriginais)
    + (e.emRevisao ? '<div class="dialog-note">Alguns dados deste evento estão a ser confirmados. Consulta o anúncio original antes de te inscreveres.</div>' : '');

  const link = safeUrl(e.ligacao);
  const map = e.scope === 'portugal' && (e.local || e.localidade)
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([e.local || e.loja, e.localidade].filter(Boolean).join(', '))}` : null;
  const icsName = (e.title || 'evento').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) + '.ics';
  const store = storeKey(e);
  document.getElementById('dialog-actions').innerHTML =
    `<span class="add-cal"><span class="add-cal-label">Adicionar ao calendário:</span><a href="${esc(googleCalendarUrl(e))}" target="_blank" rel="noopener">Google Calendar</a><a href="#" class="ics-link" data-name="${esc(icsName)}">Apple / Outlook (.ics)</a></span>`
    + `<button type="button" class="share-btn" id="share-event">Partilhar</button>`
    + (store ? `<a href="#loja-${esc(store)}" class="store-link">Ver a loja</a>` : '')
    + (map ? `<a href="${esc(map)}" target="_blank" rel="noopener">Ver no mapa ↗</a>` : '')
    + (link ? `<a class="primary" href="${esc(link)}" target="_blank" rel="noopener">${isInfo(e) ? 'Mais informação' : 'Inscrição / anúncio'} ↗</a>` : '<span class="unavailable">Ligação para inscrição não indicada</span>');

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

window.addEventListener('hashchange', () => { if (dialog.open) dialog.close(); applyView(viewFromHash()); });
document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
document.getElementById('home').addEventListener('click', e => { e.preventDefault(); setView('agenda'); });
applyView(viewFromHash());

const FILTERS = ['search', 'format', 'scope', 'district', 'circuit', 'round'];
eventsEl.addEventListener('click', ev => { if (ev.target.closest('.empty-reset')) document.getElementById('reset').click(); });
for (const id of FILTERS) document.getElementById(id).addEventListener('input', () => { setDependentVisibility(); renderEvents(); });
document.getElementById('reset').addEventListener('click', () => { for (const id of FILTERS) document.getElementById(id).value = ''; setDependentVisibility(); renderEvents(); });
document.getElementById('share-filters').addEventListener('click', async ev => {
  const btn = ev.currentTarget, msg = await shareLink(location.origin + location.pathname + '?' + currentParams().toString(), 'Torneios MTG Portugal');
  if (msg) { btn.textContent = msg; setTimeout(() => { btn.textContent = 'Partilhar filtros'; }, 2000); }
});
document.getElementById('past').addEventListener('click', ev => {
  showPast = !showPast;
  ev.currentTarget.setAttribute('aria-pressed', String(showPast));
  ev.currentTarget.textContent = showPast ? 'Ocultar eventos passados' : 'Ver eventos passados';
  buildFilters();
  renderEvents();
});

/* ---------- Arranque ---------- */
async function loadJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function init() {
  try {
    const data = await loadJson('data/events.json');
    events = data.events || [];
    milestones = data.milestones || [];
    today = todayLisbon();
    const updated = new Date(data.generatedAt);
    const stamp = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(updated);
    $('#footnote').innerHTML = `<strong>Fonte:</strong> Google Calendar «Torneios MTG», sincronizado automaticamente. Última actualização: ${esc(stamp)}. Horas em hora de Portugal continental.`;
    $('#updated').textContent = `actualizado ${stamp}`;
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
