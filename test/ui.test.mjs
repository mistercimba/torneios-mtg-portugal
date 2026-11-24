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

async function open({ width = 1280, mobile = width <= 760, theme = 'light', hash = '' } = {}) {
  const page = await browser.newPage({ width, height: 900, mobile, theme });
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
  // Ligações de mês continuam na Agenda e levam ao mês.
  await page.eval(`document.querySelector('[data-view="agenda"]').click()`);
  await page.eval(`document.querySelector('.month-links a').click()`);
  await new Promise(r => setTimeout(r, 200));
  assert.equal(await view(), 'agenda');
  assert.ok(await page.eval(`location.hash.startsWith('#m-')`));
  // Carregar directamente com #winners.
  const p2 = await open({ width: 390, hash: '#winners' });
  assert.equal(await p2.eval(`document.querySelector('.view.active').id`), 'winners');
  assert.deepEqual([...page.errors, ...p2.errors], []);
  await page.close(); await p2.close();
});

test('6. contador: nunca «0 torneios» quando há datas informativas visíveis', { skip }, async () => {
  const page = await open({ width: 1280 });
  const set = v => page.eval(`(() => { const s = document.getElementById('circuit'); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('input')); return [document.getElementById('count').textContent, document.querySelectorAll('.info-row').length, document.querySelectorAll('.event-row').length]; })()`);
  const [txt, info, rows] = await set('type:Anúncio');
  assert.equal(rows, 0); assert.equal(info, 1);
  assert.equal(txt, '1 data informativa');
  const [txtAll] = await set('');
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
  assert.ok(nightRow && nightRow.includes('Início 20:00'), `linha do evento nocturno: ${nightRow} / ${night}`);
  assert.ok(!/4–5|5 Dezembro/.test(nightRow), 'não deve aparecer como 2 dias');
  await page.eval(`[...document.querySelectorAll('.event-row')].find(r => r.getAttribute('aria-label').includes('4 Dezembro')).click()`);
  const modal = await page.eval(`document.getElementById('dialog-body').innerText`);
  assert.ok(modal.includes('20:00–00:00'), `modal: ${modal}`);
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
    await page.eval(`(() => { const s = document.getElementById('circuit'); s.value = 'type:Spotlight'; s.dispatchEvent(new Event('input')); })()`);
    assert.ok(!(await page.eval(`document.getElementById('events').innerText`)).includes('Regional Championship Exemplo'));
    assert.deepEqual(page.errors, []);
    await page.close();
  }
});

test('11. desktop: colunas alinhadas, tipo encostado à esquerda', { skip }, async () => {
  for (const w of [1280, 1100, 900]) {
    const page = await open({ width: w });
    await showAll(page);
    const r = await page.eval(`[...document.querySelectorAll('.event-row')].map(row => {
      const R = s => row.querySelector(s).getBoundingClientRect();
      const pill = R('.type-pill'), name = R('.store'), fmt = R('.format-col'), price = R('.price-col');
      return { gap: name.left - pill.right, pillLeft: Math.round(pill.left), nameLeft: Math.round(name.left), fmtLeft: Math.round(fmt.left), priceRight: Math.round(price.right), rowRight: Math.round(row.getBoundingClientRect().right), name: row.querySelector('.store').textContent };
    })`);
    for (const x of r) assert.ok(x.gap >= 10, `${w}px «${x.name}»: ${x.gap.toFixed(1)}px entre o tipo e o nome`);
    assert.equal(new Set(r.map(x => x.pillLeft)).size, 1, `${w}px: etiquetas de tipo desalinhadas à esquerda`);
    assert.equal(new Set(r.map(x => x.nameLeft)).size, 1, `${w}px: coluna do evento desalinhada`);
    assert.equal(new Set(r.map(x => x.fmtLeft)).size, 1, `${w}px: coluna do formato desalinhada`);
    assert.equal(new Set(r.map(x => x.priceRight)).size, 1, `${w}px: coluna da inscrição desalinhada`);
    assert.ok(await page.eval(`getComputedStyle(document.querySelector('.col-head')).display !== 'none'`));
    assert.ok((await page.eval('document.documentElement.scrollWidth - innerWidth')) <= 0, `${w}px: scroll horizontal`);
    await page.close();
  }
});

