/*
 * Modo demo: genera lecturas falsas con la misma forma que las del servidor,
 * para poder probar la interfaz sin Python (por ejemplo, en GitHub Pages).
 *
 * Recorre un ciclo de ~45 s: calma → carga normal → trabajo → pico de CPU,
 * así se ven todos los estados de Thor y Hela.
 */
(() => {
  'use strict';

  const GB = 1024 ** 3;
  const CORES = 16;
  const RAM = 32 * GB;

  // Fases del ciclo: [segundos, CPU objetivo]
  const PHASES = [[12, 9], [12, 34], [10, 66], [8, 93]];
  const CYCLE = PHASES.reduce((s, [d]) => s + d, 0);

  const PROCESSES = [
    ['chrome.exe', 0.22, 9.5],
    ['Code.exe', 0.14, 6.2],
    ['python.exe', 0.10, 3.1],
    ['Spotify.exe', 0.05, 2.4],
    ['Discord.exe', 0.05, 2.9],
    ['explorer.exe', 0.03, 1.1],
    ['WindowsTerminal.exe', 0.02, 0.8],
    ['MsMpEng.exe', 0.04, 1.6],
    ['thor_zoomies.exe', 0.01, 0.2],
    ['hela_siesta.exe', 0.0, 0.1],
  ];

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a = 0, b = 100) => Math.min(b, Math.max(a, v));
  const round1 = (v) => Math.round(v * 10) / 10;

  function targetCpu(t) {
    let s = t % CYCLE;
    for (const [dur, cpu] of PHASES) {
      if (s < dur) return cpu;
      s -= dur;
    }
    return PHASES[0][1];
  }

  window.ZDemo = {
    create() {
      const now = () => Date.now() / 1000;
      const bootTime = now() - (3 * 86400 + 5 * 3600 + 17 * 60);
      const pids = PROCESSES.map(() => Math.floor(rand(800, 24000)));
      let t = 0;
      let cpu = 10;
      let mem = 46;
      let sent = 3.2 * GB;
      let recv = 11.7 * GB;
      let burst = 0;

      function next(time = now()) {
        t += 1;
        const target = targetCpu(t);
        cpu = clamp(cpu + (target - cpu) * 0.45 + rand(-4, 4), 2, 99);
        mem = clamp(mem + (40 + cpu * 0.25 - mem) * 0.08 + rand(-0.4, 0.4), 30, 90);

        if (burst <= 0 && Math.random() < 0.08) burst = Math.floor(rand(3, 7));
        const down = burst-- > 0 ? rand(4, 22) * 1024 ** 2 : rand(20, 180) * 1024;
        const up = rand(5, 60) * 1024 + (burst > 0 ? rand(0.2, 1) * 1024 ** 2 : 0);
        sent += up;
        recv += down;

        // Los procesos se reparten la CPU total; en los picos "python.exe" entrena un modelo
        const spike = target > 80;
        const weights = PROCESSES.map(([name, w]) => {
          if (spike && name === 'python.exe') return 0.55;
          if (spike && name === 'thor_zoomies.exe') return 0.08;
          return w;
        });
        const sum = weights.reduce((a, b) => a + b, 0);
        const processes = PROCESSES.map(([name, , memPct], i) => ({
          pid: pids[i],
          name,
          cpu: round1(clamp((cpu * weights[i]) / sum + rand(-0.5, 0.5))),
          mem: round1(memPct + (spike && name === 'python.exe' ? 8 : 0) + rand(-0.2, 0.2)),
        })).sort((a, b) => b.cpu - a.cpu || b.mem - a.mem).slice(0, 8);

        return {
          time,
          cpu: {
            total: round1(cpu),
            per_core: Array.from({ length: CORES }, (_, i) => round1(clamp(cpu + rand(-18, 18) + (i % 4 === 0 ? 8 : 0)))),
          },
          memory: {
            total: RAM,
            used: Math.round((RAM * mem) / 100),
            percent: round1(mem),
            swap_percent: 3.4,
          },
          disks: [
            { mount: 'C:\\', fstype: 'NTFS', total: 476 * GB, used: 220 * GB, percent: 46.2 },
            { mount: 'D:\\', fstype: 'NTFS', total: 931 * GB, used: 288 * GB, percent: 30.9 },
          ],
          network: { up, down, total_sent: sent, total_recv: recv },
          uptime: time - bootTime,
          processes,
        };
      }

      function hello(historyLength = 120) {
        // Historial inventado de los últimos minutos para que las gráficas no empiecen vacías
        const start = now() - historyLength;
        const history = [];
        for (let i = 0; i < historyLength; i++) {
          const s = next(start + i);
          history.push({ time: s.time, cpu: s.cpu.total, mem: s.memory.percent, up: s.network.up, down: s.network.down });
        }
        return {
          type: 'hello',
          interval: 1,
          history,
          system: {
            hostname: 'ZULEMA-PC',
            os: 'ZulemaOS 1.0 (demo)',
            os_version: '1.0',
            cpu_model: 'Intel(R) Core(TM) i7 · datos simulados',
            cores_physical: 8,
            cores_logical: CORES,
            ram_total: RAM,
            boot_time: bootTime,
          },
        };
      }

      return { hello, next: () => ({ type: 'metrics', data: next() }) };
    },
  };
})();
