'use strict';

const CELL_EMPTY = 0, CELL_WALL = 1, CELL_WEIGHT = 2;
const VIS_NONE = 0, VIS_FRONTIER = 1, VIS_VISITED = 2, VIS_PATH = 3, VIS_PRUNED = 4;
const WEIGHT_COST = 5;

class GridView {
  constructor(hooks) {
    this.hooks = hooks;
    this.cols = 41;
    this.rows = 23;
    const n = this.cols * this.rows;
    this.cells = new Uint8Array(n);
    this.vis = new Uint8Array(n);
    this.resetEndpoints();
    this.tool = CELL_WALL;
    this.drag = null;
    this.lastEdit = -1;
    this.cell = 0;
    this.algoId = 'astar';

    this.canvas = document.getElementById('grid-canvas');
    this.wrap = this.canvas.parentElement;
    this.beamField = document.getElementById('beam-field');

    this.algorithms = [
      { id: 'bfs', label: '幅優先探索 (BFS)',
        desc: 'キューを使い、スタートから近い順に広がるように探索します。重みを無視した「手数」が最小の経路を保証します。' },
      { id: 'dfs', label: '深さ優先探索 (DFS)',
        desc: 'スタックを使い、行けるところまで進んで行き止まりで引き返します。メモリは少なく済みますが、最短経路は保証されません。' },
      { id: 'dijkstra', label: 'ダイクストラ法',
        desc: 'スタートからの累積コスト g が小さい順に展開します。重み付きのマスがあっても最短（最小コスト）経路を保証します。' },
      { id: 'astar', label: 'A* 探索',
        desc: '累積コスト g ＋ ゴールまでの推定コスト h（マンハッタン距離）が小さい順に展開します。最短経路を保証しつつ、ゴール方向を優先して探索数を減らします。' },
      { id: 'greedy', label: '貪欲最良優先探索',
        desc: '推定コスト h だけを見てゴールに近そうなマスを優先します。非常に速いことが多いですが、最短経路は保証されません。' },
      { id: 'beam', label: 'ビームサーチ',
        desc: '深さごとに、推定コスト h が小さい上位 k 個（ビーム幅）だけを残して展開し、残りは枝刈りします。メモリと計算量を抑えられますが、ゴールを見逃すことがあります（不完全）。' },
    ];

    this.beamWidth = Util.bindRange('beam-width', (v) => v, (v) => {
      this.beamWidth = v;
      this.hooks.invalidate(this);
    });

    this.bindUI();
    this.bindPointer();
    this.clearVisual();
    new ResizeObserver(() => this.resize()).observe(this.wrap);
  }

  idx(r, c) { return r * this.cols + c; }

  resetEndpoints() {
    const mid = Math.floor(this.rows / 2) | 1; // 迷路と整合するよう奇数座標
    this.start = this.idx(mid, 5);
    this.goal = this.idx(mid, this.cols - 6);
  }

  /* ---------- UI ---------- */

