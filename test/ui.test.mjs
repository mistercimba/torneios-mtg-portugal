// Testes de regressão da interface num Chrome real (headless), com dados inventados.
// Correm localmente e no GitHub Actions; são ignorados se não houver Chrome instalado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { findChrome, launchBrowser, startServer } from './ui/harness.mjs';

const chrome = findChrome();
const skip = chrome ? false : 'Chrome não encontrado (define CHROME_PATH para correr os testes de interface)';
let browser, server;

before(async () => { if (skip) return; server = await startServer(); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });

async function open({ width = 1280, height = 900, mobile = width <= 760, theme = 'light', hash = '' } = {}) {
  const page = await browser.newPage({ width, height, mobile, theme });
  await page.goto(server.url + hash);
  await page.waitFor("document.querySelector('.event-row') && document.querySelector('.result')");
  return page;
}

const MOBILE_WIDTHS = [320, 340, 360, 375, 390, 393, 412, 414, 430];

// Corre com a fonte normal e com uma fonte larga (DejaVu Sans, a que o GitHub Actions usa por omissão),
// porque a largura do logótipo depende das fontes de cada aparelho.

// Total de torneios a partir do texto do contador («N torneios» ou «N em Portugal · M internacionais»).
const countTotal = t => { const m = t.match(/^(\d+) em Portugal · (\d+) internaciona(?:l|is)$/); if (m) return +m[1] + +m[2]; const n = t.match(/^(\d+) torneios?$/); return n ? +n[1] : NaN; };
const COUNT_RE = /^(\d+ torneios?|\d+ em Portugal · \d+ internaciona(l|is))$/;

// ---------- Listas com escolha múltipla (Formato, Onde, Circuito) ----------
const msRoot = key => `document.querySelector('.ms[data-key=${JSON.stringify(key)}]')`;
const optLabel = 'o => o.querySelector(".ms-text").lastChild.textContent.trim()';
/** Marca/desmarca uma opção (abre a lista, clica, fecha com «Feito») e devolve o contador. */
const pick = (page, key, label) => page.eval(`(() => {
  const root = ${msRoot(key)};
  if (root.querySelector('.ms-panel').hidden) root.querySelector('.ms-btn').click();
  const opts = [...root.querySelectorAll('.ms-opt')];
  const opt = opts.find(o => (${optLabel})(o) === ${JSON.stringify(label)});
  if (!opt) throw new Error('opção ' + ${JSON.stringify(label)} + ' não existe: ' + opts.map(${optLabel}).join(' | '));
  opt.querySelector('input').click();
  root.querySelector('.ms-done').click();
  return document.getElementById('count').textContent;
})()`);
/** Opções de uma lista: nome, se é grupo/subopção, número e estado (on/off/some). */
const msOptions = (page, key) => page.eval(`[...${msRoot(key)}.querySelectorAll('.ms-opt')].map(o => { const i = o.querySelector('input');
  return { label: (${optLabel})(o), parent: o.classList.contains('parent'), child: o.classList.contains('child'), count: +o.querySelector('.ms-count').textContent,
    state: i.indeterminate ? 'some' : i.checked ? 'on' : 'off' }; })`);
const msLabel = (page, key) => page.eval(`${msRoot(key)}.querySelector('.ms-label').textContent`);
const resetFilters = page => page.eval(`document.getElementById('reset').click()`);

test('1. cabeçalho: logótipo nunca se sobrepõe à navegação (320–430 px e desktop)', { skip }, async () => {
  for (const [theme, font] of [['light', null], ['dark', null], ['light', 'DejaVu Sans'], ['dark', 'Arial']]) {
    const page = await open({ width: 320, theme });
    if (font) await page.eval(`(() => { const st = document.createElement('style'); st.textContent = 'body, .brand { font-family: "${font}", sans-serif !important; }'; document.head.appendChild(st); })()`);
    await page.resize(1000); // força novo ajuste depois de trocar a fonte
    for (const w of [...MOBILE_WIDTHS, 500, 760, 1040, 1280]) {
      await page.resize(w);
      const m = await page.eval(`(() => {
        const b = document.querySelector('.brand').getBoundingClientRect();
        const n = document.querySelector('.nav').getBoundingClientRect();
        const t = document.querySelector('#theme-toggle').getBoundingClientRect();
        return { gap: n.left - b.right, font: parseFloat(getComputedStyle(document.querySelector('.brand')).fontSize),
          right: t.right, vw: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth };
      })()`);
      const label = `${w}px (${theme}${font ? ', ' + font : ''})`;
      assert.ok(m.gap >= 8, `${label}: espaço entre logótipo e navegação = ${m.gap.toFixed(1)} px`);
      assert.ok(m.font >= (w < 360 ? 9 : 10), `${label}: logótipo demasiado pequeno (${m.font}px)`);
      // A partir de 430 px o logótipo fica perto dos 17px, ou encolhe só o necessário para caber (fontes largas).
      if (w >= 430) assert.ok(m.font >= 16.5 || m.gap <= 24, `${label}: logótipo encolheu mais do que o necessário (${m.font}px, folga ${m.gap.toFixed(1)}px)`);
      if (w > 760) assert.equal(m.font, 17, `${label}: no computador o logótipo mantém 17px`);
      assert.ok(m.right <= m.vw, `${w}px: botão de tema sai do ecrã`);
      assert.ok(m.overflow <= 0, `${w}px: scroll horizontal de ${m.overflow}px`);
    }
    assert.deepEqual(page.errors, []);
    await page.close();
  }
});

test('2. vencedores em telemóvel: data, vencedor, jogadores, loja, localidade e deck visíveis, sem scroll horizontal', { skip }, async () => {
  for (const w of [320, 390, 430]) {
    const page = await open({ width: w, hash: '#winners' });
    const r = await page.eval(`(() => {
      const row = [...document.querySelectorAll('.result')].find(x => x.textContent.includes('Miguel Valente'));
      const visible = el => !!el && el.offsetParent !== null && el.getBoundingClientRect().width > 0;
      const shown = sel => [...row.querySelectorAll(sel)].filter(visible).map(e => e.textContent.trim()).join(' | ');
      return { text: [...row.querySelectorAll('*')].filter(visible).map(e => e.innerText).join(' '),
        rows: new Set([...row.children].filter(visible).map(e => Math.round(e.getBoundingClientRect().top))).size,
        overflow: document.documentElement.scrollWidth - innerWidth,
        rowOverflow: row.scrollWidth - row.clientWidth };
    })()`);
    for (const s of ['15 AGO', 'Miguel Valente', '16', 'jogadores', 'Ventura Games', 'Barreiro', 'Dimir Midrange']) {
      assert.ok(r.text.includes(s), `${w}px: falta «${s}» em: ${r.text}`);
    }
    assert.ok(r.overflow <= 0 && r.rowOverflow <= 0, `${w}px: scroll horizontal`);
    const missingDeck = await page.eval(`[...document.querySelectorAll('.result')].find(x => x.textContent.includes('Sérgio Preto')).innerText`);
    assert.ok(missingDeck.includes('Deck não indicado'), `deck em falta deve ser indicado: ${missingDeck}`);
    await page.close();
  }
});

test('3. vencedores: tamanhos de letra legíveis em desktop e mobile', { skip }, async () => {
  for (const w of [1280, 390]) {
    const page = await open({ width: w, hash: '#winners' });
    const sizes = await page.eval(`(() => { const r = document.querySelector('.result'); const fs = s => { const e = [...r.querySelectorAll(s)].find(x => x.offsetParent); return e ? parseFloat(getComputedStyle(e).fontSize) : null; };
      return { name: fs('.win'), date: fs('.date'), meta: fs('.location, .result-meta') }; })()`);
    assert.ok(sizes.name >= 15, `${w}px: nome do vencedor com ${sizes.name}px`);
    assert.ok(sizes.date >= 13, `${w}px: data com ${sizes.date}px`);
    assert.ok(sizes.meta >= 13, `${w}px: loja/localidade com ${sizes.meta}px`);
    await page.close();
  }
});

test('4. cabeçalho: a navegação não muda de posição entre Agenda e Vencedores', { skip }, async () => {
  for (const w of [1280, 900, 390, 320]) {
    const page = await open({ width: w });
    const pos = () => page.eval(`(() => { const n = document.querySelector('.nav').getBoundingClientRect(); const b = document.querySelector('.brand').getBoundingClientRect(); return [Math.round(n.left), Math.round(n.top), Math.round(b.left), Math.round(b.top)]; })()`);
    const agenda = await pos();
    await page.eval(`document.querySelector('[data-view="winners"]').click()`);
    await page.waitFor(`document.getElementById('winners').classList.contains('active')`);
    assert.deepEqual(await pos(), agenda, `${w}px: logótipo/navegação mudaram de posição`);
    await page.close();
  }
});

test('5. navegação: #winners responde a mudanças de endereço e ao botão Voltar', { skip }, async () => {
  const page = await open({ width: 1280 });
  const view = () => page.eval(`document.querySelector('.view.active').id`);
  assert.equal(await view(), 'agenda');
  await page.eval(`location.hash = '#winners'`);
  await page.waitFor(`document.getElementById('winners').classList.contains('active')`);
  await page.eval(`history.back()`);
  await page.waitFor(`document.getElementById('agenda').classList.contains('active')`);
  await page.eval(`history.forward()`);
  await page.waitFor(`document.getElementById('winners').classList.contains('active')`);
  await page.eval(`document.querySelector('[data-view="agenda"]').click()`);
  await page.waitFor(`document.getElementById('agenda').classList.contains('active')`);
  assert.equal(await page.eval('location.hash'), '#agenda');
  await page.eval(`history.back()`);
  await page.waitFor(`document.getElementById('winners').classList.contains('active')`);
  // «Ir para mês…» fica na Agenda e leva ao mês escolhido.
  await page.eval(`document.querySelector('[data-view="agenda"]').click()`);
  await page.waitFor(`document.getElementById('agenda').classList.contains('active')`);
  const target = await page.eval(`(() => { const s = document.getElementById('month-jump'); const v = s.options[s.options.length - 1].value; s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); return v; })()`);
  await page.waitFor(`Math.abs(document.getElementById('m-${target}').getBoundingClientRect().top) < 200 || scrollY + innerHeight >= document.documentElement.scrollHeight - 2`, 5000).catch(() => {});
  assert.equal(await view(), 'agenda');
  assert.ok(await page.eval(`Math.abs(document.getElementById('m-${target}').getBoundingClientRect().top) < 200 || scrollY + innerHeight >= document.documentElement.scrollHeight - 2`), 'o mês escolhido fica no topo (ou a página chega ao fim)');
  assert.ok(await page.eval('scrollY > 0'), 'a página desceu até ao mês');
  assert.equal(await page.eval(`document.getElementById('month-jump').value`), '', 'a lista volta a «Ir para mês…»');
  // Carregar directamente com #winners.
  const p2 = await open({ width: 390, hash: '#winners' });
  assert.equal(await p2.eval(`document.querySelector('.view.active').id`), 'winners');
  assert.deepEqual([...page.errors, ...p2.errors], []);
  await page.close(); await p2.close();
});

