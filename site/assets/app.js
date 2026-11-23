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

/* ---------- Utilitários ---------- */
const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const weekdays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const shortWeek = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const asDate = s => new Date(s + 'T12:00:00');
const mon3 = d => months[d.getMonth()].slice(0, 3);
const formatDate = s => { const d = asDate(s); return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} · ${weekdays[d.getDay()]}`; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normalize = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const euro = n => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n);
const todayLisbon = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const daysBetween = (a, b) => Math.round((asDate(b) - asDate(a)) / 86400000);
const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : null);

/** "24–26 Outubro" ou "31 Outubro – 2 Novembro" (com ano se mudar). */
function rangeLabel(e, short) {
  const a = asDate(e.dateStart), b = asDate(e.dateEnd);
  const m = d => (short ? mon3(d) : months[d.getMonth()]);
  if (e.dateStart === e.dateEnd) return `${a.getDate()} ${m(a)}`;
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${a.getDate()}–${b.getDate()} ${m(a)}`;
  return `${a.getDate()} ${m(a)} – ${b.getDate()} ${m(b)}${a.getFullYear() !== b.getFullYear() ? ' ' + b.getFullYear() : ''}`;
}

/* ---------- Cores das etiquetas ---------- */
const FORMAT_COLOR = { standard: 'c-blue', limited: 'c-amber', modern: 'c-green', pioneer: 'c-indigo', pauper: 'c-teal', legacy: 'c-red', vintage: 'c-brown', premodern: 'c-brown', cedh: 'c-pink', commander: 'c-pink' };
const TYPE_COLOR = { rcq: 'c-purple', lpp: 'c-teal', lll: 'c-red', cedh: 'c-pink', premier: 'c-indigo', prerelease: 'c-amber', qualificador: 'c-green' };
const ROUND_COLOR = ['', 'c-green', 'c-blue', 'c-amber', 'c-teal', 'c-pink'];
const roundClass = r => ROUND_COLOR[Number(String(r).replace(/\D/g, '')) % ROUND_COLOR.length] || '';

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
  if (e.dateStart !== e.dateEnd) return rangeLabel(e);
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

/* ---------- Agenda ---------- */
function chipsHtml(e) {
  const format = e.formato
    ? `<span class="event-format ${FORMAT_COLOR[e.formatFamily] || ''}">${esc(e.formato)}${e.set ? ' · ' + esc(e.set) : ''}</span>`
    : `<span class="event-format pending">Formato a confirmar</span>`;
  const type = `<span class="event-series ${TYPE_COLOR[e.typeFamily] || ''}">${esc(e.typeShort)}${e.fase ? ' · ' + esc(e.fase) : ''}</span>`;
  const round = e.ronda ? `<span class="event-round ${roundClass(e.ronda)}"${e.rondaDeduzida ? ' title="Round atribuída pela data (janela oficial da round)"' : ''}>${esc(e.ronda)}</span>` : '';
  return format + type + round;
}

function priceHtml(e) {
  if (e.scope === 'internacional') {
    const n = daysBetween(e.dateStart, e.dateEnd) + 1;
    return `<span class="price-col unknown">${n} ${n === 1 ? 'dia' : 'dias'}<small>Internacional</small></span>`;
  }
  if (e.preco != null) return `<span class="price-col">${esc(e.preco === 0 ? 'Grátis' : euro(e.preco))}<small>Inscrição</small></span>`;
  return `<span class="price-col unknown">${esc(e.precoTexto || 'A confirmar')}<small>Inscrição</small></span>`;
}

function rowHtml(e) {
  const place = placeLine(e);
  const placeCol = e.scope === 'portugal'
    ? `${esc(e.localidade || e.local || '—')}${e.distrito && normalize(e.distrito) !== normalize(e.localidade) ? '<small>' + esc(e.distrito) + '</small>' : ''}`
    : `${esc(e.local || '—')}${e.pais ? '<small>' + esc(e.pais) + '</small>' : ''}`;
  return `<button type="button" class="event-row" data-id="${esc(e.id)}" aria-label="Detalhes de ${esc(displayName(e))}, ${esc(formatDate(e.dateStart))}"><span class="event-main"><span class="eyebrow">${chipsHtml(e)}</span><span class="store">${esc(displayName(e))}</span>${place ? `<span class="subline">${esc(place)}</span>` : ''}<span class="event-checkin">${esc(timeLine(e))}</span></span><span class="event-place">${placeCol}</span>${priceHtml(e)}<span class="arr" aria-hidden="true">↗</span></button>`;
}

