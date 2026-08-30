#!/usr/bin/env node
/**
 * driver.mjs — harness para LANÇAR e PILOTAR o app num Chrome headless.
 *
 * Zero dependências: servidor estático com o `http` do Node e o Chrome falado
 * direto por CDP sobre o `WebSocket` nativo do Node (>= 22). Nada de npm
 * install, nada de Playwright.
 *
 *   node .claude/skills/<skill>/driver.mjs smoke          # fluxo end-to-end + asserts
 *   node .claude/skills/<skill>/driver.mjs shot out.png   # 1 screenshot de página inteira
 *   node .claude/skills/<skill>/driver.mjs repl           # 1 comando por linha no stdin
 *
 * O `repl` é o modo principal: pipe um heredoc e leia o `ok`/`err` de cada
 * linha. Comandos:
 *
 *   goto <rota>            navega e espera load + 2 frames
 *   click <sel>            clique real de mouse no centro do elemento
 *   fill <sel> <valor>     seta .value e dispara input+change
 *   press Enter|Tab|Escape
 *   text <sel>             innerText
 *   eval <js>              avalia (await de promise incluído) e imprime JSON
 *   wait <js>              espera a expressão virar truthy (8s)
 *   shot <arq.png>         screenshot do viewport
 *   shotfull <arq.png>     screenshot da página inteira
 *   size <w> <h>           muda o viewport
 *   offline                corta o Firebase (ver SKILL.md); use antes do goto
 *   console / errors       despeja o que o app logou
 *   sleep <ms> / quit
 *
 * Variáveis: APP_DIR (raiz servida), OUT_DIR (destino dos png),
 * CHROME (executável), HEADFUL=1 (abre janela de verdade).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// .claude/skills/<skill>/driver.mjs -> raiz do app.
// path.resolve normaliza as barras: com APP_DIR="D:/x" o path.join gera "D:\x"
// e o guard de path traversal lá embaixo rejeitava tudo com "forbidden".
const APP_DIR = path.resolve(process.env.APP_DIR || path.resolve(HERE, '../../..'));
const OUT_DIR = path.resolve(process.env.OUT_DIR || path.join(APP_DIR, '.claude-shots'));

// ------------------------------------------------------------------ servidor

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.csv': 'text/csv; charset=utf-8',
};

function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}

/** Servidor estático com o mesmo fallback-para-index.html do vercel.json. */
async function startServer() {
  const port = await freePort();
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(APP_DIR, rel);
    if (!file.startsWith(APP_DIR)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        fs.readFile(path.join(APP_DIR, 'index.html'), (e2, b2) => {
          if (e2) {
            res.writeHead(404).end('not found');
            return;
          }
          res.writeHead(200, { 'Content-Type': MIME['.html'] }).end(b2);
        });
        return;
      }
      res
        .writeHead(200, {
          'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        })
        .end(buf);
    });
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${port}` };
}

// -------------------------------------------------------------------- chrome

function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    `${os.homedir()}/AppData/Local/Google/Chrome/Application/chrome.exe`,
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error('Chrome não encontrado. Passe CHROME=<caminho do executável>.');
}

async function waitForJson(port, ms = 20000) {
  const deadline = Date.now() + ms;
  for (;;) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return await r.json();
    } catch {
      /* ainda subindo */
    }
    if (Date.now() > deadline) throw new Error(`Chrome não abriu a porta de debug em ${ms}ms`);
    await new Promise((r) => setTimeout(r, 120));
  }
}

// ---------------------------------------------------------------- cliente CDP

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
        return;
      }
      const hs = this.handlers.get(msg.method);
      if (hs) for (const h of hs) h(msg.params, msg.sessionId);
    });
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', () => rej(new Error('falha ao conectar em ' + url)), {
        once: true,
      });
    });
    return new CDP(ws);
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`timeout em ${method}`));
        }
      }, 30000);
    });
  }
}

// ------------------------------------------------------------------- a página

class Page {
  constructor(cdp, sessionId, base) {
    this.cdp = cdp;
    this.sid = sessionId;
    this.base = base;
    this.logs = [];
    this.errors = [];
  }

  cmd(method, params) {
    return this.cdp.send(method, params, this.sid);
  }

  async setup() {
    await this.cmd('Page.enable');
    await this.cmd('Runtime.enable');
    await this.cmd('Log.enable');
    await this.cmd('Network.enable');
    this.cdp.on('Runtime.consoleAPICalled', (p, sid) => {
      if (sid !== this.sid) return;
      const text = (p.args || [])
        .map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type))
        .join(' ');
      this.logs.push(`[${p.type}] ${text}`);
    });
    this.cdp.on('Log.entryAdded', (p, sid) => {
      if (sid !== this.sid) return;
      this.logs.push(`[${p.entry.level}] ${p.entry.text}`);
    });
    this.cdp.on('Runtime.exceptionThrown', (p, sid) => {
      if (sid !== this.sid) return;
      const d = p.exceptionDetails;
      const t = d.exception?.description || d.text;
      this.logs.push(`[uncaught] ${t}`);
      this.errors.push(t);
    });
  }

  /**
   * Corta o SDK do Firebase (gstatic) e os endpoints de Auth/Firestore, sem
   * tocar em Tailwind, Chart.js e fontes. Só faz sentido no WeightChartS: o
   * `firebaseManager.initialize()` falha, `useFirebase` fica false e o app cai
   * no modo localStorage — o único jeito de mexer no app sem escrever no
   * Firestore de produção. Chame ANTES do goto.
   */
  async blockFirebase() {
    await this.cmd('Network.setBlockedURLs', {
      urls: [
        '*gstatic.com/firebasejs*',
        '*firestore.googleapis.com*',
        '*identitytoolkit.googleapis.com*',
        '*securetoken.googleapis.com*',
      ],
    });
  }

  async viewport(w, h, dsf = 2) {
    await this.cmd('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: dsf,
      mobile: w < 600,
    });
  }

  async goto(route = '/') {
    const url = route.startsWith('http') ? route : this.base + route;
    const loaded = new Promise((res) => {
      this.cdp.on('Page.loadEventFired', (p, sid) => {
        if (sid === this.sid) res();
      });
    });
    await this.cmd('Page.navigate', { url });
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 15000))]);
    await this.settle();
    return url;
  }

  /** Espera microtasks + 2 frames de raf: é o que estabiliza o primeiro paint. */
  async settle(ms = 250) {
    await this.eval(
      `new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, ${ms}))))`,
      true,
    );
  }

  async eval(expression, awaitPromise = true) {
    const r = await this.cmd('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result.value;
  }

  async waitFor(expr, timeout = 8000) {
    const deadline = Date.now() + timeout;
    for (;;) {
      let v = false;
      try {
        v = await this.eval(`!!(${expr})`);
      } catch {
        v = false;
      }
      if (v) return true;
      if (Date.now() > deadline) throw new Error(`timeout esperando: ${expr}`);
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  async box(sel) {
    return this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return null;
      el.scrollIntoView({block:'center', inline:'center'});
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { x:r.x, y:r.y, w:r.width, h:r.height,
               vis: cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.01,
               disabled: !!el.disabled };
    })()`);
  }

  /**
   * Clique real de mouse no centro do elemento. Recusa elemento invisível ou
   * disabled em vez de clicar no vazio — é assim que se descobre que o app
   * desativou o botão de propósito (ex.: a regra de 1 registro por dia).
   */
  async click(sel) {
    const b = await this.box(sel);
    if (!b) throw new Error(`sem elemento: ${sel}`);
    if (!b.vis || b.w === 0 || b.h === 0) throw new Error(`elemento invisivel: ${sel}`);
    if (b.disabled) throw new Error(`elemento disabled: ${sel}`);
    const x = Math.round(b.x + b.w / 2);
    const y = Math.round(b.y + b.h / 2);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.cmd('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: 'left',
        clickCount: 1,
        buttons: type === 'mousePressed' ? 1 : 0,
      });
    }
    await this.settle(120);
    return { x, y };
  }

  /** Seta .value e dispara input+change (é nos dois que os apps escutam). */
  async fill(sel, value) {
    const ok = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return false;
      el.focus();
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event('input', {bubbles:true}));
      el.dispatchEvent(new Event('change', {bubbles:true}));
      return true;
    })()`);
    if (!ok) throw new Error(`sem elemento: ${sel}`);
    await this.settle(80);
  }

  async press(key) {
    const map = {
      Enter: { code: 'Enter', key: 'Enter', vk: 13, text: '\r' },
      Tab: { code: 'Tab', key: 'Tab', vk: 9 },
      Escape: { code: 'Escape', key: 'Escape', vk: 27 },
    };
    const k = map[key];
    if (!k) throw new Error(`tecla não mapeada: ${key}`);
    await this.cmd('Input.dispatchKeyEvent', {
      type: 'keyDown',
      windowsVirtualKeyCode: k.vk,
      code: k.code,
      key: k.key,
      text: k.text,
    });
    await this.cmd('Input.dispatchKeyEvent', {
      type: 'keyUp',
      windowsVirtualKeyCode: k.vk,
      code: k.code,
      key: k.key,
    });
    await this.settle(120);
  }

  async text(sel) {
    return this.eval(
      `(document.querySelector(${JSON.stringify(sel)})?.innerText ?? '<sem elemento>').trim()`,
    );
  }

  /**
   * Mede a largura real do texto de um elemento contra a caixa dele.
   * Existe porque `scrollWidth` NÃO detecta overflow em `background-clip:text`
   * (ele empata com clientWidth); só um Range sobre o conteúdo revela.
   */
  async textFit(sel) {
    return this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return null;
      const r = document.createRange();
      r.selectNodeContents(el);
      const tw = r.getBoundingClientRect().width;
      const bw = el.getBoundingClientRect().width;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      return { textW:+tw.toFixed(1), boxW:+bw.toFixed(1), fontSize:fs,
               folga:+(bw-tw).toFixed(1), ratio:+(tw/fs).toFixed(2) };
    })()`);
  }

  async shot(out, { full = false } = {}) {
    const file = path.isAbsolute(out) ? out : path.join(OUT_DIR, out);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const params = { format: 'png' };
    if (full) {
      const m = await this.cmd('Page.getLayoutMetrics');
      const cs = m.cssContentSize || m.contentSize;
      params.captureBeyondViewport = true;
      params.clip = {
        x: 0,
        y: 0,
        width: Math.ceil(cs.width),
        height: Math.ceil(cs.height),
        scale: 1,
      };
    }
    const r = await this.cmd('Page.captureScreenshot', params);
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  }
}