  bindUI() {
    const tools = document.getElementById('grid-tools');
    tools.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tool]');
      if (!btn) return;
      this.tool = Number(btn.dataset.tool);
      tools.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
    });
    document.getElementById('grid-maze').addEventListener('click', () => this.generateMaze());
    document.getElementById('grid-random').addEventListener('click', () => this.randomWalls());
    document.getElementById('grid-weights').addEventListener('click', () => this.randomWeights());
    document.getElementById('grid-clear').addEventListener('click', () => {
      this.cells.fill(CELL_EMPTY);
      this.hooks.invalidate(this);
    });
  }

  bindPointer() {
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => {
      const i = this.hit(e);
      if (i < 0) return;
      cv.setPointerCapture(e.pointerId);
      if (i === this.start) this.drag = 'start';
      else if (i === this.goal) this.drag = 'goal';
      else {
        this.drag = 'paint';
        this.paintValue = this.cells[i] === this.tool ? CELL_EMPTY : this.tool;
      }
      this.edit(i);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const i = this.hit(e);
      if (i >= 0 && i !== this.lastEdit) this.edit(i);
    });
    const end = () => { this.drag = null; this.lastEdit = -1; };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
  }

  hit(e) {
    if (!this.cell) return -1;
    const rect = this.canvas.getBoundingClientRect();
    const c = Math.floor((e.clientX - rect.left) / this.cell);
    const r = Math.floor((e.clientY - rect.top) / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return this.idx(r, c);
  }

  edit(i) {
    this.lastEdit = i;
    let changed = false;
    if (this.drag === 'start' || this.drag === 'goal') {
      const other = this.drag === 'start' ? this.goal : this.start;
      if (i !== other && this.cells[i] !== CELL_WALL && i !== this[this.drag]) {
        this[this.drag] = i;
        changed = true;
      }
    } else if (i !== this.start && i !== this.goal && this.cells[i] !== this.paintValue) {
      this.cells[i] = this.paintValue;
      changed = true;
    }
    if (changed) this.hooks.invalidate(this);
  }

  /* ---------- 盤面生成 ---------- */

  generateMaze() {
    const { rows, cols, cells } = this;
    cells.fill(CELL_WALL);
    const stack = [[1, 1]];
    cells[this.idx(1, 1)] = CELL_EMPTY;
    const dirs = [[-2, 0], [2, 0], [0, -2], [0, 2]];
    while (stack.length) {
      const [r, c] = stack[stack.length - 1];
      const options = dirs
        .map(([dr, dc]) => [r + dr, c + dc, r + dr / 2, c + dc / 2])
        .filter(([nr, nc]) => nr > 0 && nc > 0 && nr < rows - 1 && nc < cols - 1
          && cells[this.idx(nr, nc)] === CELL_WALL);
      if (!options.length) { stack.pop(); continue; }
      const [nr, nc, wr, wc] = options[Math.floor(Math.random() * options.length)];
      cells[this.idx(wr, wc)] = CELL_EMPTY;
      cells[this.idx(nr, nc)] = CELL_EMPTY;
      stack.push([nr, nc]);
    }
    // ところどころ壁を壊してループを作り、アルゴリズムごとの違いを出す
    const holes = Math.floor(rows * cols * 0.03);
    for (let k = 0; k < holes; k++) {
      const r = Util.randInt(1, rows - 2), c = Util.randInt(1, cols - 2);
      if ((r + c) % 2 === 1) cells[this.idx(r, c)] = CELL_EMPTY;
    }
    this.resetEndpoints();
    this.hooks.invalidate(this);
  }

  randomWalls() {
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] = Math.random() < 0.28 ? CELL_WALL : CELL_EMPTY;
    }
    this.cells[this.start] = this.cells[this.goal] = CELL_EMPTY;
    this.hooks.invalidate(this);
  }

  randomWeights() {
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] === CELL_WALL || i === this.start || i === this.goal) continue;
      this.cells[i] = Math.random() < 0.25 ? CELL_WEIGHT : CELL_EMPTY;
    }
    this.hooks.invalidate(this);
  }

  /* ---------- 探索 ---------- */

  neighbors(i) {
    const { cols, rows, cells } = this;
    const r = (i / cols) | 0, c = i % cols;
    const out = [];
    if (r > 0) out.push(i - cols);
    if (c < cols - 1) out.push(i + 1);
    if (r < rows - 1) out.push(i + cols);
    if (c > 0) out.push(i - 1);
    return out.filter((n) => cells[n] !== CELL_WALL);
  }

  cost(i) { return this.cells[i] === CELL_WEIGHT ? WEIGHT_COST : 1; }

  onAlgorithmChange(id) {
    this.algoId = id;
    this.beamField.hidden = id !== 'beam';
  }

  createGenerator(id) {
    const gc = this.goal % this.cols, gr = (this.goal / this.cols) | 0;
    const g = {
      size: this.cells.length,
      start: this.start,
      goal: this.goal,
      neighbors: (i) => this.neighbors(i),
      cost: (i) => this.cost(i),
      h: (i) => Math.abs(i % this.cols - gc) + Math.abs(((i / this.cols) | 0) - gr),
    };
    this.state = '探索中';
    return id === 'beam' ? GridAlgorithms.beam(g, this.beamWidth) : GridAlgorithms[id](g);
  }

  applyStep(st) {
    const vis = this.vis;
    if (st.visit !== undefined) {
      vis[st.visit] = VIS_VISITED;
      this.current = st.visit;
      this.visitedCount++;
    }
    if (st.frontier) for (const n of st.frontier) if (vis[n] !== VIS_VISITED) vis[n] = VIS_FRONTIER;
    if (st.pruned) for (const n of st.pruned) vis[n] = VIS_PRUNED;
  }

  finish(res) {
    this.current = -1;
    if (res && res.path) {
      this.path = res.path;
      for (const i of res.path) this.vis[i] = VIS_PATH;
      this.pathCost = res.path.slice(1).reduce((s, i) => s + this.cost(i), 0);
      this.state = 'ゴール到達';
    } else {
      this.state = '経路なし';
    }
  }

  clearVisual() {
    this.vis.fill(VIS_NONE);
    this.current = -1;
    this.visitedCount = 0;
    this.path = null;
    this.pathCost = 0;
    this.state = '待機中';
  }

  stats() {
    return [
      ['状態', this.state],
      ['訪問ノード数', this.visitedCount],
      ['経路長（手数）', this.path ? this.path.length - 1 : '-'],
      ['経路コスト', this.path ? this.pathCost : '-'],
    ];
  }

  /* ---------- 描画 ---------- */

  onShow() { this.resize(); }

  resize() {
    const w = this.wrap.clientWidth;
    if (!w) return;
    this.cell = Math.max(6, Math.floor(w / this.cols));
    this.ctx = Util.fitCanvas(this.canvas, this.cell * this.cols, this.cell * this.rows);
    this.draw();
  }

  draw() {
    if (!this.ctx) return;
    const ctx = this.ctx, s = this.cell;
    const col = Util.colors([
      'grid-line', 'cell-empty', 'cell-wall', 'cell-weight', 'cell-frontier', 'cell-visited',
      'cell-current', 'cell-path', 'cell-pruned', 'cell-start', 'cell-goal',
    ]);
    const fills = {
      [VIS_NONE]: col['cell-empty'],
      [VIS_FRONTIER]: col['cell-frontier'],
      [VIS_VISITED]: col['cell-visited'],
      [VIS_PATH]: col['cell-path'],
      [VIS_PRUNED]: col['cell-pruned'],
    };
    const gap = s >= 10 ? 1 : 0;
    const inner = s - gap;

    ctx.fillStyle = col['grid-line'];
    ctx.fillRect(0, 0, s * this.cols, s * this.rows);

    for (let i = 0; i < this.cells.length; i++) {
      const x = (i % this.cols) * s, y = ((i / this.cols) | 0) * s;
      const cell = this.cells[i];
      if (cell === CELL_WALL) ctx.fillStyle = col['cell-wall'];
      else if (i === this.current) ctx.fillStyle = col['cell-current'];
      else ctx.fillStyle = fills[this.vis[i]];
      ctx.fillRect(x, y, inner, inner);
      if (cell === CELL_WEIGHT) {
        ctx.fillStyle = col['cell-weight'];
        ctx.beginPath();
        ctx.arc(x + inner / 2, y + inner / 2, Math.max(1.5, s * 0.2), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    this.drawMarker(this.start, col['cell-start'], 'S');
    this.drawMarker(this.goal, col['cell-goal'], 'G');
  }

  drawMarker(i, color, label) {
    const ctx = this.ctx, s = this.cell;
    const x = (i % this.cols) * s, y = ((i / this.cols) | 0) * s;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, s - (s >= 10 ? 1 : 0), s - (s >= 10 ? 1 : 0), Math.max(2, s * 0.2));
    ctx.fill();
    if (s >= 12) {
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${Math.floor(s * 0.6)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + s / 2, y + s / 2 + 1);
    }
  }
}