function infoHtml(e) {
  const d = asDate(e.dateStart);
  const when = e.dateStart !== e.dateEnd ? rangeLabel(e) : (!e.allDay && e.timeStart ? `${e.timeStart} (hora de Lisboa)` : '');
  return `<button type="button" class="round-milestone info-row" data-id="${esc(e.id)}" aria-label="${esc(e.tipo)}: ${esc(e.title)}, ${esc(formatDate(e.dateStart))}"><span class="milestone-date">${d.getDate()} ${mon3(d).toUpperCase()} ${d.getFullYear()}</span><span class="milestone-name"><span class="info-kind">${esc(e.tipo)}</span>${esc(e.title)}${when ? `<span class="info-when">${esc(when)}</span>` : ''}</span></button>`;
}

function milestoneHtml(m, kind) {
  const date = kind === 'end' ? m.end : m.start, d = asDate(date);
  const label = kind === 'end' ? 'Fim' : 'Início';
  return `<div class="round-milestone ${kind}" role="note" aria-label="${label} da ${esc(m.label)} em ${esc(formatDate(date))}"><span class="milestone-date">${d.getDate()} ${mon3(d).toUpperCase()} ${d.getFullYear()}</span><span class="milestone-name">${label} ${esc(m.circuit)} ${esc(m.label)}</span></div>`;
}

function milestoneVisible(m) {
  const c = $('#circuit').value, f = $('#format').value, d = $('#district').value;
  if (f || d) return false;
  if (!c) return true;
  return c === 'type:' + m.circuit || c === 'round:' + m.ronda;
}

function renderEvents() {
  const q = normalize($('#search').value.trim());
  const filtered = events.filter(e => matches(e, q));
  const tournaments = filtered.filter(e => !isInfo(e)).length;
  const infoDates = filtered.length - tournaments;
  // Só torneios contam como «torneios»; se apenas houver datas informativas, diz-se isso.
  $('#count').textContent = tournaments || !infoDates
    ? `${tournaments} ${tournaments === 1 ? 'torneio' : 'torneios'}`
    : `${infoDates} ${infoDates === 1 ? 'data informativa' : 'datas informativas'}`;
  if (!filtered.length) {
    $('#month-links').innerHTML = '';
    eventsEl.innerHTML = `<div class="empty">Nenhum torneio encontrado.</div>`;
    return;
  }
  // Agrupar por mês → sequência cronológica de dias, datas informativas e marcos de round.
  const groups = new Map();
  const groupFor = date => {
    const key = date.slice(0, 7);
    if (!groups.has(key)) groups.set(key, { date: asDate(key + '-01'), days: new Map(), items: [], total: 0 });
    return groups.get(key);
  };
  for (const e of filtered) {
    const g = groupFor(e.dateStart);
    if (isInfo(e)) { g.items.push({ date: e.dateStart, order: 0, html: infoHtml(e) }); continue; }
    if (!g.days.has(e.dateStart)) g.days.set(e.dateStart, []);
    g.days.get(e.dateStart).push(e);
    g.total++;
  }
  for (const m of milestones) {
    if (!milestoneVisible(m)) continue;
    for (const kind of ['start', 'end']) {
      const date = kind === 'start' ? m.start : m.end;
      const g = groups.get(date.slice(0, 7));
      if (!g || (!showPast && date < today)) continue;
      g.items.push({ date, order: kind === 'start' ? -1 : 2, html: milestoneHtml(m, kind) });
    }
  }
  const sortedKeys = [...groups.keys()].sort();
  $('#month-links').innerHTML = sortedKeys.map(key => { const g = groups.get(key); return `<a href="#m-${key}">${months[g.date.getMonth()]} ${g.date.getFullYear()}</a>`; }).join('');

  eventsEl.innerHTML = sortedKeys.map(key => {
    const g = groups.get(key);
    for (const [date, items] of g.days) {
      const dt = asDate(date);
      g.items.push({ date, order: 1, html: `<div class="day-group"><div class="day-label"><span class="number">${dt.getDate()}</span><span class="weekday">${shortWeek[dt.getDay()]}</span></div><div class="event-list">${items.map(rowHtml).join('')}</div></div>` });
    }
    g.items.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
    const total = g.total ? `${g.total} ${g.total === 1 ? 'torneio' : 'torneios'}` : '';
    return `<section class="month-block" id="m-${key}" aria-label="${months[g.date.getMonth()]} ${g.date.getFullYear()}"><div class="month-title"><h3>${months[g.date.getMonth()]}</h3><span class="year">${g.date.getFullYear()}</span><span class="total">${total}</span></div><div class="days">${g.items.map(i => i.html).join('')}</div></section>`;
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

  const tabs = [
    e.formato ? `${e.formato}${e.set ? ' · ' + e.set : ''}` : null,
    e.tipo + (e.fase ? ' · ' + e.fase : ''),
    e.ronda, e.vagas ? `${e.vagas} vagas` : null,
    e.scope === 'internacional' ? 'Internacional' : null,
  ].filter(Boolean);

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
    + `<div class="dialog-tabs">${tabs.map(t => `<span class="dialog-tab">${esc(t)}</span>`).join('')}</div>`
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