// ---------------------------------------------------------------- ciclo de vida

async function launch({ width = 420, height = 900, headless = process.env.HEADFUL !== '1' } = {}) {
  const { server, base } = await startServer();
  const port = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'appsfit-chrome-'));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    `--window-size=${width},${height}`,
    'about:blank',
  ];
  if (headless) args.unshift('--headless=new');
  const chrome = spawn(chromePath(), args, { stdio: 'ignore' });

  const info = await waitForJson(port);
  const cdp = await CDP.connect(info.webSocketDebuggerUrl);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

  const page = new Page(cdp, sessionId, base);
  await page.setup();
  await page.viewport(width, height);

  const close = async () => {
    try {
      await cdp.send('Browser.close');
    } catch {
      /* já fechando */
    }
    try {
      chrome.kill();
    } catch {
      /* ok */
    }
    server.close();
  };

  return { page, base, close };
}

// -------------------------------------------------------------------- comandos

const P = (...a) => console.log(...a);

/** Pequeno acumulador de asserts para o `smoke`. */
function checker() {
  const fails = [];
  const warns = [];
  let n = 0;
  return {
    /** Bug conhecido e já documentado: aparece no relatório mas não derruba o exit code. */
    warn(label, cond, detail = '') {
      n++;
      if (!cond) warns.push(`${label} ${detail}`);
      P(`  ${cond ? 'PASS' : 'AVISO '}  ${label}${detail ? ' — ' + detail : ''}`);
      return cond;
    },
    is(label, got, want) {
      n++;
      const ok = JSON.stringify(got) === JSON.stringify(want);
      if (!ok) fails.push(`${label}: esperado ${JSON.stringify(want)}, veio ${JSON.stringify(got)}`);
      P(`  ${ok ? 'PASS' : 'FALHOU'}  ${label} = ${JSON.stringify(got)}`);
      return ok;
    },
    ok(label, cond, detail = '') {
      n++;
      if (!cond) fails.push(`${label} ${detail}`);
      P(`  ${cond ? 'PASS' : 'FALHOU'}  ${label}${detail ? ' — ' + detail : ''}`);
      return cond;
    },
    finish() {
      P('');
      if (warns.length) {
        P(`AVISOS (bugs conhecidos, ver Gotchas no SKILL.md): ${warns.length}`);
        for (const w of warns) P('  - ' + w);
        P('');
      }
      if (fails.length) {
        P(`FALHOU: ${fails.length}/${n} checagens`);
        for (const f of fails) P('  - ' + f);
        process.exitCode = 1;
      } else {
        P(`OK: ${n - warns.length}/${n} checagens passaram${warns.length ? `, ${warns.length} aviso(s)` : ''}`);
      }
    },
  };
}