test('6. contador: nunca «0 torneios» quando há datas informativas visíveis', { skip }, async () => {
  const page = await open({ width: 1280 });
  const state = () => page.eval(`[document.getElementById('count').textContent, document.querySelectorAll('.info-row').length, document.querySelectorAll('.event-row').length]`);
  await pick(page, 'circuit', 'Anúncio');
  const [txt, info, rows] = await state();
  assert.equal(rows, 0); assert.equal(info, 1);
  assert.equal(txt, '1 data informativa');
  await pick(page, 'circuit', 'Anúncio');
  const [txtAll] = await state();
  assert.match(txtAll, COUNT_RE);
  await page.eval(`(() => { const s = document.getElementById('search'); s.value = 'zzzz'; s.dispatchEvent(new Event('input')); })()`);
  assert.equal(await page.eval(`document.getElementById('count').textContent`), '0 torneios');
  await page.close();
});

test('7. evento que acaba às 00:00 aparece num só dia; eventos de vários dias mantêm o intervalo', { skip }, async () => {
  const page = await open({ width: 1280 });
  const row = t => page.eval(`[...document.querySelectorAll('.event-row')].find(r => r.textContent.includes(${JSON.stringify(t)}))?.innerText`);
  const night = await row('Loja Exemplo Centro');
  // LCQ nocturno: 4 Dez 20:00 → 5 Dez 00:00
  const nightRow = await page.eval(`[...document.querySelectorAll('.event-row')].find(r => r.getAttribute('aria-label').includes('4 Dezembro'))?.innerText`);
  assert.ok(nightRow, `linha do evento nocturno: ${night}`);
  assert.ok(!/4–5|5 Dezembro/.test(nightRow), 'não deve aparecer como 2 dias');
  await page.eval(`[...document.querySelectorAll('.event-row')].find(r => r.getAttribute('aria-label').includes('4 Dezembro')).click()`);
  const modal = await page.eval(`document.getElementById('dialog-body').innerText`);
  assert.ok(modal.includes('20:00') && !/5 DEZEMBRO|5 Dezembro/.test(modal), `modal: ${modal}`); // só a hora de início, num só dia
  assert.ok(!modal.includes('Datas'), 'modal não deve mostrar intervalo de datas');
  await page.eval(`document.getElementById('detail-dialog').close()`);
  const twoDay = await page.eval(`[...document.querySelectorAll('.event-row')].find(r => r.getAttribute('aria-label').includes('19 Dezembro') && r.textContent.includes('Loja Exemplo Norte'))?.innerText`);
  assert.ok(twoDay && twoDay.includes('19–20 Dez · 2 dias'), `evento de dois dias: ${twoDay}`);
  await page.close();
});

// Contraste mínimo de 4,5:1 (WCAG AA) para texto e etiquetas, nos dois temas, incluindo o modal.
test('modo claro e escuro: sem erros e etiquetas legíveis em desktop e mobile', { skip }, async () => {
  for (const theme of ['light', 'dark']) for (const w of [1280, 390]) {
    const page = await open({ width: w, theme });
    assert.equal(await page.eval(`document.documentElement.dataset.theme`), theme);
    const check = () => page.eval(`(() => {
      const lum = c => { const [r,g,b] = c.match(/\\d+(\\.\\d+)?/g).slice(0,3).map(Number).map(v => { v/=255; return v <= .03928 ? v/12.92 : ((v+.055)/1.055)**2.4; }); return .2126*r+.7152*g+.0722*b; };
      const bgOf = el => { while (el) { const c = getComputedStyle(el).backgroundColor; if (c && !c.endsWith(', 0)') && c !== 'transparent') return c; el = el.parentElement; } return getComputedStyle(document.body).backgroundColor; };
      const bad = [];
      for (const el of document.querySelectorAll('.store, .win, .type-pill, .range-pill, .format-col, .event-time, .meta-m, .meta-m b, .price-col, .month-title h3, .month-title .year, .month-title .total, .col-head span, .day-num, .day-wd, .day-mon, .day-count, .count, .result-meta, .milestone-name, .info-kind, .info-name, .info-when, .cont-kind, .cont-name, .cont-when, .legend-item, .subline, .price-col small, .filter label, .dialog-meta, .dialog-location, .dialog-tab, .detail-label, .detail-value, .detail-section li, .dialog-note, .unavailable')) {
        if (!el.offsetParent) continue;
        const a = lum(getComputedStyle(el).color), b = lum(bgOf(el));
        const ratio = (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        if (ratio < 4.5) bad.push(el.className + ' ' + ratio.toFixed(2));
      }
      return bad.slice(0, 5);
    })()`);
    // Agenda com passados visíveis (todas as cores por tipo, «A decorrer», marcos e datas informativas).
    await page.eval(`document.getElementById('past').click()`);
    assert.deepEqual(await check(), [], `${theme} ${w}px: contraste baixo na agenda`);
    assert.ok(await page.eval(`!!document.querySelector('.cont-row') && !!document.querySelector('.info-row') && document.querySelectorAll('.type-pill').length > 10`), 'a fixture deve incluir linhas «A decorrer», datas informativas e etiquetas de tipo');
    // Modal de um evento em revisão (aviso, etiquetas, detalhes).
    await page.eval(`[...document.querySelectorAll('.event-row')].find(r => r.textContent.includes('Qualificador') && r.textContent.includes('Loja Exemplo Sul')).click()`);
    assert.deepEqual(await check(), [], `${theme} ${w}px: contraste baixo no modal`);
    await page.eval(`document.getElementById('detail-dialog').close()`);
    // Vencedores.
    await page.eval(`document.querySelector('[data-view="winners"]').click()`);
    assert.deepEqual(await check(), [], `${theme} ${w}px: contraste baixo nos vencedores`);
    assert.deepEqual(page.errors, []);
    await page.close();
  }
});

// ---------- Agenda em cartões por dia (Proposta B, aprovada a 23/11/2026) ----------
const showAll = page => page.eval(`document.getElementById('past').getAttribute('aria-pressed') === 'true' || document.getElementById('past').click()`);

test('8. cartões por dia: número grande, cabeçalho no cartão, separadores discretos e sem sombras', { skip }, async () => {
  for (const [w, theme, minNum] of [[1280, 'light', 32], [1280, 'dark', 32], [390, 'light', 26], [320, 'dark', 26]]) {
    const page = await open({ width: w, theme });
    const r = await page.eval(`(() => {
      const cards = [...document.querySelectorAll('.day-card')];
      return cards.map(c => {
        const cs = getComputedStyle(c), num = c.querySelector('.day-head .day-num');
        const rows = [...c.querySelectorAll('.event-row, .info-row, .cont-row')];
        return { shadow: cs.boxShadow, border: cs.borderTopWidth, radius: parseFloat(cs.borderTopLeftRadius),
          num: num ? parseFloat(getComputedStyle(num).fontSize) : 0, label: c.getAttribute('aria-label'),
          sep: rows.every(x => getComputedStyle(x).borderTopWidth === '1px'), headFirst: c.firstElementChild.classList.contains('day-head') };
      });
    })()`);
    assert.ok(r.length >= 10, `${w}px: esperava vários cartões, há ${r.length}`);
    for (const c of r) {
      const where = `${w}px ${theme} «${c.label}»`;
      assert.equal(c.shadow, 'none', `${where}: o cartão não deve ter sombra`);
      assert.equal(c.border, '1px', `${where}: borda discreta de 1px`);
      assert.ok(c.headFirst, `${where}: o cabeçalho do dia é o primeiro elemento do cartão`);
      assert.ok(c.num >= minNum, `${where}: número do dia com ${c.num}px`);
      assert.ok(c.sep, `${where}: linhas separadas por um traço de 1px`);
      assert.match(c.label, /^(?:(?:Hoje|Amanhã|Este fim de semana), )?(Domingo|Segunda-feira|Terça-feira|Quarta-feira|Quinta-feira|Sexta-feira|Sábado), \d+ de \S+ de \d{4}$/);
    }
    assert.deepEqual(page.errors, []);
    await page.close();
  }
});

test('9. cada evento aparece uma só vez e as contagens não mudam com as linhas «A decorrer»', { skip }, async () => {
  const page = await open({ width: 1280 });
  await showAll(page);
  const r = await page.eval(`(() => {
    const ids = [...document.querySelectorAll('.event-row')].map(e => e.dataset.id);
    const infoIds = [...document.querySelectorAll('.info-row')].map(e => e.dataset.id);
    const months = [...document.querySelectorAll('.month-block')].map(m => ({ total: m.querySelector('.total').textContent, rows: m.querySelectorAll('.event-row').length }));
    const days = [...document.querySelectorAll('.day-card')].map(c => ({ count: c.querySelector('.day-count')?.textContent || '', rows: c.querySelectorAll('.event-row').length, info: c.querySelectorAll('.info-row').length }));
    return { count: document.getElementById('count').textContent, ids, infoIds, months, days, cont: document.querySelectorAll('.cont-row').length };
  })()`);
  assert.equal(new Set(r.ids).size, r.ids.length, 'há torneios repetidos');
  assert.equal(new Set(r.infoIds).size, r.infoIds.length, 'há datas informativas repetidas');
  assert.ok(r.ids.every(id => !r.infoIds.includes(id)));
  assert.equal(countTotal(r.count), r.ids.length, r.count);
  assert.ok(r.cont >= 2, `esperava linhas «A decorrer» na fixture (há ${r.cont})`);
  for (const m of r.months) assert.equal(m.total, m.rows ? `${m.rows} ${m.rows === 1 ? 'torneio' : 'torneios'}` : '');
  for (const d of r.days) {
    const expected = d.rows ? `${d.rows} ${d.rows === 1 ? 'torneio' : 'torneios'}` : d.info ? `${d.info} ${d.info === 1 ? 'data informativa' : 'datas informativas'}` : '';
    assert.equal(d.count, expected);
  }
  await page.close();
});

