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
function fillSelect(el, groups) {
  const keep = el.value;
  el.innerHTML = '<option value="">Todos</option>' + groups.map(g => g.label
    ? `<optgroup label="${esc(g.label)}">${g.options.map(o => `<option value="${esc(o.value)}">${esc(o.text)}</option>`).join('')}</optgroup>`
    : g.options.map(o => `<option value="${esc(o.value)}">${esc(o.text)}</option>`).join('')).join('');
  if ([...el.options].some(o => o.value === keep)) el.value = keep;
}
const byCount = (list, key) => {
  const counts = new Map();
  for (const e of list) { const k = key(e); if (k) counts.set(k, (counts.get(k) || 0) + 1); }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt')).map(([k]) => k);
};
function buildFilters() {
  const pool = events.filter(e => !isInfo(e) && (showPast || !isPastEvent(e)));
  fillSelect($('#format'), [{ options: byCount(pool, e => e.formato).map(f => ({ value: f, text: f })) }]);
  const districts = [...new Set(pool.map(e => e.distrito).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
  fillSelect($('#district'), [
    { options: [{ value: 'scope:portugal', text: 'Portugal' }, { value: 'scope:internacional', text: 'Internacional' }] },
    { label: 'Distritos', options: districts.map(d => ({ value: 'district:' + d, text: d })) },
  ]);
  const types = byCount(events.filter(e => showPast || !isPastEvent(e)), e => e.tipo);
  const rounds = [...new Set(pool.filter(e => e.typeKey === 'rcq' && e.ronda).map(e => e.ronda))].sort();
  fillSelect($('#circuit'), [
    { options: types.map(t => ({ value: 'type:' + t, text: t })) },
    ...(rounds.length ? [{ label: 'RCQ por round', options: rounds.map(r => ({ value: 'round:' + r, text: `RCQ · Round ${r.replace(/\D/g, '')}` })) }] : []),
  ]);
}

let today = todayLisbon();
const isPastEvent = e => e.dateEnd < today;

function matches(e, q) {
  const f = $('#format').value, d = $('#district').value, c = $('#circuit').value;
  if (!showPast && isPastEvent(e)) return false;
  if (q && ![e.title, e.loja, e.localidade, e.distrito, e.formato, e.set, e.tipo, e.ronda, e.fase, e.local, e.pais].some(v => normalize(v).includes(q))) return false;
  if (c.startsWith('type:') && e.tipo !== c.slice(5)) return false;
  if (c.startsWith('round:') && !(e.typeKey === 'rcq' && e.ronda === c.slice(6))) return false;
  if (isInfo(e)) return !f && !d; // datas informativas só aparecem sem filtros de formato/local
  if (f && e.formato !== f) return false;
  if (d.startsWith('scope:') && e.scope !== d.slice(6)) return false;
  if (d.startsWith('district:') && e.distrito !== d.slice(9)) return false;
  return true;
}

/* ---------- Agenda: cartões por dia ---------- */
const spanDays = e => daysBetween(e.dateStart, e.dateEnd) + 1;
const formatText = e => (e.formato ? `${e.formato}${e.set ? ' · ' + e.set : ''}` : null);

function priceHtml(e) {
  if (e.scope === 'internacional') {
    const n = spanDays(e);
    return `<span class="price-col unknown">${n} ${n === 1 ? 'dia' : 'dias'}<small>Internacional</small></span>`;
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
  const c = $('#circuit').value, f = $('#format').value, d = $('#district').value;
  if (f || d) return false;
  if (!c) return true;
  return c === 'type:' + m.circuit || c === 'round:' + m.ronda;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const COL_HEAD = '<div class="col-head" aria-hidden="true"><span class="r">Tipo</span><span>Evento</span><span>Formato</span><span>Horário</span><span class="r">Inscrição</span></div>';

function renderLegend(list) {
  const seen = new Map();
  for (const e of list) { const k = typeClass(e); if (!seen.has(k)) seen.set(k, typeLabel(e)); }
  $('#type-legend').innerHTML = [...seen].map(([k, label]) => `<span class="legend-item ${k}" role="listitem">${esc(label)}</span>`).join('');
}

function renderEvents() {
  const q = normalize($('#search').value.trim());
  const filtered = events.filter(e => matches(e, q));
  const tournaments = filtered.filter(e => !isInfo(e)).length;
  const infoDates = filtered.length - tournaments;
  // Só torneios contam como «torneios»; se apenas houver datas informativas, diz-se isso.
  $('#count').textContent = tournaments || !infoDates ? plural(tournaments, 'torneio', 'torneios') : plural(infoDates, 'data informativa', 'datas informativas');
  renderLegend(filtered);
  if (!filtered.length) {
    $('#month-links').innerHTML = '';
    eventsEl.innerHTML = `<div class="empty">Nenhum torneio encontrado.</div>`;
    return;
  }
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
  for (const m of milestones) {
    if (!milestoneVisible(m)) continue;
    for (const kind of ['start', 'end']) {
      const date = kind === 'start' ? m.start : m.end;
      if (!months.has(date.slice(0, 7)) || (!showPast && date < today)) continue;
      dayFor(date)[kind === 'start' ? 'before' : 'after'].push(milestoneHtml(m, kind));
    }
  }
  const multiDay = filtered.filter(e => e.dateStart !== e.dateEnd);
  const sortedKeys = [...months.keys()].sort();
  $('#month-links').innerHTML = sortedKeys.map(key => { const g = months.get(key); return `<a href="#m-${key}">${months_[g.date.getMonth()]} ${g.date.getFullYear()}</a>`; }).join('');

  eventsEl.innerHTML = sortedKeys.map(key => {
    const g = months.get(key);
    const cards = [...g.days.keys()].sort().map(date => {
      const day = g.days.get(date), dt = asDate(date);
      const cont = multiDay.filter(e => e.dateStart < date && e.dateEnd >= date);
      const count = day.events.length ? plural(day.events.length, 'torneio', 'torneios')
        : day.info.length ? plural(day.info.length, 'data informativa', 'datas informativas') : '';
      const label = `${longWeek[dt.getDay()]}, ${dt.getDate()} de ${months_[dt.getMonth()]} de ${dt.getFullYear()}`;
      return `<article class="day-card" aria-label="${esc(label)}"><div class="day-head"><span class="day-num" aria-hidden="true">${dt.getDate()}</span><span class="day-names"><span class="day-wd">${longWeek[dt.getDay()]}</span><span class="day-mon">${months_[dt.getMonth()]} ${dt.getFullYear()}</span></span>${count ? `<span class="day-count">${count}</span>` : ''}</div>`
        + day.before.join('') + day.events.map(rowHtml).join('') + day.info.map(infoHtml).join('')
        + cont.map(e => contHtml(e, date)).join('') + day.after.join('') + `</article>`;
    }).join('');
    const total = g.total ? plural(g.total, 'torneio', 'torneios') : '';
    return `<section class="month-block" id="m-${key}" aria-label="${months_[g.date.getMonth()]} ${g.date.getFullYear()}"><div class="month-title"><h3>${months_[g.date.getMonth()]}</h3><span class="year">${g.date.getFullYear()}</span><span class="total">${total}</span></div>${COL_HEAD}${cards}</section>`;
  }).join('');
}

eventsEl.addEventListener('click', ev => {
  const el = ev.target.closest('[data-id]');
  if (el) openDetails(el.dataset.id);
});

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
  document.getElementById('dialog-actions').innerHTML =
    (map ? `<a href="${esc(map)}" target="_blank" rel="noopener">Ver no mapa ↗</a>` : '')
    + (link ? `<a class="primary" href="${esc(link)}" target="_blank" rel="noopener">${isInfo(e) ? 'Mais informação' : 'Inscrição / anúncio'} ↗</a>` : '<span class="unavailable">Ligação para inscrição não indicada</span>');

  dialog.showModal();
  document.getElementById('close-dialog').addEventListener('click', () => dialog.close());
  document.getElementById('close-dialog').focus();
}
dialog.addEventListener('close', () => { originFocus?.focus(); });
dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

/* ---------- Vistas ---------- */
/* ---------- Vistas (Agenda / Vencedores), ligadas ao endereço ---------- */
// #winners → Vencedores; qualquer outro endereço (#agenda, #m-2026-11, vazio) → Agenda.
// Mudar de vista cria uma entrada no histórico, por isso o botão Voltar funciona.
const viewFromHash = () => (location.hash === '#winners' ? 'winners' : 'agenda');
let currentView = null;

function applyView(view) {
  const changed = view !== currentView;
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

window.addEventListener('hashchange', () => applyView(viewFromHash()));
document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
document.getElementById('home').addEventListener('click', e => { e.preventDefault(); setView('agenda'); });
applyView(viewFromHash());

for (const id of ['search', 'format', 'district', 'circuit']) document.getElementById(id).addEventListener('input', renderEvents);
document.getElementById('reset').addEventListener('click', () => { for (const id of ['search', 'format', 'district', 'circuit']) document.getElementById(id).value = ''; renderEvents(); });
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
    $('#winners-title').textContent = w.title || '';
    $('#results').innerHTML = (w.results || []).map(r => {
      const d = asDate(r.date);
      const meta = [r.store, r.city, r.deck || 'Deck não indicado'].filter(Boolean).map(esc).join(' · ');
      return `<div class="result"><span class="date">${d.getDate()} ${mon3(d).toUpperCase()}<br>${d.getFullYear()}</span><span class="win">${esc(r.name)}</span><span class="store-cell">${esc(r.store)}<span class="location">${esc(r.city)}</span></span><span class="deck">${esc(r.deck || 'Não indicado')}</span><span class="num">${r.players == null ? '—' : r.players}<small>jogadores</small></span><span class="result-meta">${meta}</span></div>`;
    }).join('');
  } catch (err) { console.error(err); }
}
init();