async function cmdRepl() {
  const { page, base, close } = await launch({});
  P(`ok servindo ${APP_DIR} em ${base}`);
  P(`ok screenshots em ${OUT_DIR}`);
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const sp = line.indexOf(' ');
    const cmd = sp === -1 ? line : line.slice(0, sp);
    const rest = sp === -1 ? '' : line.slice(sp + 1).trim();
    try {
      switch (cmd) {
        case 'goto':
          P('ok goto', await page.goto(rest || '/'));
          break;
        case 'shot':
          P('ok shot', await page.shot(rest || 'shot.png'));
          break;
        case 'shotfull':
          P('ok shotfull', await page.shot(rest || 'full.png', { full: true }));
          break;
        case 'click':
          P('ok click', rest, JSON.stringify(await page.click(rest)));
          break;
        case 'fill': {
          const i = rest.indexOf(' ');
          await page.fill(rest.slice(0, i), rest.slice(i + 1));
          P('ok fill', rest.slice(0, i));
          break;
        }
        case 'press':
          await page.press(rest);
          P('ok press', rest);
          break;
        case 'text':
          P('ok text', JSON.stringify(await page.text(rest)));
          break;
        case 'eval':
          P('ok eval', JSON.stringify(await page.eval(rest)));
          break;
        case 'fit':
          P('ok fit', JSON.stringify(await page.textFit(rest)));
          break;
        case 'wait':
          await page.waitFor(rest);
          P('ok wait', rest);
          break;
        case 'size': {
          const [w, h] = rest.split(/\s+/).map(Number);
          await page.viewport(w, h);
          P('ok size', w, h);
          break;
        }
        case 'offline':
          await page.blockFirebase();
          P('ok offline (firebase cortado — faça o goto depois disto)');
          break;
        case 'console':
          P('ok console ' + page.logs.length + ' linhas');
          for (const l of page.logs) P('  ' + l);
          break;
        case 'errors':
          P('ok errors ' + page.errors.length);
          for (const l of page.errors) P('  ' + l);
          break;
        case 'sleep':
          await new Promise((r) => setTimeout(r, Number(rest) || 500));
          P('ok sleep', rest);
          break;
        case 'quit':
          await close();
          P('ok quit');
          return;
        default:
          P('err comando desconhecido:', cmd);
      }
    } catch (e) {
      P('err', cmd, '-', e.message);
    }
  }
  await close();
  P('ok eof');
}

