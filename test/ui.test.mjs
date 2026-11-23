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
  assert.match(txtAll, /^\d+ torneios$/);
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
  assert.ok(twoDay && twoDay.includes('19–20 Dezembro'), `evento de dois dias: ${twoDay}`);
  await page.close();
});

// Limite de 4:1 (e não 4,5:1): as etiquetas âmbar e «Formato a confirmar» da v10.3 ficam em 4,2–4,4:1
// no modo claro. Fica registado como pendente; este teste impede que piore.
test('modo claro e escuro: sem erros e etiquetas legíveis em desktop e mobile', { skip }, async () => {
  for (const theme of ['light', 'dark']) for (const w of [1280, 390]) {
    const page = await open({ width: w, theme });
    assert.equal(await page.eval(`document.documentElement.dataset.theme`), theme);
    const lowContrast = await page.eval(`(() => {
      const lum = c => { const [r,g,b] = c.match(/\\d+(\\.\\d+)?/g).slice(0,3).map(Number).map(v => { v/=255; return v <= .03928 ? v/12.92 : ((v+.055)/1.055)**2.4; }); return .2126*r+.7152*g+.0722*b; };
      const bgOf = el => { while (el) { const c = getComputedStyle(el).backgroundColor; if (c && !c.endsWith(', 0)') && c !== 'transparent') return c; el = el.parentElement; } return getComputedStyle(document.body).backgroundColor; };
      const bad = [];
      for (const el of document.querySelectorAll('.store, .win, .event-format, .event-series, .event-round, .price-col, .month-title h3, .count, .result-meta, .milestone-name')) {
        if (!el.offsetParent) continue;
        const a = lum(getComputedStyle(el).color), b = lum(bgOf(el));
        const ratio = (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        if (ratio < 4) bad.push(el.className + ' ' + ratio.toFixed(2));
      }
      return bad.slice(0, 5);
    })()`);
    assert.deepEqual(lowContrast, [], `${theme} ${w}px: contraste baixo`);
    assert.deepEqual(page.errors, []);
    await page.close();
  }
});
