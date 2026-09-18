/*
 * ZulemaOS Monitor · interfaz web
 *
 * Fuentes de datos:
 *   - En vivo: WebSocket al servidor Python (python -m monitor)
 *   - Demo:    datos simulados de demo.js (para GitHub Pages)
 * Parámetros de URL: ?lang=es|en  ?source=demo|live  ?embed (dentro de ZulemaOS)
 */
(() => {
  'use strict';

  const LOCAL_WS = 'ws://127.0.0.1:8000/ws/metrics';
  const HISTORY = 120;
  const CAT_NAMES = { black: 'Thor', tabby: 'Hela' };

  const T = {
    es: {
      demo: 'Demo', live: 'En vivo', connecting: 'Conectando…',
      connect: 'Conectar a mi PC', backToDemo: 'Volver a la demo',
      demoNote: 'Datos simulados para que puedas probarlo.',
      demoHow: '¿Ver tu propio PC?',
      liveNote: (h) => `Datos reales de ${h}, actualizados cada segundo.`,
      failed: 'No encuentro el monitor en tu PC. Arráncalo con «python -m monitor» y vuelve a intentarlo.',
      lost: 'Se ha perdido la conexión con tu PC: vuelvo a la demo.',
      cpu: 'CPU', memory: 'Memoria', network: 'Red', disks: 'Discos', processes: 'Procesos', system: 'Sistema',
      last: 'últimos 2 min',
      memDetail: (u, t, s) => `<b>${u}</b> usados de ${t} · swap ${s} %`,
      netDetail: (s, r) => `Total desde el arranque: ↑ <b>${s}</b> · ↓ <b>${r}</b>`,
      free: 'libres',
      proc: ['Proceso', 'PID', 'CPU', 'RAM'],
      sys: ['Equipo', 'Sistema', 'Procesador', 'Núcleos', 'RAM', 'Encendido'],
      coresVal: (p, l) => `${p} físicos · ${l} lógicos`,
      uptime: (d, h, m) => `${d} d ${h} h ${m} min`,
      cats: [
        '😴 Thor y Hela duermen la siesta: tu PC está tranquilo.',
        '🐾 Thor y Hela vigilan desde el sofá: carga normal.',
        '🐈 Thor y Hela pasean inquietos: el PC está trabajando.',
        (c) => `🔥 ¡Thor y Hela corren por toda la casa! CPU al ${c} %`,
      ],
      meows: ['¡Miau!', 'Prrr prrr 💜', '¿Comida?', 'Mrrrau'],
      panic: ['¡¡MIAU!!', '¡Zoomies! ⚡', '¡Qué calor! 🔥'],
      footer: 'Hecho por Zulema · Python + FastAPI + psutil',
      code: 'código',
    },
    en: {
      demo: 'Demo', live: 'Live', connecting: 'Connecting…',
      connect: 'Connect to my PC', backToDemo: 'Back to demo',
      demoNote: 'Simulated data so you can try it out.',
      demoHow: 'Monitor your own PC?',
      liveNote: (h) => `Real data from ${h}, updated every second.`,
      failed: 'Could not find the monitor on your PC. Start it with "python -m monitor" and try again.',
      lost: 'Lost connection to your PC: back to the demo.',
      cpu: 'CPU', memory: 'Memory', network: 'Network', disks: 'Disks', processes: 'Processes', system: 'System',
      last: 'last 2 min',
      memDetail: (u, t, s) => `<b>${u}</b> used of ${t} · swap ${s} %`,
      netDetail: (s, r) => `Total since boot: ↑ <b>${s}</b> · ↓ <b>${r}</b>`,
      free: 'free',
      proc: ['Process', 'PID', 'CPU', 'RAM'],
      sys: ['Host', 'OS', 'Processor', 'Cores', 'RAM', 'Uptime'],
      coresVal: (p, l) => `${p} physical · ${l} logical`,
      uptime: (d, h, m) => `${d}d ${h}h ${m}m`,
      cats: [
        '😴 Thor and Hela are napping: your PC is chilling.',
        '🐾 Thor and Hela keep watch from the sofa: normal load.',
        '🐈 Thor and Hela pace around: your PC is working.',
        (c) => `🔥 Thor and Hela are running all over the house! CPU at ${c} %`,
      ],
      meows: ['Meow!', 'Purr purr 💜', 'Food?', 'Mrrrow'],
      panic: ['MEOW!!', 'Zoomies! ⚡', 'So hot! 🔥'],
      footer: 'Made by Zulema · Python + FastAPI + psutil',
      code: 'source code',
    },
  };

  const params = new URLSearchParams(location.search);
  let lang = params.get('lang') === 'en' || (!params.get('lang') && !(navigator.language || 'es').startsWith('es')) ? 'en' : 'es';
  const t = () => T[lang];
  if (params.has('embed')) document.body.classList.add('embed');

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /* ---------- Formatos ---------- */

  const bytes = (n) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n < 10 && i ? 1 : 0)} ${units[i]}`;
  };
  const rate = (n) => `${bytes(n)}/s`;
  const level = (p) => (p < 50 ? 'lvl-ok' : p < 80 ? 'lvl-mid' : 'lvl-high');
  const uptime = (s) => t().uptime(Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60));

  /* ---------- Gráficas en <canvas> ---------- */

  function drawChart(canvas, lines, max) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Rejilla
    const css = getComputedStyle(document.documentElement);
    ctx.strokeStyle = css.getPropertyValue('--grid');
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    for (const f of [0.25, 0.5, 0.75]) { ctx.moveTo(0, Math.round(h * f) + 0.5); ctx.lineTo(w, Math.round(h * f) + 0.5); }
    for (let x = w; x > 0; x -= w / 6) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); }
    ctx.stroke();
    ctx.setLineDash([]);

    const step = w / (HISTORY - 1);
    const pad = 4;
    for (const { values, color } of lines) {
      if (values.length < 2) continue;
      const pts = values.map((v, i) => [w - (values.length - 1 - i) * step, h - pad - (clamp(v / max, 0, 1) * (h - pad * 2))]);
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.lineTo(w, h);
      ctx.lineTo(pts[0][0], h);
      ctx.closePath();
      ctx.fillStyle = `${color}2e`;
      ctx.fill();
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  /* ---------- Estado y pintado ---------- */

  const state = { system: null, history: [], latest: null, mode: 'demo' };
  const colors = () => {
    const css = getComputedStyle(document.documentElement);
    return ['--c-cpu', '--c-mem', '--c-up', '--c-down'].map((v) => css.getPropertyValue(v).trim());
  };

  function paintStatic() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t()[el.dataset.t]; });
    const th = document.querySelectorAll('#procs-head th');
    t().proc.forEach((label, i) => { th[i].textContent = label; });
    $('lang').textContent = lang === 'es' ? 'EN' : 'ES';
    $('foot-text').textContent = t().footer;
    $('foot-code').textContent = t().code;
    paintStatus();
    if (state.system) paintSystem();
    if (state.latest) paintMetrics(state.latest);
    cats.caption();
  }

  function paintStatus() {
    const pill = $('status');
    const note = $('note');
    const btn = $('connect');
    pill.className = `pill ${state.mode}`;
    note.classList.toggle('err', !!state.error);
    btn.disabled = state.mode === 'connecting';
    if (state.mode === 'live') {
      pill.textContent = t().live;
      note.textContent = t().liveNote(state.system ? state.system.hostname : '…');
      btn.textContent = t().backToDemo;
    } else if (state.mode === 'connecting') {
      pill.textContent = t().connecting;
      note.textContent = '';
      btn.textContent = t().connecting;
    } else {
      pill.textContent = t().demo;
      note.innerHTML = state.error
        ? esc(state.error)
        : `${esc(t().demoNote)} <a href="https://github.com/Zulema1904/zulemaos-monitor#readme" target="_blank" rel="noopener">${esc(t().demoHow)}</a>`;
      btn.textContent = t().connect;
    }
  }

  function paintSystem() {
    const s = state.system;
    $('host').textContent = `${s.hostname} · ${s.os}`;
    const rows = [s.hostname, s.os, s.cpu_model, t().coresVal(s.cores_physical, s.cores_logical), bytes(s.ram_total), '–'];
    $('sys').innerHTML = t().sys.map((k, i) => `<dt>${esc(k)}</dt><dd${i === 5 ? ' id="uptime"' : ''}>${esc(rows[i])}</dd>`).join('');
    // Barras de núcleos: se crean una vez
    $('cores').innerHTML = Array.from({ length: s.cores_logical }, (_, i) =>
      `<div class="core"><div class="core-bar"><i></i></div>${i}</div>`).join('');
  }

  function paintMetrics(d) {
    const cpu = d.cpu.total;
    $('cpu-v').textContent = `${cpu.toFixed(0)} %`;
    $('mem-v').textContent = `${d.memory.percent.toFixed(0)} %`;
    $('up-v').textContent = rate(d.network.up);
    $('down-v').textContent = rate(d.network.down);
    $('mem-d').innerHTML = t().memDetail(bytes(d.memory.used), bytes(d.memory.total), d.memory.swap_percent.toFixed(0));
    $('net-d').innerHTML = t().netDetail(bytes(d.network.total_sent), bytes(d.network.total_recv));
    const up = $('uptime');
    if (up) up.textContent = uptime(d.uptime);

    const bars = $('cores').querySelectorAll('.core-bar');
    d.cpu.per_core.forEach((v, i) => {
      if (!bars[i]) return;
      bars[i].className = `core-bar ${level(v)}`;
      bars[i].firstChild.style.height = `calc(${clamp(v, 0, 100)}% - 2px)`;
      bars[i].title = `${v.toFixed(0)} %`;
    });

    $('disks').innerHTML = d.disks.map((k) => `<li>
      <div class="disk-top"><b>${esc(k.mount)}</b><span>${k.percent.toFixed(0)} % · ${bytes(k.total - k.used)} ${esc(t().free)}</span></div>
      <div class="meter ${level(k.percent)}"><i style="width:calc(${k.percent}% - 2px)"></i></div></li>`).join('');

    $('procs').innerHTML = d.processes.map((p) => `<tr>
      <td title="${esc(p.name)}">${esc(p.name)}</td>
      <td class="num">${p.pid}</td>
      <td><div class="cpu-cell"><div class="meter ${level(p.cpu)}"><i style="width:calc(${clamp(p.cpu, 0, 100)}% - 2px)"></i></div><span>${p.cpu.toFixed(1)} %</span></div></td>
      <td class="num">${p.mem.toFixed(1)} %</td></tr>`).join('');

    paintCharts();
  }

  function paintCharts() {
    const h = state.history;
    const [cCpu, cMem, cUp, cDown] = colors();
    drawChart($('cpu-chart'), [{ values: h.map((x) => x.cpu), color: cCpu }], 100);
    drawChart($('mem-chart'), [{ values: h.map((x) => x.mem), color: cMem }], 100);
    const peak = Math.max(64 * 1024, ...h.map((x) => Math.max(x.up, x.down)));
    drawChart($('net-chart'), [
      { values: h.map((x) => x.down), color: cDown },
      { values: h.map((x) => x.up), color: cUp },
    ], peak * 1.15);
  }

  /* ---------- Mensajes de las fuentes ---------- */

  function onMessage(msg) {
    if (msg.type === 'hello') {
      state.system = msg.system;
      state.history = msg.history.slice(-HISTORY);
      paintSystem();
      paintStatus();
      return;
    }
    const d = msg.data;
    state.latest = d;
    state.history.push({ time: d.time, cpu: d.cpu.total, mem: d.memory.percent, up: d.network.up, down: d.network.down });
    if (state.history.length > HISTORY) state.history.splice(0, state.history.length - HISTORY);
    paintMetrics(d);
    cats.load(d.cpu.total);
  }

  let stopSource = () => {};

  function startDemo(error = '') {
    stopSource();
    state.mode = 'demo';
    state.error = error;
    const demo = window.ZDemo.create();
    onMessage(demo.hello(HISTORY));
    onMessage(demo.next());
    const timer = setInterval(() => onMessage(demo.next()), 1000);
    stopSource = () => clearInterval(timer);
    paintStatus();
  }

  function startLive(url, { silent = false } = {}) {
    stopSource();
    state.mode = 'connecting';
    state.error = '';
    paintStatus();
    let opened = false;
    let closedByUs = false;
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => ws.close(), 4000);
    ws.onopen = () => {
      opened = true;
      clearTimeout(timeout);
      state.mode = 'live';
      paintStatus();
    };
    ws.onmessage = (e) => onMessage(JSON.parse(e.data));
    ws.onclose = () => {
      clearTimeout(timeout);
      if (closedByUs) return;
      startDemo(silent && !opened ? '' : opened ? t().lost : t().failed);
    };
    stopSource = () => { closedByUs = true; clearTimeout(timeout); ws.close(); };
  }

  /* ---------- Thor y Hela: reaccionan a la carga de CPU ---------- */

  const cats = (() => {
    const floor = $('floor');
    const S = window.ZSprites;
    const scale = () => (window.innerWidth < 600 ? 2 : 3);
    const recent = [];
    let lvl = 0;
    let lastPanic = 0;

    const list = ['black', 'tabby'].map((kind, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'cat';
      el.dataset.kind = kind;
      el.title = CAT_NAMES[kind];
      el.setAttribute('aria-label', CAT_NAMES[kind]);
      el.innerHTML = '<img alt="" draggable="false"><span class="cat-bubble" hidden></span><span class="cat-zzz" hidden>z Z</span>';
      floor.append(el);
      const c = {
        kind, el, i,
        img: el.querySelector('img'), bubble: el.querySelector('.cat-bubble'), zzz: el.querySelector('.cat-zzz'),
        x: 0, w: 0, dir: i ? -1 : 1, target: 0, mode: 'sleep', until: 0,
        pose: '', frame: 0, frameT: 0, phase: Math.random() * 3000, bubbleT: 0,
      };
      el.addEventListener('click', () => say(c, pick(t().meows)));
      return c;
    });

    function say(c, text) {
      c.bubble.textContent = text;
      c.bubble.hidden = false;
      clearTimeout(c.bubbleT);
      c.bubbleT = setTimeout(() => { c.bubble.hidden = true; }, 1600);
    }

    function setPose(c, pose) {
      if (c.pose === pose) return;
      const s = S.cat(c.kind, pose);
      c.img.src = s.src;
      c.img.width = s.w * scale();
      c.img.height = s.h * scale();
      c.w = s.w * scale();
      c.pose = pose;
    }

    const W = () => floor.clientWidth;
    const margin = () => 30 * scale();
    const randomX = () => rand(margin(), W() - margin());

    function update(c, now, dt) {
      if (W() < margin() * 2) return; // el suelo aún no tiene tamaño (pestaña o ventana oculta)
      const nap = W() / 2 + (c.i ? 1 : -1) * 22 * scale();
      if (!c.placed) { c.x = nap; c.placed = true; }
      let speed = 0;

      if (lvl === 0) {
        // A dormir juntos en el centro
        if (Math.abs(c.x - nap) > 3) { c.mode = 'walk'; c.target = nap; speed = 35; }
        else { c.mode = 'sleep'; c.dir = c.i ? -1 : 1; }
      } else if (lvl === 1) {
        if (c.mode === 'sleep') { c.mode = 'sit'; c.until = now + rand(1500, 4000); }
        if (c.mode === 'sit' && now > c.until) {
          if (Math.random() < 0.4) { c.mode = 'walk'; c.target = randomX(); } else c.until = now + rand(3000, 6000);
        }
        if (c.mode === 'walk') speed = 40;
      } else {
        if (c.mode !== 'walk') { c.mode = 'walk'; c.target = randomX(); }
        speed = lvl === 2 ? 75 : 210;
        if (lvl === 3 && now - lastPanic > 2600) { lastPanic = now; say(pick(list), pick(t().panic)); }
      }

      if (c.mode === 'walk') {
        const d = c.target - c.x;
        if (Math.abs(d) < 3) {
          if (lvl >= 2) c.target = randomX();
          else if (lvl === 1) { c.mode = 'sit'; c.until = now + rand(3000, 7000); }
        } else {
          c.dir = Math.sign(d);
          c.x += c.dir * Math.min(Math.abs(d), speed * (scale() / 3) * dt);
        }
        if (now - c.frameT > (lvl === 3 ? 70 : 160)) { c.frame ^= 1; c.frameT = now; }
        setPose(c, c.frame ? 'walk1' : 'walk2');
      } else if (c.mode === 'sit') {
        setPose(c, (now + c.phase) % 3600 < 160 ? 'blink' : 'sit');
      } else {
        setPose(c, Math.floor((now + c.phase) / 900) % 2 ? 'sleep1' : 'sleep2');
      }

      c.zzz.hidden = c.mode !== 'sleep';
      c.x = clamp(c.x, margin(), W() - margin());
      const flip = c.dir < 0 && c.pose !== 'sit' && c.pose !== 'blink';
      c.el.style.transform = `translateX(${Math.round(c.x - c.w / 2)}px)`;
      c.img.style.transform = flip ? 'scaleX(-1)' : '';
    }

    let last = performance.now();
    function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      list.forEach((c) => update(c, now, dt));
      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
    window.addEventListener('resize', () => list.forEach((c) => { c.pose = ''; }));

    return {
      // Media de las últimas lecturas para que no cambien de humor con cada pico suelto
      load(cpu) {
        recent.push(cpu);
        if (recent.length > 3) recent.shift();
        const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
        lvl = avg < 20 ? 0 : avg < 50 ? 1 : avg < 80 ? 2 : 3;
        this.caption(avg);
      },
      caption(avg = recent.length ? recent[recent.length - 1] : 0) {
        const msg = t().cats[lvl];
        $('cat-status').textContent = typeof msg === 'function' ? msg(Math.round(avg)) : msg;
      },
    };
  })();

  /* ---------- Arranque ---------- */

  $('connect').addEventListener('click', () => {
    if (state.mode === 'live') startDemo();
    else startLive(LOCAL_WS);
  });
  $('lang').addEventListener('click', () => {
    lang = lang === 'es' ? 'en' : 'es';
    paintStatic();
  });
  window.addEventListener('resize', paintCharts);

  paintStatic();

  // Servida por el propio servidor Python → en vivo. En cualquier otro sitio
  // (GitHub Pages, dentro de ZulemaOS…) → demo, y el botón permite conectar.
  const source = params.get('source');
  const servedByBackend = location.protocol === 'http:' && !params.has('embed')
    && ['127.0.0.1', 'localhost'].includes(location.hostname);
  if (source === 'live' || (source !== 'demo' && servedByBackend)) {
    startLive(`ws://${location.host}/ws/metrics`, { silent: true });
  } else {
    startDemo();
  }
})();