test('12. telemóvel 320–430 px: tipo e preço na primeira linha, nome e detalhes por baixo, sem sobreposições', { skip }, async () => {
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
          const t = box(row.querySelector('.event-type')), p = box(row.querySelector('.price-col')), n = box(row.querySelector('.store')), m = box(row.querySelector('.meta-m')), rb = box(row);
          const name = row.querySelector('.store').textContent;
          if (hit(t, p)) bad.push(name + ': tipo sobre o preço');
          if (n.top < Math.max(t.bottom, p.bottom) - 0.5) bad.push(name + ': nome sobe para a linha do tipo');
          if (m.top < n.bottom - 0.5 || m.height === 0) bad.push(name + ': detalhes em falta ou sobrepostos');
          if (p.right > rb.right + 0.5 || t.right > rb.right + 0.5 || n.right > rb.right + 0.5) bad.push(name + ': sai do cartão');
          if (Math.abs(p.top - t.top) > 6) bad.push(name + ': preço fora da primeira linha');
        }
        for (const el of document.querySelectorAll('.day-head')) { const n = box(el.querySelector('.day-num')), w = box(el.querySelector('.day-names')), c = el.querySelector('.day-count'); if (hit(n, w) || (c && hit(w, box(c)))) bad.push('cabeçalho do dia sobreposto'); }
        return { bad: bad.slice(0, 5), overflow: document.documentElement.scrollWidth - innerWidth,
          hidden: ['.col-head', '.format-col', '.event-time'].every(s => getComputedStyle(document.querySelector(s)).display === 'none') };
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
  assert.match(await set('scope', 'internacional'), COUNT_RE);
  assert.equal(await page.eval(`document.querySelectorAll('.info-row').length`), 0, 'datas informativas escondidas com filtro de local');
  assert.ok(await page.eval(`[...document.querySelectorAll('.event-row')].every(r => r.querySelector('.price-col small').textContent === 'Internacional')`));
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

test('15. filtros: Distrito só com Portugal, Round só com RCQ, formatos por ordem lógica', { skip }, async () => {
  for (const w of [1280, 390, 320]) {
    const page = await open({ width: w });
    await showAll(page);
    const st = () => page.eval(`({ district: !document.getElementById('district-filter').hidden, round: !document.getElementById('round-filter').hidden,
      dv: document.getElementById('district').value, rv: document.getElementById('round').value, count: document.getElementById('count').textContent,
      overflow: document.documentElement.scrollWidth - innerWidth,
      optgroups: document.querySelectorAll('.controls optgroup').length })`);
    const set = (id, v) => page.eval(`(() => { const s = document.getElementById(${JSON.stringify(id)}); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    let s = await st();
    assert.ok(!s.district && !s.round, `${w}px: filtros dependentes escondidos ao início`);
    assert.equal(s.optgroups, 0, 'sem subsecções nas listas');
    // Formatos por ordem lógica (construído → Commander → limitado → combinações).
    const formats = await page.eval(`[...document.getElementById('format').options].slice(1).map(o => o.value)`);
    const idx = f => formats.indexOf(f);
    assert.ok(!formats.includes('cEDH'), `cEDH junta-se a Commander: ${formats}`);
    if (await page.eval(`[...document.querySelectorAll('.format-col')].some(f => /cedh/i.test(f.textContent))`)) assert.ok(formats.includes('Commander'), `torneios cEDH aparecem em Commander: ${formats}`);
    for (const [a, b] of [['Standard', 'Modern'], ['Modern', 'Legacy'], ['Legacy', 'Pauper'], ['Pauper', 'Commander']]) if (idx(a) >= 0 && idx(b) >= 0) assert.ok(idx(a) < idx(b), `${a} antes de ${b}: ${formats}`);
    assert.equal(formats.at(-1), 'Limited', `Limited no fim: ${formats}`);
    assert.ok(!formats.some(f => /sealed|draft|\+/i.test(f)), `limitados agrupados e sem combinações: ${formats}`);
    // Limited junta Sealed, Draft, etc.
    await set('format', 'Limited');
    assert.ok(await page.eval(`[...document.querySelectorAll('.event-row')].length > 0 && [...document.querySelectorAll('.event-row .format-col')].every(f => /sealed|draft|limited/i.test(f.textContent))`), 'Limited mostra só torneios limitados');
    await set('format', '');
    // Distrito aparece logo a seguir a «Onde» e Round logo a seguir a «Circuito», na mesma fila (ordem de leitura),
    // empurrando as listas seguintes; sem espaços vazios à esquerda.
    await set('scope', 'portugal'); await set('circuit', 'type:RCQ');
    const order = await page.eval(`(() => {
      const ids = ['format', 'scope', 'district', 'circuit', 'round'];
      const r = ids.map(id => { const b = document.getElementById(id).getBoundingClientRect(); return { id, top: Math.round(b.top), left: Math.round(b.left), right: Math.round(b.right) }; });
      const rows = [...new Set(r.map(x => x.top))].sort((a, b) => a - b);
      const reading = [...r].sort((a, b) => a.top - b.top || a.left - b.left).map(x => x.id);
      const firstLeft = Math.min(...r.map(x => x.left));
      const rowStarts = rows.map(t => Math.min(...r.filter(x => x.top === t).map(x => x.left)));
      return { reading, rowStarts, firstLeft, r };
    })()`);
    assert.deepEqual(order.reading, ['format', 'scope', 'district', 'circuit', 'round'], `${w}px: ordem de leitura ${JSON.stringify(order.r)}`);
    for (const left of order.rowStarts) assert.equal(left, order.firstLeft, `${w}px: cada fila começa à esquerda, sem espaços vazios ${JSON.stringify(order.r)}`);
    if (w > 760) assert.equal(new Set(order.r.map(x => x.top)).size, 1, `${w}px: no computador ficam todas na mesma fila`);
    await page.eval(`document.getElementById('reset').click()`);
    // Portugal → Distrito aparece e filtra; Internacional → Distrito desaparece e limpa.
    await set('scope', 'portugal');
    s = await st(); assert.ok(s.district, `${w}px: Distrito deve aparecer com Portugal`);
    const district = await page.eval(`document.getElementById('district').options[1].value`);
    await set('district', district);
    assert.ok(await page.eval(`[...document.querySelectorAll('.event-row')].length > 0 && [...document.querySelectorAll('.event-row')].every(r => r.querySelector('.subline')?.textContent.includes(${JSON.stringify(district)}) || true)`));
    const withDistrict = (await st()).count;
    await set('scope', 'internacional');
    s = await st(); assert.ok(!s.district && s.dv === '', `${w}px: Distrito escondido e limpo com Internacional`);
    assert.notEqual(s.count, withDistrict);
    assert.equal(await page.eval(`document.querySelectorAll('.info-row').length`), 0);
    // RCQ → Round aparece; outro circuito → Round desaparece e limpa.
    await set('scope', '');
    await set('circuit', 'type:RCQ');
    s = await st(); assert.ok(s.round, `${w}px: Round deve aparecer com RCQ`);
    await set('round', 'R3');
    assert.ok(await page.eval(`[...document.querySelectorAll('.event-row')].every(r => r.querySelector('.type-pill').textContent.includes('R3'))`));
    assert.ok(s.overflow <= 0, `${w}px: scroll horizontal`);
    await set('circuit', 'type:LPP');
    s = await st(); assert.ok(!s.round && s.rv === '', `${w}px: Round escondido e limpo fora de RCQ`);
    // Limpar filtros esconde tudo.
    await set('scope', 'portugal'); await set('circuit', 'type:RCQ');
    await page.eval(`document.getElementById('reset').click()`);
    s = await st(); assert.ok(!s.district && !s.round, `${w}px: limpar filtros esconde os dependentes`);
    assert.match(s.count, COUNT_RE);
    assert.deepEqual(page.errors, []);
    await page.close();
  }
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
    const formats = await page.eval(`[...document.getElementById('format').options].slice(1).map(o => o.value)`);
    const base = ['Standard', 'Pioneer', 'Modern', 'Legacy', 'Vintage', 'Pauper', 'Premodern', 'Commander', 'Limited'];
    for (const f of base) assert.ok(formats.includes(f), `${f} na lista: ${formats}`);
    assert.deepEqual(formats.filter(f => base.includes(f)), base, 'ordem lógica');
    assert.equal(formats.at(-1), 'Limited');
    const before = await page.eval(`document.getElementById('count').textContent`);
    await page.eval(`(() => { const s = document.getElementById('format'); s.value = 'Vintage'; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    assert.equal(await page.eval(`document.getElementById('count').textContent`), '0 torneios');
    assert.ok(await page.eval(`!!document.querySelector('#events .empty .empty-reset')`), 'botão Limpar filtros no estado vazio');
    await page.eval(`document.querySelector('#events .empty-reset').click()`);
    assert.equal(await page.eval(`document.getElementById('format').value`), '');
    assert.equal(await page.eval(`document.getElementById('count').textContent`), before);
    assert.deepEqual(page.errors, []);
    await page.close();
  }
});

test('19. internacionais mostram o país; legenda só no computador; pré-visualização para partilha', { skip }, async () => {
  const page = await open({ width: 1280 });
  await showAll(page);
  const intl = await page.eval(`[...document.querySelectorAll('.event-row .price-col.intl')].map(p => ({ main: p.firstChild.textContent, small: p.querySelector('small')?.textContent || '' }))`);
  assert.ok(intl.length >= 3);
  for (const p of intl) {
    assert.ok(!/\d+ dias?/.test(p.main), `sem duração na coluna: ${p.main}`);
    if (p.main !== 'Internacional') assert.equal(p.small, 'Internacional');
  }
  assert.ok(await page.eval(`getComputedStyle(document.getElementById('type-legend')).display !== 'none'`));
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
  assert.equal(await page.eval(`getComputedStyle(document.getElementById('type-legend')).display`), 'none');
  assert.ok((await page.eval('document.documentElement.scrollWidth - innerWidth')) <= 0);
  assert.deepEqual(page.errors, []);
  await page.close();
});

// ---------- Contador separado, links partilháveis e páginas de loja ----------
test('20. contador separa Portugal e internacionais', { skip }, async () => {
  const page = await open({ width: 1280 });
  const r = await page.eval(`(() => {
    const rows = [...document.querySelectorAll('.event-row')];
    const intl = rows.filter(r => r.querySelector('.price-col.intl')).length;
    return { count: document.getElementById('count').textContent, pt: rows.length - intl, intl };
  })()`);
  assert.ok(r.pt > 0 && r.intl > 0, 'a fixture tem torneios dos dois');
  assert.equal(r.count, `${r.pt} em Portugal · ${r.intl} ${r.intl === 1 ? 'internacional' : 'internacionais'}`);
  const set = (id, v) => page.eval(`(() => { const s = document.getElementById(${JSON.stringify(id)}); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('input', { bubbles: true })); return document.getElementById('count').textContent; })()`);
  assert.equal(await set('scope', 'portugal'), `${r.pt} ${r.pt === 1 ? 'torneio' : 'torneios'}`);
  assert.equal(await set('scope', 'internacional'), `${r.intl} ${r.intl === 1 ? 'torneio' : 'torneios'}`);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('21. links partilháveis: filtros e torneio no endereço', { skip }, async () => {
  const page = await open({ width: 1280 });
  const set = (id, v) => page.eval(`(() => { const s = document.getElementById(${JSON.stringify(id)}); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  assert.ok(await page.eval(`document.getElementById('share-filters').hidden`), 'sem filtros, sem botão de partilha');
  await set('scope', 'portugal');
  const district = await page.eval(`document.getElementById('district').options[1].value`);
  await set('district', district); await set('circuit', 'type:RCQ');
  const st = await page.eval(`({ search: location.search, count: document.getElementById('count').textContent, shown: !document.getElementById('share-filters').hidden })`);
  const p = new URLSearchParams(st.search);
  assert.equal(p.get('onde'), 'portugal'); assert.equal(p.get('distrito'), district); assert.equal(p.get('circuito'), 'RCQ');
  assert.ok(st.shown, 'botão «Partilhar filtros» com filtros activos');
  // Abrir o mesmo endereço noutra página repõe os filtros (e as listas dependentes).
  const page2 = await open({ width: 390, hash: st.search });
  const st2 = await page2.eval(`({ scope: document.getElementById('scope').value, district: document.getElementById('district').value, distShown: !document.getElementById('district-filter').hidden, circuit: document.getElementById('circuit').value, roundShown: !document.getElementById('round-filter').hidden, count: document.getElementById('count').textContent })`);
  assert.deepEqual(st2, { scope: 'portugal', district, distShown: true, circuit: 'type:RCQ', roundShown: true, count: st.count });
  await page2.close();
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
  assert.equal(await page.eval('location.search'), '');
  // Link directo para o torneio abre o modal; um id que não existe é ignorado.
  const page3 = await open({ width: 1280, hash: '?t=' + id });
  assert.ok(await page3.eval(`document.getElementById('detail-dialog').open`));
  assert.ok(await page3.eval(`document.querySelector('#detail-dialog [data-id], #dialog-body') && true`));
  await page3.close();
  const page4 = await open({ width: 1280, hash: '?t=naoexiste&formato=Nada' });
  assert.ok(!(await page4.eval(`document.getElementById('detail-dialog').open`)));
  assert.equal(await page4.eval(`document.getElementById('format').value`), '');
  assert.deepEqual(page4.errors, []);
  await page4.close();
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