test('10. eventos de vários dias: intervalo no primeiro dia e «A decorrer · Dia N de M» nos seguintes', { skip }, async () => {
  for (const w of [1280, 375]) {
    const page = await open({ width: w });
    const card = label => page.eval(`[...document.querySelectorAll('.day-card')].find(c => c.getAttribute('aria-label') === ${JSON.stringify(label)})?.innerText || ''`);
    // Datas informativas de vários dias (janela de prerelease 15–17 Jan) continuam no dia 16.
    const d16 = await card('Sábado, 16 de Janeiro de 2027');
    assert.match(d16, /A DECORRER\s*Prerelease Edição Exemplo\s*Dia 2 de 3\s*·\s*15–17 Jan/i, `16 Jan: ${d16}`);
    // Regional Championship 5–7 Mar: intervalo no dia 5, continuação no dia 7 (cartão do fim da Round 3).
    const d5 = await card('Sexta-feira, 5 de Março de 2027');
    assert.ok(d5.includes('5–7 Mar · 3 dias') && d5.includes('Regional Championship Exemplo'), `5 Mar: ${d5}`);
    const d7 = await card('Domingo, 7 de Março de 2027');
    assert.match(d7, /Regional Championship Exemplo\s*Dia 3 de 3/, `7 Mar: ${d7}`);
    assert.ok(!/\d+ torneio/.test(d7), `7 Mar não conta o RC como torneio desse dia: ${d7}`);
    // A linha «A decorrer» abre o mesmo evento e não tem preço.
    const r = await page.eval(`(() => {
      const c = [...document.querySelectorAll('.cont-row')].find(x => x.textContent.includes('Regional Championship Exemplo'));
      const first = [...document.querySelectorAll('.event-row')].find(x => x.textContent.includes('Regional Championship Exemplo'));
      return { same: c.dataset.id === first.dataset.id, tag: c.tagName, price: !!c.querySelector('.price-col'), aria: c.getAttribute('aria-label') };
    })()`);
    assert.ok(r.same && r.tag === 'BUTTON' && !r.price, JSON.stringify(r));
    assert.match(r.aria, /^A decorrer: Regional Championship Exemplo, dia 3 de 3/);
    await page.eval(`(() => { const c = [...document.querySelectorAll('.cont-row')].find(x => x.textContent.includes('Regional Championship Exemplo')); c.focus(); c.click(); })()`);
    assert.ok((await page.eval(`document.getElementById('dialog-body').innerText`)).includes('Regional Championship Exemplo'));
    assert.ok(await page.eval(`document.getElementById('detail-dialog').open`));
    await page.eval(`document.getElementById('close-dialog').click()`);
    assert.ok(await page.eval(`document.activeElement.classList.contains('cont-row')`), 'o foco volta à linha que abriu o modal');
    // Filtros aplicam-se também às continuações.
    await pick(page, 'circuit', 'Spotlight');
    assert.ok(!(await page.eval(`document.getElementById('events').innerText`)).includes('Regional Championship Exemplo'));
    assert.deepEqual(page.errors, []);
    await page.close();
  }
});

test('11. desktop: três colunas alinhadas (tipo, evento, formato), sem horário nem inscrição', { skip }, async () => {
  for (const w of [1280, 1100, 900]) {
    const page = await open({ width: w });
    await showAll(page);
    const r = await page.eval(`[...document.querySelectorAll('.event-row')].map(row => {
      const R = s => row.querySelector(s).getBoundingClientRect();
      const pill = R('.type-pill'), name = R('.store'), fmt = R('.format-col');
      return { gap: name.left - pill.right, pillLeft: Math.round(pill.left), nameLeft: Math.round(name.left), fmtLeft: Math.round(fmt.left), extra: !!row.querySelector('.price-col, .event-time'), name: row.querySelector('.store').textContent };
    })`);
    for (const x of r) assert.ok(x.gap >= 10, `${w}px «${x.name}»: ${x.gap.toFixed(1)}px entre o tipo e o nome`);
    assert.equal(new Set(r.map(x => x.pillLeft)).size, 1, `${w}px: etiquetas de tipo desalinhadas à esquerda`);
    assert.equal(new Set(r.map(x => x.nameLeft)).size, 1, `${w}px: coluna do evento desalinhada`);
    assert.equal(new Set(r.map(x => x.fmtLeft)).size, 1, `${w}px: coluna do formato desalinhada`);
    assert.ok(r.every(x => !x.extra), `${w}px: sem colunas de horário/inscrição`);
    assert.deepEqual(await page.eval(`[...document.querySelectorAll('.col-head')].length && [...document.querySelector('.col-head').children].map(c => c.textContent)`), ['Tipo', 'Evento', 'Formato']);
    assert.ok(await page.eval(`getComputedStyle(document.querySelector('.col-head')).display !== 'none'`));
    assert.ok((await page.eval('document.documentElement.scrollWidth - innerWidth')) <= 0, `${w}px: scroll horizontal`);
    await page.close();
  }
});

test('12. telemóvel 320–430 px: tipo na primeira linha, nome e detalhes por baixo, sem sobreposições', { skip }, async () => {
  for (const theme of ['light', 'dark']) {
    const page = await open({ width: 320, theme });
    await showAll(page);
    for (const w of MOBILE_WIDTHS) {
      await page.resize(w);
      const r = await page.eval(`(() => {
        const box = el => el.getBoundingClientRect();
        const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
        const bad = [];
        for (const row of document.querySelectorAll('.event-row')) {
          const t = box(row.querySelector('.event-type')), n = box(row.querySelector('.store')), m = box(row.querySelector('.meta-m')), rb = box(row);
          const name = row.querySelector('.store').textContent;
          if (n.top < t.bottom - 0.5) bad.push(name + ': nome sobe para a linha do tipo');
          if (m.top < n.bottom - 0.5 || m.height === 0) bad.push(name + ': detalhes em falta ou sobrepostos');
          if (t.right > rb.right + 0.5 || n.right > rb.right + 0.5 || m.right > rb.right + 0.5) bad.push(name + ': sai do cartão');
        }
        for (const el of document.querySelectorAll('.day-head')) { const n = box(el.querySelector('.day-num')), w = box(el.querySelector('.day-names')), c = el.querySelector('.day-count'); if (hit(n, w) || (c && hit(w, box(c)))) bad.push('cabeçalho do dia sobreposto'); }
        return { bad: bad.slice(0, 5), overflow: document.documentElement.scrollWidth - innerWidth,
          hidden: ['.col-head', '.format-col'].every(s => getComputedStyle(document.querySelector(s)).display === 'none') };
      })()`);
      assert.deepEqual(r.bad, [], `${w}px ${theme}`);
      assert.ok(r.overflow <= 0, `${w}px ${theme}: scroll horizontal de ${r.overflow}px`);
      assert.ok(r.hidden, `${w}px: colunas de desktop devem estar escondidas`);
    }
    assert.deepEqual(page.errors, []);
    await page.close();
  }
});

test('13. cor por tipo: consistente, distinta (LPP, Spotlight e Paupergeddon incluídos) e tipos novos com estilo genérico', { skip }, async () => {
  const colours = {};
  for (const theme of ['light', 'dark']) {
    const page = await open({ width: 1280, theme });
    await showAll(page);
    colours[theme] = await page.eval(`(() => {
      const out = {};
      for (const row of document.querySelectorAll('.event-row')) {
        const cls = [...row.classList].find(c => c.startsWith('t-'));
        const bg = getComputedStyle(row.querySelector('.type-pill')).backgroundColor;
        (out[cls] ||= new Set()).add(bg);
      }
      const legend = Object.fromEntries([...document.querySelectorAll('.legend-item')].map(l => [[...l.classList].find(c => c.startsWith('t-')), getComputedStyle(l, '::before').backgroundColor]));
      const accents = Object.fromEntries([...document.querySelectorAll('.event-row')].map(r => [[...r.classList].find(c => c.startsWith('t-')), getComputedStyle(r).getPropertyValue('--t-ac').trim()]));
      return { pills: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]])), legend, accents,
        unknown: [...document.querySelectorAll('.event-row')].find(r => r.textContent.includes('Liga de Verão'))?.className };
    })()`);
    await page.close();
  }
  for (const theme of ['light', 'dark']) {
    const { pills, legend, accents, unknown } = colours[theme];
    for (const [k, v] of Object.entries(pills)) assert.equal(v.length, 1, `${theme}: ${k} com cores diferentes em linhas diferentes`);
    const values = Object.values(pills).map(v => v[0]);
    assert.equal(new Set(values).size, values.length, `${theme}: dois tipos com a mesma cor: ${JSON.stringify(pills)}`);
    for (const k of ['t-lpp', 't-spotlight', 't-paupergeddon', 't-rcq', 't-rc', 't-pt', 't-worlds', 't-lll', 't-cedh', 't-prerelease', 't-qualificador', 't-especial', 't-outro']) assert.ok(pills[k], `${theme}: falta ${k} na fixture`);
    assert.match(unknown, /\bt-outro\b/, 'tipo desconhecido usa o estilo genérico');
    for (const [k, c] of Object.entries(legend)) if (accents[k]) assert.ok(c, `${theme}: legenda sem cor para ${k}`);
  }
  // As cores mudam entre temas (versões próprias para fundo escuro).
  assert.notEqual(colours.light.pills['t-rcq'][0], colours.dark.pills['t-rcq'][0]);
});

