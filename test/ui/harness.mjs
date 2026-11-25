// Mini-cliente do Chrome DevTools Protocol, sem dependências (usa o WebSocket do Node 22).
// Serve a pasta site/ com dados da fixture inventada e permite testar a interface num Chrome real
// (headless), em larguras de telemóvel e de computador.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIcs } from '../../scripts/lib/ics.mjs';
import { buildEvents, toPublic } from '../../scripts/build-data.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SITE = join(ROOT, 'site');

export function findChrome() {
  const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return candidates.find(p => p && existsSync(p)) || null;
}

/** events.json gerado a partir da fixture inventada (nunca dados reais). */
export async function fixtureEventsJson() {
  const config = JSON.parse(await readFile(join(ROOT, 'config/site.json'), 'utf8'));
  const { events: raw } = parseIcs(await readFile(join(ROOT, 'test/fixtures/exemplo.ics'), 'utf8'));
  const { events } = buildEvents(raw, config.milestones);
  return JSON.stringify({ generatedAt: '2026-11-23T12:00:00.000Z', timeZone: 'Europe/Lisbon', count: events.length, milestones: config.milestones, events: events.map(toPublic) });
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

export async function startServer() {
  const eventsJson = await fixtureEventsJson();
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/data/events.json') { res.writeHead(200, { 'content-type': TYPES['.json'] }); return res.end(eventsJson); }
    const file = join(SITE, path.endsWith('/') ? path + 'index.html' : path);
    if (!file.startsWith(SITE)) { res.writeHead(403); return res.end(); }
    try { const body = await readFile(file); res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(body); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(r => server.close(r)) };
}

// Data fixa (23/11/2026, 12:00 UTC), para os testes não dependerem do dia em que correm.
const FIXED_NOW = Date.parse('2026-11-23T12:00:00Z');
const dateShim = `(() => { const F=${FIXED_NOW}; const R=Date; class D extends R { constructor(...a){ super(...(a.length?a:[F])); } static now(){ return F; } } window.Date = D; })();`;

export async function launchBrowser() {
  const chrome = findChrome();
  if (!chrome) return null;
  const profile = mkdtempSync(join(tmpdir(), 'torneios-ui-'));
  const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--no-proxy-server', '--disable-gpu', '--hide-scrollbars', '--no-sandbox', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((ok, fail) => {
    let buf = '';
    const t = setTimeout(() => fail(new Error('Chrome não arrancou')), 20000);
    proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); ok(m[1]); } });
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let seq = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { const { ok, fail } = pending.get(msg.id); pending.delete(msg.id); msg.error ? fail(new Error(msg.error.message)) : ok(msg.result); }
    else for (const l of listeners) l(msg);
  };
  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => { const id = ++seq; pending.set(id, { ok, fail }); ws.send(JSON.stringify({ id, method, params, sessionId })); });

  async function newPage({ width = 1280, height = 900, mobile = false, theme = 'light' } = {}) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (m, p) => send(m, p, sessionId);
    const errors = [];
    listeners.push(msg => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map(a => a.value ?? a.description).join(' '));
      // Bloqueios da Content-Security-Policy (25/11) também contam como erro.
      if (msg.method === 'Log.entryAdded' && msg.params.entry.source === 'security') errors.push('CSP: ' + msg.params.entry.text);
    });
    await s('Page.enable'); await s('Runtime.enable'); await s('Log.enable');
    // UI_FORCE_FONT="DejaVu Sans" simula localmente as fontes de outro ambiente (ex.: GitHub Actions).
    const force = process.env.UI_FORCE_FONT ? `document.addEventListener('DOMContentLoaded',()=>{const st=document.createElement('style');st.textContent='body,.brand{font-family:${JSON.stringify(process.env.UI_FORCE_FONT).slice(1, -1)},sans-serif!important}';document.head.appendChild(st)});` : '';
    await s('Page.addScriptToEvaluateOnNewDocument', { source: `${dateShim};${force}try{localStorage.setItem('torneios-portugal-theme','${theme}')}catch(e){}` });
    await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    const page = {
      errors,
      cdp: (m, p) => s(m, p),
      async eval(expr) {
        const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result.value;
      },
      async goto(url) {
        await s('Page.navigate', { url });
        await page.waitFor("document.readyState === 'complete'");
      },
      async waitFor(expr, timeout = 10000) {
        const end = Date.now() + timeout;
        while (Date.now() < end) { if (await page.eval(`!!(${expr})`)) return; await new Promise(r => setTimeout(r, 50)); }
        throw new Error(`Tempo esgotado à espera de: ${expr}`);
      },
      async resize(w, h = height) { await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile }); await new Promise(r => setTimeout(r, 60)); },
      async screenshot(path) { const { data } = await s('Page.captureScreenshot', { format: 'png' }); const { writeFile } = await import('node:fs/promises'); await writeFile(path, Buffer.from(data, 'base64')); },
      close: () => send('Target.closeTarget', { targetId }),
    };
    return page;
  }

  return {
    newPage,
    async close() { try { ws.close(); } catch {} proc.kill('SIGKILL'); await new Promise(r => setTimeout(r, 100)); try { rmSync(profile, { recursive: true, force: true }); } catch {} },
  };
}