async function cmdShot() {
  const out = process.argv[3] || 'shot.png';
  const { page, close } = await launch({});
  await page.goto('/');
  P('ok', await page.shot(out, { full: true }));
  await close();
}

// ------------------------------------------------------------------ smoke TMB

async function cmdSmoke() {
  const c = checker();
  const { page, close } = await launch({});
  try {
    P('1. carrega a página');
    await page.goto('/');
    c.is('title', await page.eval('document.title'), 'Calculadora de TMB');
    c.is('tema inicial', await page.eval('document.documentElement.dataset.theme'), 'dark');
    P('   ' + (await page.shot('01-inicial.png')));

    P('2. masculino 82 kg / 178 cm / 41 anos');
    await page.fill('#peso', '82');
    await page.fill('#altura', '178');
    await page.fill('#idade', '41');
    await page.click('#btn-calc');
    await page.waitFor("document.getElementById('result').classList.contains('show')");
    // 10*82 + 6,25*178 - 5*41 + 5 = 1732,5 -> 1733
    c.is('TMB masculino', await page.text('#res-val'), '1.733');
    c.is(
      'níveis de atividade',
      await page.eval("document.querySelectorAll('#act-grid .activity-item').length"),
      5,
    );
    c.is(
      'sedentário (x1,2)',
      await page.eval("document.querySelector('#act-grid .act-val').innerText"),
      '2.079 kcal',
    );

    P('3. feminino 68,5 kg / 165 cm / 34 anos (o −161 do Mifflin)');
    await page.click('#btn-f');
    c.is('aria-pressed feminino', await page.eval("document.getElementById('btn-f').getAttribute('aria-pressed')"), 'true');
    await page.fill('#peso', '68.5');
    await page.fill('#altura', '165');
    await page.fill('#idade', '34');
    await page.press('Enter'); // Enter global recalcula
    await page.waitFor("document.getElementById('res-val').innerText === '1.385'");
    // 685 + 1031,25 - 170 - 161 = 1385,25 -> 1385
    c.is('TMB feminino', await page.text('#res-val'), '1.385');
    P('   ' + (await page.shot('02-resultado.png')));

    P('4. validação: campo vazio');
    await page.fill('#peso', '');
    await page.click('#btn-calc');
    c.is('mensagem de erro', await page.text('#err'), '⚠ Preencha peso, altura e idade.');
    c.is(
      'aria-invalid nos campos',
      await page.eval("document.getElementById('altura').getAttribute('aria-invalid')"),
      'true',
    );

    P('5. validação: fora de faixa (peso 900)');
    await page.fill('#peso', '900');
    await page.click('#btn-calc');
    c.ok(
      'erro de faixa',
      (await page.text('#err')).includes('20–300 kg'),
      await page.text('#err'),
    );

    P('6. vírgula decimal é engolida pelo input[type=number]');
    await page.fill('#peso', '68,5');
    c.is('value após vírgula', await page.eval("document.getElementById('peso').value"), '');

    P('7. tema claro persiste no localStorage');
    await page.fill('#peso', '82');
    await page.click('#btn-calc');
    await page.click('#btn-theme');
    c.is('data-theme', await page.eval('document.documentElement.dataset.theme'), 'light');
    c.is('localStorage', await page.eval("localStorage.getItem('tmb_theme')"), 'light');
    c.is(
      'meta theme-color',
      await page.eval("document.querySelector('meta[name=\\\"theme-color\\\"]').content"),
      '#fafafa',
    );
    P('   ' + (await page.shot('03-tema-claro.png', { full: true })));

    P('8. nenhuma exceção não capturada');
    c.is('erros do console', page.errors, []);
  } finally {
    await close();
  }
  c.finish();
}

const SUB = { smoke: cmdSmoke, repl: cmdRepl, shot: cmdShot };
const sub = process.argv[2];
if (sub && SUB[sub]) {
  SUB[sub]().catch((e) => {
    console.error('FALHOU:', e.stack || e.message);
    process.exit(1);
  });
} else {
  P('uso: node driver.mjs <smoke|repl|shot [saida.png]>');
  process.exit(1);
}