test('14. pesquisa, filtros, passados, modal e mudanças de largura sem erros na consola', { skip }, async () => {
  const page = await open({ width: 1280, theme: 'dark' });
  const set = (id, v) => page.eval(`(() => { const s = document.getElementById(${JSON.stringify(id)}); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('input')); return document.getElementById('count').textContent; })()`);
  assert.equal(await set('search', 'paupergeddon'), '1 torneio');
  assert.equal(await page.eval(`document.querySelectorAll('.day-card').length`), 1);
  await set('search', '');
  assert.match(await pick(page, 'place', 'Internacional'), COUNT_RE);
  assert.equal(await page.eval(`document.querySelectorAll('.info-row').length`), 0, 'datas informativas escondidas com filtro de local');
  assert.ok(await page.eval(`[...document.querySelectorAll('.event-row')].every(r => r.classList.contains('intl'))`));
  await page.eval(`document.getElementById('reset').click()`);
  for (const sel of ['.event-row', '.info-row']) {
    await page.eval(`document.querySelector(${JSON.stringify(sel)}).click()`);
    assert.ok(await page.eval(`document.getElementById('detail-dialog').open && !!document.querySelector('.dialog-type')`), `${sel}: modal com etiqueta do tipo`);
    await page.eval(`document.getElementById('detail-dialog').close()`);
  }
  await page.eval(`document.getElementById('past').click()`);
  await page.eval(`document.getElementById('past').click()`);
  for (const w of [1280, 1040, 900, 761, 760, 430, 320, 1280]) {
    await page.resize(w);
    assert.ok((await page.eval('document.documentElement.scrollWidth - innerWidth')) <= 0, `${w}px: scroll horizontal`);
  }
  assert.ok(await page.eval(`[...document.querySelectorAll('.event-row, .info-row, .cont-row')].every(b => b.tagName === 'BUTTON' && b.getAttribute('aria-label'))`), 'todas as linhas são botões com descrição');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('15. filtros: escolha múltipla, distritos dentro de Portugal, rounds dentro de RCQ, formatos por ordem lógica', { skip }, async () => {
  for (const w of [1280, 390, 320]) {
    const page = await open({ width: w });
    await showAll(page);
    const rows = () => page.eval(`[...document.querySelectorAll('.event-row')].map(r => ({ fmt: r.querySelector('.format-col')?.textContent || '', pill: r.querySelector('.type-pill').textContent, intl: r.classList.contains('intl'), text: r.textContent }))`);
    // Sempre 3 listas, na mesma fila, com o nome dentro do botão.
    const layout = await page.eval(`(() => { const b = [...document.querySelectorAll('.ms-btn')].map(x => x.getBoundingClientRect()); return { n: b.length, tops: [...new Set(b.map(x => Math.round(x.top)))].length, names: [...document.querySelectorAll('.ms-label')].map(l => l.textContent) }; })()`);
    assert.deepEqual(layout, { n: 3, tops: 1, names: ['Formato', 'Onde', 'Circuito'] }, `${w}px`);
    // Formatos por ordem lógica (construído → Commander → Limited), sem subopções.
    const formats = await msOptions(page, 'format');
    const names = formats.map(f => f.label), idx = f => names.indexOf(f);
    assert.ok(formats.every(f => !f.parent && !f.child));
    assert.ok(!names.includes('cEDH'), `cEDH junta-se a Commander: ${names}`);
    for (const [a, b] of [['Standard', 'Modern'], ['Modern', 'Legacy'], ['Legacy', 'Pauper'], ['Pauper', 'Commander']]) assert.ok(idx(a) < idx(b), `${a} antes de ${b}: ${names}`);
    assert.equal(names.at(-1), 'Limited');
    assert.ok(!names.some(f => /sealed|draft|\+/i.test(f)), `limitados agrupados e sem combinações: ${names}`);
    // Limited junta Sealed, Draft, etc.; escolha múltipla soma os formatos; o número ao lado bate certo.
    const limited = formats.find(f => f.label === 'Limited').count;
    assert.equal(countTotal(await pick(page, 'format', 'Limited')), limited);
    assert.ok((await rows()).length && (await rows()).every(r => /sealed|draft|limited/i.test(r.fmt)), 'Limited mostra só torneios limitados');
    const std = (await msOptions(page, 'format')).find(f => f.label === 'Standard').count;
    assert.equal(countTotal(await pick(page, 'format', 'Standard')), limited + std, 'Limited + Standard');
    assert.equal(await msLabel(page, 'format'), 'Standard +1');
    await resetFilters(page);
    assert.equal(await msLabel(page, 'format'), 'Formato');
    // Onde: Portugal → distritos; Internacional → países. Um distrito deixa Portugal «parcial».
    let place = await msOptions(page, 'place');
    assert.equal(place[0].label, 'Portugal'); assert.ok(place[0].parent);
    const districts = place.slice(1, place.findIndex((o, i) => i > 0 && o.parent)).map(o => o.label);
    assert.ok(districts.length >= 2 && place.slice(1, 1 + districts.length).every(o => o.child), JSON.stringify(place));
    assert.ok(place.some(o => o.parent && o.label === 'Internacional'));
    const d = districts.find(x => place.find(o => o.label === x).count > 0);
    await pick(page, 'place', d);
    place = await msOptions(page, 'place');
    assert.equal(place[0].state, 'some'); assert.equal(place.find(o => o.label === d).state, 'on');
    assert.equal(await msLabel(page, 'place'), d);
    assert.ok((await rows()).every(r => !r.intl), 'só Portugal');
    assert.equal(await page.eval(`document.querySelectorAll('.info-row').length`), 0, 'sem datas informativas com filtro de local');
    await pick(page, 'place', 'Portugal'); // completa o grupo
    place = await msOptions(page, 'place');
    assert.ok(place.filter(o => o.child && districts.includes(o.label)).every(o => o.state === 'on') && place[0].state === 'on');
    assert.equal(await msLabel(page, 'place'), 'Portugal');
    await pick(page, 'place', 'Internacional');
    assert.equal(await msLabel(page, 'place'), 'Portugal +1');
    await pick(page, 'place', 'Portugal'); // desmarca o grupo inteiro
    assert.equal(await msLabel(page, 'place'), 'Internacional');
    assert.ok((await rows()).every(r => r.intl));
    await resetFilters(page);
    // Circuito: RCQ com os rounds por baixo.
    const circ = await msOptions(page, 'circuit');
    const rcq = circ.findIndex(o => o.label === 'RCQ');
    assert.ok(circ[rcq].parent && circ[rcq + 1].child && circ[rcq + 1].label.startsWith('Round'), JSON.stringify(circ));
    await pick(page, 'circuit', 'Round 3 · 2026/27');
    assert.ok((await rows()).length && (await rows()).every(r => r.pill.includes('R3')));
    assert.equal(await msLabel(page, 'circuit'), 'R3 2026/27');
    // Combinações: RCQ em Portugal num distrito; números das outras listas reflectem os filtros.
    await pick(page, 'place', d);
    const fmtSum = (await msOptions(page, 'format')).reduce((s, o) => s + o.count, 0);
    assert.equal(fmtSum, countTotal(await page.eval(`document.getElementById('count').textContent`)), 'números do Formato = torneios visíveis');
    await resetFilters(page);
    assert.match(await page.eval(`document.getElementById('count').textContent`), COUNT_RE);
    // Painéis dentro do ecrã, sem scroll horizontal.
    for (const key of ['format', 'place', 'circuit']) {
      const r = await page.eval(`(() => { const root = ${msRoot(key)}; root.querySelector('.ms-btn').click(); const b = root.querySelector('.ms-panel').getBoundingClientRect();
        const out = { left: b.left, right: b.right, vw: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth }; root.querySelector('.ms-done').click(); return out; })()`);
      assert.ok(r.left >= 0 && r.right <= r.vw && r.overflow <= 0, `${w}px ${key}: painel fora do ecrã ${JSON.stringify(r)}`);
    }
    assert.deepEqual(page.errors, []);
    await page.close();
  }
});

test('15b. listas: teclado (setas, espaço, Esc), fechar ao tocar fora e acessibilidade', { skip }, async () => {
  const page = await open({ width: 1280 });
  const key = (k, target = 'document.activeElement') => page.eval(`${target}.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true }))`);
  const btn = `${msRoot('format')}.querySelector('.ms-btn')`;
  // Abrir com o teclado (click sem rato) põe o foco na primeira opção.
  await page.eval(`${btn}.focus(); ${btn}.click()`);
  let st = await page.eval(`({ open: !${msRoot('format')}.querySelector('.ms-panel').hidden, expanded: ${btn}.getAttribute('aria-expanded'), focus: document.activeElement.id })`);
  assert.ok(st.open); assert.equal(st.expanded, 'true'); assert.match(st.focus, /^format-opt-/);
  await key('ArrowDown');
  const second = await page.eval(`document.activeElement.closest('.ms-opt').querySelector('.ms-text').textContent`);
  assert.equal(second, 'Pioneer');
  await page.eval(`document.activeElement.click()`); // espaço numa caixa de escolha = click
  assert.equal(await msLabel(page, 'format'), 'Pioneer');
  assert.match(await page.eval(`document.activeElement.id`), /Pioneer/, 'o foco fica na opção depois de marcar');
  await key('Escape');
  st = await page.eval(`({ open: !${msRoot('format')}.querySelector('.ms-panel').hidden, expanded: ${btn}.getAttribute('aria-expanded'), focusBtn: document.activeElement === ${btn}, label: ${btn}.getAttribute('aria-label') })`);
  assert.deepEqual(st, { open: false, expanded: 'false', focusBtn: true, label: 'Formato: Pioneer' });
  // Tocar fora fecha; abrir outra lista fecha a anterior.
  await page.eval(`${btn}.click()`);
  await page.eval(`${msRoot('place')}.querySelector('.ms-btn').click()`);
  assert.deepEqual(await page.eval(`[...document.querySelectorAll('.ms-panel')].map(p => !p.hidden)`), [false, true, false]);
  await page.eval(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
  assert.deepEqual(await page.eval(`[...document.querySelectorAll('.ms-panel')].map(p => !p.hidden)`), [false, false, false]);
  // Todas as opções têm caixa de escolha com nome; Esc com o painel fechado não faz nada de estranho.
  assert.ok(await page.eval(`[...document.querySelectorAll('.ms-opt')].every(l => l.control && l.control.type === 'checkbox' && l.textContent.trim())`));
  assert.deepEqual(page.errors, []);
  await page.close();
});

// ---------- Melhorias rápidas (23/11/2026) ----------
test('16. «Hoje», «Amanhã» e «Este fim de semana» nos cabeçalhos dos dias', { skip }, async () => {
  for (const [w, theme] of [[1280, 'light'], [320, 'dark']]) {
    const page = await open({ width: w, theme });
    const r = await page.eval(`[...document.querySelectorAll('.day-card')].map(c => ({ date: c.dataset.date, rel: c.querySelector('.day-rel')?.textContent || null, label: c.getAttribute('aria-label'), overlap: (() => { const a = c.querySelector('.day-names').getBoundingClientRect(), b = c.querySelector('.day-count')?.getBoundingClientRect(); return b ? a.right > b.left + 0.5 : false; })() }))`);
    const today = '2026-11-23'; // data fixa do harness (segunda-feira)
    const diff = d => Math.round((new Date(d + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000);
    let marked = 0;
    for (const c of r) {
      const n = diff(c.date), wd = new Date(c.date + 'T12:00:00').getDay();
      const expected = n === 0 ? 'Hoje' : n === 1 ? 'Amanhã' : n > 1 && n <= 6 && (wd === 6 || wd === 0) ? 'Este fim de semana' : null;
      assert.equal(c.rel, expected, `${c.date}: ${c.rel}`);
      if (expected) { assert.ok(c.label.startsWith(expected + ', '), c.label); marked++; }
      assert.ok(!c.overlap, `${w}px ${c.date}: etiqueta sobreposta à contagem`);
    }
    assert.ok(marked >= 1, 'a fixture deve ter pelo menos um dia marcado');
    assert.deepEqual(page.errors, []);
    await page.close();
  }
});

test('17. adicionar ao calendário: Google Calendar e ficheiro .ics com horas de Lisboa', { skip }, async () => {
  const page = await open({ width: 1280 });
  assert.equal(await page.eval(`lisbonToUtc('2026-11-28', '10:00').toISOString()`), '2026-11-28T10:00:00.000Z');
  assert.equal(await page.eval(`lisbonToUtc('2027-07-10', '10:00').toISOString()`), '2027-07-10T09:00:00.000Z');
  await page.eval(`document.querySelector('.event-row').click()`);
  const r = await page.eval(`(() => {
    const id = document.querySelector('.event-row').dataset.id, e = events.find(x => x.id === id);
    const g = document.querySelector('#dialog-actions a[href^="https://calendar.google.com/"]');
    return { g: g && g.href, label: document.querySelector('.add-cal-label')?.textContent, ics: icsFile(e), icsLink: !!document.querySelector('#dialog-actions .ics-link'), title: e.title,
      multi: icsFile(events.find(x => x.dateStart !== x.dateEnd)) };
  })()`);
  assert.equal(r.label, 'Adicionar ao calendário:');
  assert.ok(r.icsLink);
  const g = new URL(r.g);
  assert.equal(g.searchParams.get('action'), 'TEMPLATE');
  assert.equal(g.searchParams.get('text'), r.title);
  assert.match(g.searchParams.get('dates'), /^(\d{8}T\d{6}Z\/\d{8}T\d{6}Z|\d{8}\/\d{8})$/);
  assert.ok(r.ics.startsWith('BEGIN:VCALENDAR\r\n') && r.ics.includes('BEGIN:VEVENT') && r.ics.trim().endsWith('END:VCALENDAR'));
  assert.ok(r.ics.split('\r\n').every(l => l.length <= 75), 'linhas do .ics com no máximo 75 caracteres');
  assert.ok(r.ics.includes('SUMMARY:') && r.ics.includes('UID:'));
  assert.match(r.multi, /DTSTART;VALUE=DATE:\d{8}\r\nDTEND;VALUE=DATE:\d{8}/);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('18. formatos habituais sempre disponíveis; sem resultados mostra «Limpar filtros»', { skip }, async () => {
  for (const w of [1280, 375]) {
    const page = await open({ width: w });
    const formats = (await msOptions(page, 'format')).map(o => o.label);
    const base = ['Standard', 'Pioneer', 'Modern', 'Legacy', 'Vintage', 'Pauper', 'Premodern', 'Commander', 'Limited'];
    for (const f of base) assert.ok(formats.includes(f), `${f} na lista: ${formats}`);
    assert.deepEqual(formats.filter(f => base.includes(f)), base, 'ordem lógica');
    assert.equal(formats.at(-1), 'Limited');
    const before = await page.eval(`document.getElementById('count').textContent`);
    assert.equal((await msOptions(page, 'format')).find(o => o.label === 'Vintage').count, 0, 'Vintage sem torneios na fixture');
    assert.ok(await page.eval(`${msRoot('format')}.querySelector('#format-opt-Vintage').closest('.ms-opt').classList.contains('zero')`), 'opções sem torneios a cinzento');
    assert.equal(await pick(page, 'format', 'Vintage'), '0 torneios');
    assert.ok(await page.eval(`!!document.querySelector('#events .empty .empty-reset')`), 'botão Limpar filtros no estado vazio');
    await page.eval(`document.querySelector('#events .empty-reset').click()`);
    assert.equal(await msLabel(page, 'format'), 'Formato');
    assert.equal(await page.eval(`document.getElementById('count').textContent`), before);
    assert.deepEqual(page.errors, []);
    await page.close();
  }
});

test('19. internacionais mostram «Cidade, País» e a bandeira; sem legenda das cores; pré-visualização para partilha', { skip }, async () => {
  const page = await open({ width: 1280 });
  await showAll(page);
  const intl = await page.eval(`[...document.querySelectorAll('.event-row.intl')].map(r => ({ sub: r.querySelector('.subline')?.textContent || '', meta: r.querySelector('.meta-m').textContent, flagLast: !!r.querySelector('.subline .flag:last-child') }))`);
  assert.ok(intl.length >= 3);
  for (const p of intl) assert.ok(!/\d+ dias?/.test(p.sub), `sem duração no local: ${p.sub}`);
  const es = intl.find(p => p.sub.includes('Espanha'));
  assert.equal(es.sub, 'Cidade Exemplo, Espanha 🇪🇸', 'cidade, país e bandeira a seguir');
  assert.ok(es.flagLast && es.meta.includes('Cidade Exemplo, Espanha 🇪🇸'));
  assert.equal(await page.eval(`document.getElementById('type-legend')`), null, 'legenda retirada (as etiquetas já dizem o tipo)');
  const meta = await page.eval(`(async () => {
    const m = p => document.querySelector('meta[property="' + p + '"]')?.content;
    const img = m('og:image'); const local = new URL(img).pathname.replace('/torneios-mtg-portugal/', '');
    const res = await fetch(local); const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    return { img, url: m('og:url'), w: m('og:image:width'), h: m('og:image:height'), status: res.status, size: blob.size, dims: [bmp.width, bmp.height], card: document.querySelector('meta[name="twitter:card"]')?.content };
  })()`);
  assert.equal(meta.img, 'https://mistercimba.github.io/torneios-mtg-portugal/assets/og-image.png');
  assert.equal(meta.url, 'https://mistercimba.github.io/torneios-mtg-portugal/');
  assert.equal(meta.status, 200);
  assert.deepEqual(meta.dims, [1200, 630]);
  assert.equal(meta.w, '1200'); assert.equal(meta.h, '630');
  assert.ok(meta.size < 300 * 1024, 'imagem com menos de 300 KB (limite do WhatsApp)');
  assert.equal(meta.card, 'summary_large_image');
  await page.resize(390);
  assert.ok((await page.eval('document.documentElement.scrollWidth - innerWidth')) <= 0);
  assert.deepEqual(page.errors, []);
  await page.close();
});

// ---------- Contador separado, links partilháveis e páginas de loja ----------
test('20. contador separa Portugal e internacionais', { skip }, async () => {
  const page = await open({ width: 1280 });
  const r = await page.eval(`(() => {
    const rows = [...document.querySelectorAll('.event-row')];
    const intl = rows.filter(r => r.classList.contains('intl')).length;
    return { count: document.getElementById('count').textContent, pt: rows.length - intl, intl };
  })()`);
  assert.ok(r.pt > 0 && r.intl > 0, 'a fixture tem torneios dos dois');
  assert.equal(r.count, `${r.pt} em Portugal · ${r.intl} ${r.intl === 1 ? 'internacional' : 'internacionais'}`);
  assert.equal(await pick(page, 'place', 'Portugal'), `${r.pt} ${r.pt === 1 ? 'torneio' : 'torneios'}`);
  await pick(page, 'place', 'Portugal');
  assert.equal(await pick(page, 'place', 'Internacional'), `${r.intl} ${r.intl === 1 ? 'torneio' : 'torneios'}`);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('21. links partilháveis: filtros e torneio no endereço', { skip }, async () => {
  const page = await open({ width: 1280 });
  assert.ok(await page.eval(`document.getElementById('share-filters').hidden`), 'sem filtros, sem botão de partilha');
  await pick(page, 'circuit', 'RCQ');
  const district = (await msOptions(page, 'place')).find(o => o.child && o.count > 0).label;
  await pick(page, 'place', district);
  const fmt = (await msOptions(page, 'format')).find(o => o.count > 0 && o.label !== 'Limited').label;
  await pick(page, 'format', fmt); await pick(page, 'format', 'Limited');
  const st = await page.eval(`({ search: location.search, count: document.getElementById('count').textContent, shown: !document.getElementById('share-filters').hidden })`);
  const p = new URLSearchParams(st.search);
  assert.equal(p.get('onde'), null); assert.equal(p.get('distrito'), district); assert.equal(p.get('circuito'), 'RCQ'); assert.equal(p.get('formato'), `${fmt},Limited`);
  assert.ok(st.shown, 'botão «Partilhar filtros» com filtros activos');
  // Abrir o mesmo endereço noutra página repõe as escolhas.
  const labels = pg => Promise.all(['format', 'place', 'circuit'].map(k => msLabel(pg, k)));
  const want = await labels(page);
  const page2 = await open({ width: 390, hash: st.search });
  assert.deepEqual([...await labels(page2), await page2.eval(`document.getElementById('count').textContent`)], [...want, st.count]);
  await page2.close();
  // Links antigos (uma só escolha por lista) continuam a funcionar: RCQ só com o Round 3; Portugal inteiro.
  const old = await open({ width: 1280, hash: '?onde=portugal&circuito=RCQ&round=R3' });
  assert.deepEqual(await labels(old), ['Formato', 'Portugal', 'R3 2026/27']);
  assert.ok(await old.eval(`[...document.querySelectorAll('.event-row .type-pill')].every(x => x.textContent.includes('R3'))`));
  const oldP = new URLSearchParams(await old.eval('location.search'));
  assert.deepEqual([oldP.get('onde'), oldP.get('circuito'), oldP.get('round')], ['portugal', null, 'R3 2026/27']);
  await old.close();
  // Torneio: ?t=<id> enquanto o modal está aberto; desaparece ao fechar.
  await page.eval(`document.getElementById('reset').click()`);
  assert.equal(await page.eval('location.search'), '');
  const id = await page.eval(`document.querySelector('.event-row').dataset.id`);
  await page.eval(`document.querySelector('.event-row').click()`);
  assert.equal(await page.eval(`new URLSearchParams(location.search).get('t')`), id);
  await page.eval(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => { window.__copied = t; } } })`);
  await page.eval(`document.getElementById('share-event').click()`);
  await new Promise(r => setTimeout(r, 100));
  const shared = await page.eval(`({ copied: window.__copied, label: document.getElementById('share-event').textContent })`);
  assert.equal(new URL(shared.copied).searchParams.get('t'), id);
  assert.equal(shared.label, 'Link copiado ✓');
  await page.eval(`document.getElementById('close-dialog').click()`);
  // O evento «close» do diálogo é assíncrono: espera que o endereço volte ao normal.
  await page.waitFor(`location.search === ''`);
  assert.equal(await page.eval('location.search'), '');
  // Link directo para o torneio abre o modal; um id que não existe é ignorado.
  const page3 = await open({ width: 1280, hash: '?t=' + id });
  assert.ok(await page3.eval(`document.getElementById('detail-dialog').open`));
  assert.ok(await page3.eval(`document.querySelector('#detail-dialog [data-id], #dialog-body') && true`));
  await page3.close();
  const page4 = await open({ width: 1280, hash: '?t=naoexiste&formato=Nada&onde=Marte' });
  assert.ok(!(await page4.eval(`document.getElementById('detail-dialog').open`)));
  assert.equal(await msLabel(page4, 'format'), 'Formato');
  assert.equal(await msLabel(page4, 'place'), 'Onde');
  assert.deepEqual(page4.errors, []);
  await page4.close();
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('22b. ficha das lojas: morada, Instagram e site por defeito no detalhe, no mapa e na página da loja', { skip }, async () => {
  const page = await open({ width: 1280 });
  // A ficha publicada carrega sem erros; aqui junta-se uma loja da fixture para testar.
  assert.ok(await page.eval(`STORE_INFO.size > 0`), 'data/stores.json carregado');
  await page.eval(`loadStoreInfo([{ nome: 'Loja Exemplo Norte', localidade: 'Vila Nova de Famalicão', morada: 'Rua Exemplo 1, 4760-000 Vila Nova de Famalicão', instagram: '@loja_exemplo', site: 'https://exemplo.pt' }])`);
  await page.eval(`[...document.querySelectorAll('.event-row')].find(r => r.textContent.includes('Loja Exemplo Norte')).click()`);
  const d = await page.eval(`({ loc: [...document.querySelectorAll('.dialog-location')].map(x => x.textContent), links: [...document.querySelectorAll('#dialog-actions a')].map(a => [a.textContent, a.getAttribute('href')]) })`);
  assert.ok(d.loc.includes('Rua Exemplo 1, 4760-000 Vila Nova de Famalicão'), JSON.stringify(d.loc));
  const href = t => d.links.find(([x]) => x.startsWith(t))?.[1];
  assert.equal(href('Instagram'), 'https://www.instagram.com/loja_exemplo');
  assert.equal(href('Site'), 'https://exemplo.pt');
  assert.ok(decodeURIComponent(href('Mapa')).includes('Rua Exemplo 1'));
  await page.eval(`document.querySelector('#dialog-actions .store-link').click()`);
  await page.waitFor(`document.querySelector('.store-page h2')`);
  const st = await page.eval(`({ addr: document.querySelector('.store-address')?.textContent, ig: !!document.querySelector('.store-actions a[href="https://www.instagram.com/loja_exemplo"]') })`);
  assert.deepEqual(st, { addr: 'Rua Exemplo 1, 4760-000 Vila Nova de Famalicão', ig: true });
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('22. página da loja: nomes diferentes da mesma loja juntam-se; abre a partir do modal e dos vencedores', { skip }, async () => {
  const page = await open({ width: 1280 });
  const same = await page.eval(`[
    storeKeyFor('End Turn', 'Avintes') === storeKeyFor('EndTurn', 'Avintes'),
    storeKeyFor('Magus Gamestore', 'Vila Nova de Famalicão') === storeKeyFor('Magus', 'Vila Nova de Famalicão'),
    storeKeyFor('Mulligan Quarteira', 'Quarteira') === storeKeyFor('Mulligan Games', 'Quarteira'),
    storeKeyFor('Mulligan Quarteira', 'Quarteira') !== storeKeyFor('Mulligan Portimão', 'Portimão'),
    storeKeyFor('Mercadia Games', 'Benfica') === storeKeyFor('Mercadia', 'Lisboa'),
    storeKeyFor("Templars' Arena", 'Rio de Mouro') === storeKeyFor('Templars Arena Gamecenter', 'Rio de Mouro'),
    storeKeyFor('Templar Games', 'Tomar') !== storeKeyFor('Templars Arena', 'Rio de Mouro'),
    storeKeyFor('PlayHub Faro', 'Faro') === storeKeyFor('PlayHub', 'Faro'),
    storeKeyFor('Valquíria', 'Torres Novas') === storeKeyFor('Valquiria', 'Torres Novas'),
    /^[a-z0-9-]+$/.test(storeKeyFor('Gárgula Gaming', 'Lisboa')),
  ]`);
  assert.deepEqual(same, same.map(() => true), JSON.stringify(same));
  // Do modal para a loja.
  await page.eval(`document.querySelector('.event-row').click()`);
  const storeName = await page.eval(`events.find(e => e.id === document.querySelector('.event-row').dataset.id).loja`);
  await page.eval(`document.querySelector('#dialog-actions .store-link').click()`);
  await page.waitFor(`document.body.dataset.view === 'store' && document.querySelector('.store-head h2')`);
  const r = await page.eval(`(() => {
    const key = location.hash.slice(6);
    const ids = [...document.querySelectorAll('#store .event-row, #store .info-row')].map(e => e.dataset.id);
    return { key, dialog: document.getElementById('detail-dialog').open, name: document.querySelector('.store-head h2').textContent,
      all: ids.every(id => storeKey(events.find(e => e.id === id)) === key), n: ids.length, title: document.title,
      dupIds: (() => { const all = [...document.querySelectorAll('[id]')].map(e => e.id); return all.length - new Set(all).size; })() };
  })()`);
  assert.ok(!r.dialog, 'o modal fecha ao ir para a loja');
  assert.ok(r.n >= 1 && r.all, 'só torneios desta loja');
  assert.equal(r.name, storeName);
  assert.ok(r.title.startsWith(storeName));
  assert.equal(r.dupIds, 0, 'sem ids repetidos');
  // Torneio na página da loja abre o modal.
  await page.eval(`document.querySelector('#store .event-row').click()`);
  assert.ok(await page.eval(`document.getElementById('detail-dialog').open`));
  await page.eval(`document.getElementById('close-dialog').click()`);
  // Voltar à agenda.
  await page.eval(`document.querySelector('#store .back-link').click()`);
  await page.waitFor(`document.body.dataset.view === 'agenda'`);
  // Vencedores → loja.
  await page.eval(`location.hash = 'winners'`);
  await page.waitFor(`document.body.dataset.view === 'winners'`);
  const link = await page.eval(`document.querySelector('#results .store-name-link')?.getAttribute('href')`);
  assert.match(link, /^#loja-[a-z0-9-]+$/);
  await page.eval(`document.querySelector('#results .store-name-link').click()`);
  await page.waitFor(`document.body.dataset.view === 'store'`);
  assert.ok(await page.eval(`!!document.querySelector('.store-results .result')`), 'a página da loja mostra os vencedores');
  // Loja desconhecida e telemóvel sem scroll horizontal.
  await page.eval(`location.hash = 'loja-naoexiste-nada'`);
  await page.waitFor(`document.querySelector('#store .empty')`);
  await page.eval(`location.hash = ${JSON.stringify(link.slice(1))}`);
  await page.resize(320);
  assert.ok((await page.eval('document.documentElement.scrollWidth - innerWidth')) <= 0, '320px: scroll horizontal na página da loja');
  assert.deepEqual(page.errors, []);
  await page.close();
});

// ---------- Instalar no telemóvel (app web) ----------
test('23. app web: manifesto, ícones, service worker e agenda sem rede', { skip }, async () => {
  const page = await open({ width: 390 });
  const r = await page.eval(`(async () => {
    const href = document.querySelector('link[rel="manifest"]').getAttribute('href');
    const m = await fetch(href).then(r => r.json());
    const dims = async src => { const b = await fetch(src).then(r => r.ok ? r.blob() : null); if (!b) return null; const i = await createImageBitmap(b); return [i.width, i.height]; };
    const icons = await Promise.all(m.icons.map(async i => ({ ...i, dims: await dims(i.src) })));
    const apple = await dims(document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href'));
    return { name: m.name, short: m.short_name, start: m.start_url, display: m.display, theme: m.theme_color, icons, apple,
      appleCapable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content };
  })()`);
  assert.equal(r.name, 'Torneios MTG Portugal'); assert.equal(r.short, 'Torneios MTG');
  assert.equal(r.start, './'); assert.equal(r.display, 'standalone'); assert.equal(r.theme, '#11151e');
  for (const want of [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]) {
    const icon = r.icons.find(i => i.sizes === want[0] && i.purpose === want[1]);
    assert.ok(icon, `ícone ${want.join(' ')}`);
    assert.deepEqual(icon.dims, want[0].split('x').map(Number));
  }
  assert.deepEqual(r.apple, [180, 180]); assert.equal(r.appleCapable, 'yes');
  // O Chrome considera o site instalável (dispara «beforeinstallprompt»).
  await page.waitFor(`installPrompt !== null`, 15000);
  // Sem o pedido do navegador (ex.: iPhone), o botão abre as instruções.
  await page.eval(`installPrompt = null; updateInstallLink(); document.getElementById('install-wrap').hidden = false`);
  await page.eval(`document.getElementById('install-app').click()`);
  const help = await page.eval(`[document.getElementById('detail-dialog').open, document.querySelectorAll('.install-steps li').length]`);
  assert.deepEqual(help, [true, 3], JSON.stringify(page.errors));
  await page.eval(`document.getElementById('close-dialog').click()`);
  // Service worker activo e a controlar a página.
  await page.waitFor(`navigator.serviceWorker && navigator.serviceWorker.controller`, 15000);
  // Sem rede: a página abre na mesma com a última agenda guardada e mostra o aviso.
  const rows = await page.eval(`document.querySelectorAll('.event-row').length`);
  await page.cdp('Network.enable');
  await page.cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await page.cdp('Page.reload', { ignoreCache: false });
  await page.waitFor(`document.readyState === 'complete' && document.querySelectorAll('.event-row').length > 0`, 15000);
  assert.equal(await page.eval(`document.querySelectorAll('.event-row').length`), rows);
  assert.ok(await page.eval(`!document.getElementById('offline-note').hidden`), 'aviso de «sem ligação»');
  await page.cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await page.waitFor(`document.getElementById('offline-note').hidden`);
  await page.eval(`navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister())))`);
  await page.close();
});

// ---------- Ideias do mtgupdate: atalhos, subscrição, contagem decrescente, bandeiras, aviso legal ----------
test('24. atalhos por tipo, subscrição do calendário, «daqui a N», bandeira, «Qualifica para» e aviso legal', { skip }, async () => {
  for (const w of [1280, 360]) {
    const page = await open({ width: w });
    // Atalhos.
    const chips = await page.eval(`[...document.querySelectorAll('#quick-types .quick')].map(b => [b.textContent, b.getAttribute('aria-pressed')])`);
    assert.deepEqual(chips.map(c => c[0]), ['Todos', 'RCQ', 'LPP', 'Internacionais']);
    assert.equal(chips[0][1], 'true');
    const click = label => page.eval(`[...document.querySelectorAll('#quick-types .quick')].find(b => b.textContent === ${JSON.stringify(label)}).click()`);
    await click('RCQ');
    const st0 = async () => ({ c: await msLabel(page, 'circuit'), sc: await msLabel(page, 'place'), pressed: await page.eval(`[...document.querySelectorAll('#quick-types [aria-pressed="true"]')].map(b => b.textContent).join()`) });
    let st = { ...await st0(), rows: await page.eval(`[...document.querySelectorAll('.event-row .type-pill')].every(p => p.textContent.startsWith('RCQ'))`) };
    assert.deepEqual(st, { c: 'RCQ', sc: 'Onde', pressed: 'RCQ', rows: true });
    assert.ok((await msOptions(page, 'circuit')).filter(o => o.child).every(o => o.state === 'on'), 'RCQ marca todos os rounds');
    await click('Internacionais');
    assert.deepEqual(await st0(), { c: 'Circuito', sc: 'Internacional', pressed: 'Internacionais' });
    // Bandeira e «Qualifica para» no Spotlight de exemplo (Cidade Exemplo, Espanha).
    const spot = await page.eval(`(() => { const r = [...document.querySelectorAll('.event-row')].find(x => x.textContent.includes('Spotlight Exemplo')); return { price: r.querySelector('.subline').textContent, q: r.querySelector('.qualifies')?.textContent, vis: r.querySelector('.qualifies') && getComputedStyle(r.querySelector('.qualifies')).display !== 'none' }; })()`);
    assert.equal(spot.price, 'Cidade Exemplo, Espanha 🇪🇸');
    assert.equal(spot.q, 'Qualifica para Pro Tour Exemplo'); assert.ok(spot.vis);
    await click('Todos');
    assert.deepEqual(await st0(), { c: 'Circuito', sc: 'Onde', pressed: 'Todos' });
    // Contagem decrescente nos dias futuros sem «Hoje/Amanhã/Este fim de semana».
    const cd = await page.eval(`[...document.querySelectorAll('.day-card')].map(c => ({ date: c.dataset.date, rel: !!c.querySelector('.day-rel'), cd: c.querySelector('.day-countdown')?.textContent || null }))`);
    for (const c of cd) {
      const diff = Math.round((new Date(c.date + 'T12:00:00') - new Date('2026-11-23T12:00:00')) / 86400000);
      if (c.rel || diff < 2) { assert.equal(c.cd, null, c.date); continue; }
      const expected = diff < 14 ? `daqui a ${diff} dias` : diff < 60 ? `daqui a ${Math.round(diff / 7)} semanas` : (m => (m === 1 ? 'daqui a 1 mês' : `daqui a ${m} meses`))(Math.round(diff / 30.4));
      assert.equal(c.cd, expected, c.date);
    }
    // Subscrição.
    await page.eval(`document.getElementById('subscribe').click()`);
    const feeds = await page.eval(`[...document.querySelectorAll('.feed')].map(f => ({ title: f.querySelector('h3').textContent, links: [...f.querySelectorAll('a')].map(a => a.getAttribute('href')), copy: f.querySelector('.feed-copy').dataset.url }))`);
    assert.deepEqual(feeds.map(f => f.title), ['Todos os torneios', 'Só RCQs', 'Só internacionais']);
    for (const [i, file] of ['calendar.ics', 'calendar-rcq.ics', 'calendar-internacional.ics'].entries()) {
      assert.ok(feeds[i].links[0].startsWith('webcal://') && feeds[i].links[0].endsWith('/' + file), feeds[i].links[0]);
      const g = new URL(feeds[i].links[1]);
      assert.equal(g.hostname, 'calendar.google.com'); assert.equal(g.searchParams.get('cid'), feeds[i].links[0]);
      assert.ok(feeds[i].copy.startsWith('http') && feeds[i].copy.endsWith('/' + file));
    }
    await page.eval(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => { window.__copied = t; } } })`);
    await page.eval(`document.querySelector('.feed-copy').click()`);
    await new Promise(r => setTimeout(r, 100));
    assert.ok((await page.eval('window.__copied')).endsWith('/calendar.ics'));
    await page.eval(`document.getElementById('close-dialog').click()`);
    // Aviso legal.
    assert.match(await page.eval(`document.querySelector('.footer .legal').textContent`), /conteúdo de fã não oficial.*Wizards of the Coast/);
    assert.ok((await page.eval('document.documentElement.scrollWidth - innerWidth')) <= 0, `${w}px: scroll horizontal`);
    assert.deepEqual(page.errors, []);
    await page.close();
  }
});


// ---------- Layout compacto (24/11/2026) ----------
test('25. layout compacto: o primeiro torneio aparece perto do topo, sem título «Agenda» nem legenda', { skip }, async () => {
  for (const [w, h, max] of [[1280, 900, 420], [1600, 1000, 420], [390, 844, 470], [320, 640, 520]]) {
    const page = await open({ width: w, height: h });
    const r = await page.eval(`(() => {
      const first = document.querySelector('.event-row').getBoundingClientRect();
      return { top: Math.round(first.top), h2: !!document.querySelector('#agenda .section-top h2'), legend: !!document.getElementById('type-legend'),
        names: [...document.querySelectorAll('.ms-label')].map(l => l.textContent),
        overflow: document.documentElement.scrollWidth - innerWidth };
    })()`);
    assert.ok(r.top <= max, `${w}px: primeiro torneio a ${r.top}px do topo (máx. ${max})`);
    assert.ok(!r.h2 && !r.legend, 'sem título «Agenda» nem legenda');
    assert.deepEqual(r.names, ['Formato', 'Onde', 'Circuito']);
    assert.ok(r.overflow <= 0, `${w}px: scroll horizontal`);
    assert.deepEqual(page.errors, []);
    await page.close();
  }
});


// ---------- Correcções do teste independente (24/11/2026) ----------
test('26. Voltar depois de «Ver a loja» regressa ao torneio; cartão de hoje com eventos a decorrer; pesquisa por país e época', { skip }, async () => {
  const page = await open({ width: 390 });
  // Voltar: agenda → torneio → loja → Voltar = agenda com o torneio aberto.
  const id = await page.eval(`[...document.querySelectorAll('.event-row')].find(r => r.textContent.includes('Loja Exemplo Norte')).dataset.id`);
  await page.eval(`document.querySelector('.event-row[data-id="${id}"]').click()`);
  await page.eval(`document.querySelector('#dialog-actions .store-link').click()`);
  // O fecho do diálogo é assíncrono: espera que a entrada da loja fique sem ?t= antes de voltar.
  await page.waitFor(`document.body.dataset.view === 'store' && !document.getElementById('detail-dialog').open && !new URLSearchParams(location.search).has('t')`);
  await page.eval(`history.back()`);
  await page.waitFor(`document.body.dataset.view === 'agenda' && document.getElementById('detail-dialog').open`);
  assert.equal(await page.eval(`new URLSearchParams(location.search).get('t')`), id);
  await page.eval(`document.getElementById('close-dialog').click()`);
  // Evento de vários dias já começado: o cartão de hoje existe e tem «A decorrer».
  await page.eval(`(() => { today = '2027-03-06'; buildFilters(); renderEvents(); })()`);
  const first = await page.eval(`(() => { const c = document.querySelector('.day-card[data-date="2027-03-06"]'); return c ? { cont: c.querySelectorAll('.cont-row').length, rel: c.querySelector('.day-rel')?.textContent || '' } : null; })()`);
  assert.ok(first && first.cont >= 1, `cartão de hoje com «A decorrer»: ${JSON.stringify(first)}`);
  await page.eval(`(() => { today = '2026-11-23'; buildFilters(); renderEvents(); })()`);
  // Pesquisa pelo país (também quando vem da localização) e pela época.
  const search = q => page.eval(`(() => { const s = document.getElementById('search'); s.value = ${JSON.stringify(q)}; s.dispatchEvent(new Event('input')); return document.querySelectorAll('.event-row').length; })()`);
  assert.ok(await search('espanha') >= 1, 'pesquisa por país');
  assert.ok(await search('2026/27') >= 1, 'pesquisa pela época');
  await search('');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('27. ecrãs baixos: «Limpar/Feito» das listas sempre visíveis; vencedores no telemóvel com link para a loja; .ics válido', { skip }, async () => {
  for (const [w, h] of [[320, 568], [740, 360]]) {
    const page = await open({ width: w, height: h, mobile: true });
    for (const key of ['format', 'place', 'circuit']) {
      const r = await page.eval(`(() => { const root = document.querySelector('.ms[data-key="${key}"]'); root.querySelector('.ms-btn').click(); const f = root.querySelector('.ms-foot').getBoundingClientRect(); const out = { bottom: Math.round(f.bottom), vh: innerHeight }; root.querySelector('.ms-done').click(); return out; })()`);
      assert.ok(r.bottom <= r.vh, `${w}×${h} ${key}: rodapé fora do ecrã ${JSON.stringify(r)}`);
    }
    assert.deepEqual(page.errors, []);
    await page.close();
  }
  const page = await open({ width: 390, hash: '#winners' });
  assert.ok(await page.eval(`[...document.querySelectorAll('.result .result-meta a.store-name-link')].some(a => a.offsetParent !== null)`), 'link para a loja visível no telemóvel');
  // .ics: «;» e «,» escapados e linhas com no máximo 75 octetos.
  const ics = await page.eval(`(() => { const e = { ...events.find(x => x.scope === 'portugal' && !isInfo(x)), title: 'Teste; com ponto e vírgula, vírgula e acentos çãéíóú '.repeat(3) }; return icsFile(e); })()`);
  assert.ok(ics.includes('Teste\\; com ponto e vírgula\\, vírgula'), 'escapes do .ics');
  const enc = new TextEncoder();
  for (const line of ics.split('\r\n')) assert.ok(enc.encode(line).length <= 75, `linha com mais de 75 octetos: ${line}`);
  await page.close();
});


test('28. detalhe compacto: sem informação repetida; calendário num menu; acções numa barra', { skip }, async () => {
  for (const w of [1280, 390]) {
    const page = await open({ width: w });
    await page.eval(`[...document.querySelectorAll('.event-row')].find(r => r.querySelector('.type-pill').textContent.startsWith('RCQ')).click()`);
    const d = await page.eval(`(() => {
      const facts = [...document.querySelectorAll('.facts dt')].map(x => x.textContent);
      const menu = document.querySelector('.add-cal');
      return { facts, tabs: document.querySelectorAll('.dialog-tab').length, meta: document.querySelector('.dialog-meta').textContent,
        menuClosed: !menu.open, google: !!menu.querySelector('a[href^="https://calendar.google.com/"]'), oldGrid: !!document.querySelector('.detail-grid') };
    })()`);
    assert.ok(!d.facts.some(f => /Formato|Ronda|Horário|Vagas.*Vagas/.test(f)), `${w}px: factos repetidos ${d.facts}`);
    assert.ok(d.tabs <= 2, `${w}px: etiquetas a mais`);
    assert.ok(d.menuClosed && d.google && !d.oldGrid);
    assert.match(d.meta, /\d{4}/);
    assert.deepEqual(page.errors, []);
    await page.close();
  }
});

test('29. etiqueta «Novo» nos torneios acrescentados nos últimos 7 dias', { skip }, async () => {
  const page = await open({ width: 1280 });
  const r = await page.eval(`(() => {
    const rows = [...document.querySelectorAll('.event-row')];
    const pill = id => !!rows.find(x => x.dataset.id === events.find(e => e.title.includes(id))?.id)?.querySelector('.new-pill');
    return { novos: document.querySelectorAll('.event-row .new-pill').length, centro: pill('Loja Exemplo Centro'), antigo: events.filter(e => e.criado && e.criado < '2026-11-16').every(e => !rows.find(x => x.dataset.id === e.id)?.querySelector('.new-pill')) };
  })()`);
  assert.ok(r.novos >= 1 && r.centro, JSON.stringify(r));
  assert.ok(r.antigo, 'criado há mais de 7 dias não tem etiqueta');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('30. vencedores: estatísticas dos RCQs e escolha da round', { skip }, async () => {
  const page = await open({ width: 1280, hash: '#winners' });
  await page.waitFor(`document.querySelector('.stat-tile')`);
  const st = () => page.eval(`({ chips: [...document.querySelectorAll('#win-rounds .quick')].map(b => [b.firstChild.textContent.trim(), b.getAttribute('aria-pressed')]), rcqs: document.querySelector('.stat-tile b')?.textContent || null, rows: document.querySelectorAll('#results .result').length, empty: document.querySelector('.win-empty')?.textContent || '' })`);
  let s = await st();
  assert.deepEqual(s.chips.map(c => c[0]), ['Todas', 'Round 1', 'Round 2', 'Round 3']);
  assert.equal(Number(s.rcqs), s.rows, 'nº de RCQs = linhas da lista');
  const total = s.rows;
  await page.eval(`[...document.querySelectorAll('#win-rounds .quick')].find(b => b.dataset.round === 'R3').click()`);
  s = await st();
  const r3 = await page.eval(`winners.filter(r => r.round === 'R3' && r.season === winSeason).length`);
  assert.equal(s.rows, r3, 'Round 3: só os resultados dessa round');
  if (!r3) assert.match(s.empty, /Ainda não há vencedores da Round 3/);
  await page.eval(`[...document.querySelectorAll('#win-rounds .quick')].find(b => b.dataset.round === 'R2').click()`);
  const r2 = await st();
  assert.ok(r2.rows <= total && r2.chips.find(c => c[0] === 'Round 2')[1] === 'true');
  await page.eval(`[...document.querySelectorAll('#win-rounds .quick')].find(b => b.dataset.round === 'R1').click()`);
  const r1 = await st();
  assert.equal(r1.rows, await page.eval(`winners.filter(r => r.round === 'R1' && r.season === winSeason).length`), 'Round 1: resultados da R1');
  assert.equal(r1.rows + r2.rows + r3, total, 'as rounds somam o total');
  assert.ok(await page.eval(`[...document.querySelectorAll('.stat-bars li')].length > 0`));
  // Numa round ninguém repete (quem ganha fica apurado): sem caixa de repetidos.
  assert.equal(await page.eval(`document.querySelector('.stat-list')`), null, 'numa round não há caixa de repetidos');
  await page.eval(`[...document.querySelectorAll('#win-rounds .quick')].find(b => b.dataset.round === '').click()`);
  const multi = await page.eval(`(() => { const m = {}; winners.forEach(r => (m[r.name] ??= new Set()).add(r.round)); return Object.values(m).filter(s => s.size > 1).length; })()`);
  const items = await page.eval(`[...document.querySelectorAll('.stat-list li')].map(li => li.textContent)`);
  assert.equal(items.length, Math.min(8, multi), 'em «Todas»: quem ganhou em mais de uma round');
  if (items.length) assert.match(items[0], /R\d · R\d/);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('32. vencedores: histórico com nomes próprios (WPNQ, Season 1…) e anos certos', { skip }, async () => {
  const page = await open({ width: 1280, hash: '#winners' });
  await page.waitFor(`document.querySelector('.stat-tile')`);
  const seasons = await page.eval(`[...document.querySelectorAll('#win-seasons .quick')].map(b => b.textContent)`);
  if (!seasons.includes('2023/24')) { await page.close(); return; } // dados sem histórico
  assert.deepEqual(seasons.slice(0, 2), ['2023/24', '2024/25']);
  assert.equal(await page.eval(`document.querySelector('#win-seasons [aria-pressed=true]').textContent`), '2026/27', 'abre na época actual');
  await page.eval(`[...document.querySelectorAll('#win-seasons .quick')].find(b => b.textContent === '2023/24').click()`);
  assert.deepEqual(await page.eval(`[...document.querySelectorAll('#win-rounds .quick')].map(b => b.firstChild.textContent.trim())`), ['Todas', 'WPNQ R5', 'WPNQ R6']);
  // WPNQ R6 começa em Janeiro de 2024 (e não de 2023).
  assert.ok(await page.eval(`winners.filter(r => r.round === 'R6' && r.season === '2023/24').every(r => r.date >= '2024-01-01' && r.date <= '2024-03-31')`));
  await page.eval(`[...document.querySelectorAll('#win-seasons .quick')].find(b => b.textContent === '2024/25').click()`);
  assert.deepEqual(await page.eval(`[...document.querySelectorAll('#win-rounds .quick')].map(b => b.firstChild.textContent.trim())`), ['Todas', 'Season 1', 'Season 2', 'Season 3']);
  assert.deepEqual(await page.eval(`[...document.querySelectorAll('#win-rounds .round-fmt')].map(x => x.textContent)`), ['Pioneer', 'Modern', 'Standard'], 'formato de cada Season');
  assert.equal(await page.eval(`document.querySelector('#winners-title').textContent`), 'RCQ · Época 2024/25');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('31. vencedores: a mesma round de épocas diferentes não se mistura', { skip }, async () => {
  const page = await open({ width: 1280, hash: '#winners' });
  await page.waitFor(`document.querySelector('.stat-tile')`);
  const r1 = await page.eval(`winners.filter(r => r.round === 'R1' && r.season === '2026/27').length`);
  const before = await page.eval(`[...document.querySelectorAll('#win-seasons .quick')].map(b => b.textContent)`);
  assert.equal(before.at(-1), '2026/27');
  await page.eval(`winners.push({ date: '2027-04-17', store: 'Arena Porto', city: 'Porto', name: 'Teste Futuro', deck: 'Deck', players: 20, format: 'Modern', round: 'R1', season: '2027/28' }); winRounds.push({ season: '2027/28', round: 'R1' }, { season: '2027/28', round: 'R2' }); winSeason = null; winRound = ''; renderWinners();`);
  const st = () => page.eval(`({ seasons: [...document.querySelectorAll('#win-seasons .quick')].map(b => [b.textContent, b.getAttribute('aria-pressed')]), rounds: [...document.querySelectorAll('#win-rounds .quick')].map(b => b.firstChild.textContent.trim()), title: document.querySelector('#winners-title').textContent, rows: document.querySelectorAll('#results .result').length })`);
  let s = await st();
  assert.deepEqual(s.seasons.slice(-2), [['2026/27', 'false'], ['2027/28', 'true']], 'abre na época mais recente com vencedores');
  assert.equal(s.title, 'RCQ · Época 2027/28');
  assert.deepEqual(s.rounds, ['Todas', 'Round 1', 'Round 2']);
  assert.equal(s.rows, 1);
  await page.eval(`[...document.querySelectorAll('#win-seasons .quick')].find(b => b.textContent === '2026/27').click()`);
  await page.eval(`[...document.querySelectorAll('#win-rounds .quick')].find(b => b.dataset.round === 'R1').click()`);
  s = await st();
  assert.equal(s.title, 'RCQ · Época 2026/27');
  assert.equal(s.rows, r1, 'Round 1 de 2026/27 sem o resultado de 2027/28');
  assert.deepEqual(page.errors, []);
  await page.close();
});
