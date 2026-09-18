/*
 * Sprites pixel-art dibujados con texto: cada carácter es un píxel y la paleta
 * decide su color ('.' = transparente). Se pintan en un <canvas> diminuto y se
 * escalan con image-rendering: pixelated.
 */
(() => {
  'use strict';

  /* ---------- Utilidades de rejilla ---------- */

  const mirror = (half) => half.map((row) => row + [...row].reverse().join(''));

  const toGrid = (rows) => {
    const w = Math.max(...rows.map((r) => r.length));
    return rows.map((r) => [...r.padEnd(w, '.')]);
  };

  const blank = (w, h) => Array.from({ length: h }, () => Array(w).fill('.'));

  // Copia los píxeles no transparentes de `rows` sobre `grid` en (x, y)
  const stamp = (grid, rows, x, y) => {
    rows.forEach((row, dy) => {
      [...row].forEach((c, dx) => {
        if (c !== '.' && grid[y + dy] && x + dx < grid[0].length) grid[y + dy][x + dx] = c;
      });
    });
    return grid;
  };

  const set = (grid, cells) => {
    cells.forEach(([x, y, c]) => { if (grid[y]) grid[y][x] = c; });
    return grid;
  };

  const render = (grid, palette) => {
    const canvas = document.createElement('canvas');
    canvas.width = grid[0].length;
    canvas.height = grid.length;
    const ctx = canvas.getContext('2d');
    grid.forEach((row, y) => row.forEach((c, x) => {
      if (c === '.' || !palette[c]) return;
      ctx.fillStyle = palette[c];
      ctx.fillRect(x, y, 1, 1);
    }));
    return { src: canvas.toDataURL(), w: canvas.width, h: canvas.height };
  };

  /* ---------- Avatar de Zulema (32×32) ---------- */

  const AVATAR_PALETTE = {
    O: '#2b1622', // contorno
    H: '#b4532a', // pelo cobrizo
    h: '#e0843f', // brillo del pelo
    d: '#7c3219', // sombra del pelo / cejas
    S: '#f4cdb0', // piel
    s: '#dea585', // sombra de piel
    F: '#cf8a62', // pecas
    E: '#6f9a3a', // ojos avellana
    o: '#1f2a12', // pupila
    w: '#ffffff', // brillo del ojo
    b: '#f4a3a8', // rubor
    M: '#a2495a', // boca
    V: '#5a2e8a', // eyeliner lila
    G: '#5b4638', // montura de las gafas
    g: '#b89478', // parte inferior de la montura, más clara
    L: '#d4787c', // labios
    T: '#6e3b22', // top marrón
    t: '#4d2715',
    N: '#d9dbe8', // colgante plateado
  };

  // Estilo chibi: cabeza grande, ojos enormes tras gafas redondas, cuerpo pequeñito
  const AVATAR_HALF = [
    '.......OO.OOOOOO',
    '.....OOhHOhHHhHH',
    '....OhHHdHHHdHHh',
    '...OHHdHhHHhHHdH',
    '..OhHHHHdHHHHhHH',
    '..OHdHhHHHdHHHHd',
    '.OhHHHHdHhHHdHHH',
    '.OHHdHhHHHHHHhHH',
    'OhHHHHHdHHdHHHHd',
    'OHHdHHhHSHHSHHdH',
    'OHhHHdHSSSHSSSHS',
    'OHHHdHSSGGGGGSSS',
    'OHhHHHSGVVVVGSSS',
    'OHHdHHSGSwEEGggg',
    'OHhHHHSGSEoEGSSS',
    'OHHdHHSGSEoEGSSS',
    'OHhHHHSGSEEwGSSS',
    'OHHdHHSSgggggSSs',
    'OHhHHHSbbbSFSSSS',
    'OHHdHHSSFSSSSSMS',
    'OHhHHHdSSSSSSSSM',
    'OHHdHHHdSSSSSSSS',
    '.OhHHdHHOSSSSSSS',
    '.OHHdHhHHOOOOsss',
    '.OhHHdHHHOTTTSSS',
    '..OHHhHHOTTTTNSS',
    '..OHdHHOTTTTTTNS',
    '..OhHHOTTTTTTTTN',
    '...OHOTTtTTTTTTT',
    '....OTTTtTTTTTTT',
    '....OTTTtTTTTTTT',
    '....OOOOOOOOOOOO',
  ];

  // Detalles asimétricos: un rizo sobre la frente y algo de variedad en el pelo
  const AVATAR_CURLS = [
    [16, 10, 'h'], [16, 11, 'H'],
    [27, 4, 'd'], [29, 9, 'h'], [3, 12, 'd'],
  ];
  // Ojos cerrados: se limpia el ojo y queda una línea
  const AVATAR_BLINK = [9, 10, 11, 20, 21, 22].flatMap((x) => [
    [x, 13, 'S'], [x, 14, 'S'], [x, 15, 'V'], [x, 16, 'S'],
  ]);

  const avatarGrid = (blink) => {
    const g = set(toGrid(mirror(AVATAR_HALF)), AVATAR_CURLS);
    return blink ? set(g, AVATAR_BLINK) : g;
  };

  /* ---------- Gatos ---------- */

  const CAT_PALETTES = {
    black: {
      O: '#07060c', B: '#1d1a2a', D: '#34304a', W: '#1d1a2a',
      E: '#e3d64a', o: '#07060c', P: '#4a3444',
    },
    tabby: {
      O: '#2a1a12', B: '#8d6649', D: '#3f2a1c', W: '#f6f2ea',
      E: '#b9a84a', o: '#1a120c', P: '#f0a0aa',
    },
  };

  // Cabeza de frente (se refleja: 12×10)
  const HEAD = mirror([
    'O.....',
    'OO....',
    'OPO...',
    'OPBOOO',
    'OBDBDW',
    'OBEEBW',
    'OBEoBW',
    'OBBBWP',
    '.OBWOW',
    '..OOOO',
  ]);
  const HEAD_CLOSED = mirror([
    'O.....',
    'OO....',
    'OPO...',
    'OPBOOO',
    'OBDBDW',
    'OBBBBW',
    'OBOOBW',
    'OBBBWP',
    '.OBWOW',
    '..OOOO',
  ]);

  // Sentado de frente
  const SIT_BODY = mirror([
    '...OBBWW',
    '..OBBBWW',
    '.OBBDBWW',
    '.OBDBBWW',
    'OBBBDBWW',
    'OBBDBBWW',
    'OBBBBOWO',
    'OBBBOWWO',
    '.OOOOOOO',
  ]);
  const SIT_TAIL = [
    [17, 12, 'O'],
    [16, 13, 'O'], [17, 13, 'D'], [18, 13, 'O'],
    [16, 14, 'O'], [17, 14, 'D'], [18, 14, 'O'],
    [16, 15, 'O'], [17, 15, 'B'], [18, 15, 'O'],
    [16, 16, 'D'], [17, 16, 'B'], [18, 16, 'O'],
    [16, 17, 'B'], [17, 17, 'O'],
    [16, 18, 'O'],
  ];

  const sitGrid = (blink) => {
    const g = blank(19, 19);
    stamp(g, SIT_BODY, 0, 10);
    stamp(g, blink ? HEAD_CLOSED : HEAD, 2, 0);
    return set(g, SIT_TAIL);
  };

  // Caminando de lado (mira a la derecha)
  const WALK_BODY = [
    'OO',
    'ODO',
    'OBO',
    '.ODO',
    '.OBO',
    '..ODO',
    '..OBOOOOOOOOOO',
    '..OBBBDBBDBBDBB',
    '..OBBDBBDBBDBBBB',
    '..OBBBBBBBBBBBBB',
    '..OBBBBBBBBBBBWWWO',
    '...OBWWWBBBBBWWWWO',
    '....OOOOOOOOOOOOO',
  ];

  // Posición x de cada pata en las filas 12-15 (la fila 16 es la suela)
  const LEGS = {
    a: [[4, 3, 2, 2, 'B'], [7, 8, 8, 8, 'B'], [13, 12, 12, 12, 'W'], [15, 16, 17, 17, 'W']],
    b: [[4, 4, 4, 4, 'B'], [7, 7, 7, 7, 'B'], [13, 13, 13, 13, 'W'], [16, 16, 16, 16, 'W']],
  };

  const drawLeg = (g, [x0, x1, x2, x3, fur]) => {
    [x0, x1, x2, x3].forEach((x, i) => {
      const y = 12 + i;
      const f = i === 3 ? 'W' : fur;
      g[y][x] = 'O'; g[y][x + 1] = f; g[y][x + 2] = f; g[y][x + 3] = 'O';
    });
    for (let dx = 0; dx < 4; dx++) g[16][x3 + dx] = 'O';
  };

  const walkGrid = (frame) => {
    const g = blank(24, 17);
    stamp(g, WALK_BODY, 0, 0);
    LEGS[frame].forEach((leg) => drawLeg(g, leg));
    return stamp(g, HEAD, 12, 0);
  };

  // Durmiendo hecho una bola
  const SLEEP_BODY = [
    '', '', '',
    '....OOOOOOOO',
    '..OOBBDBBDBBB',
    '.OBBDBBDBBDBB',
    'OBBBBBBBBBBBB',
    'OBBDBBBBBBBBB',
    'OBBBBBBBWWWWW',
    'ODDBBBBWWWWWW',
    'OBDBDBDBDBDBO',
    '.OOOOOOOOOOOOOOOOOOOOO',
  ];
  const SLEEP_BODY_2 = SLEEP_BODY.map((row, i) => {
    if (i === 3) return '';
    if (i === 4) return '..OOOOOOOOOOO';
    return row;
  });

  const sleepGrid = (frame) => {
    const g = blank(22, 12);
    stamp(g, frame === 1 ? SLEEP_BODY : SLEEP_BODY_2, 0, 0);
    return stamp(g, HEAD_CLOSED, 10, 2);
  };

  /* ---------- API ---------- */

  const cache = new Map();
  const memo = (key, fn) => {
    if (!cache.has(key)) cache.set(key, fn());
    return cache.get(key);
  };

  window.ZSprites = {
    avatar: (blink = false) => memo(`avatar-${blink}`, () => render(avatarGrid(blink), AVATAR_PALETTE)),
    cat(kind, pose) {
      return memo(`${kind}-${pose}`, () => {
        const p = CAT_PALETTES[kind];
        switch (pose) {
          case 'walk1': return render(walkGrid('a'), p);
          case 'walk2': return render(walkGrid('b'), p);
          case 'sit': return render(sitGrid(false), p);
          case 'blink': return render(sitGrid(true), p);
          case 'sleep1': return render(sleepGrid(1), p);
          case 'sleep2': return render(sleepGrid(2), p);
          default: throw new Error(`Pose desconocida: ${pose}`);
        }
      });
    },
  };
})();
