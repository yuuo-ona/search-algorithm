'use strict';

const SA_T_MIN = 0.01;
const SA_TRAIL = 50;

class AnnealView {
  constructor(hooks) {
    this.hooks = hooks;
    this.algoId = 'anneal';
    this.canvas = document.getElementById('sa-canvas');
    this.chartCanvas = document.getElementById('sa-chart');
    this.wrap = this.canvas.parentElement;

    this.algorithms = [
      { id: 'anneal', label: '焼きなまし法',
        desc: '現在の解の近くからランダムに候補を選び、改善なら必ず、悪化でも確率 exp(−ΔE / T) で移動します。温度 T が高い序盤は大胆に動いて局所解から抜け出し、冷却とともに改善する移動だけに落ち着きます。' },
      { id: 'hill', label: '山登り法（比較用）',
        desc: '改善する候補だけを受理する局所探索です。同じ反復回数で焼きなまし法と比べると、最初に入った谷（局所解）から抜け出せない様子がわかります。' },
    ];

    this.T0 = Util.bindRange('sa-t0', (v) => v, (v) => { this.T0 = v; this.hooks.invalidate(this); });
    this.alpha = Util.bindRange('sa-alpha', (v) => v.toFixed(3), (v) => { this.alpha = v; this.hooks.invalidate(this); });
    this.step = Util.bindRange('sa-step', (v) => v, (v) => { this.step = v; this.hooks.invalidate(this); });

    document.getElementById('sa-new').addEventListener('click', () => {
      this.randomizeLandscape();
      this.hooks.invalidate(this);
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.main) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = this.toX(e.clientX - rect.left);
      this.x0 = Math.min(100, Math.max(0, x));
      this.hooks.invalidate(this);
    });

    this.randomizeLandscape();
    this.clearVisual();
    new ResizeObserver(() => this.resize()).observe(this.wrap);
  }

  /* ---------- 目的関数 ---------- */

  randomizeLandscape() {
    const terms = [];
    for (let k = 0; k < 5; k++) {
      terms.push({ a: Util.rand(2, 8), w: Util.rand(0.08, 0.7), p: Util.rand(0, Math.PI * 2) });
    }
    const cx = Util.rand(15, 85), q = Util.rand(0.002, 0.006);
    const raw = (x) => terms.reduce((s, t) => s + t.a * Math.sin(t.w * x + t.p), q * (x - cx) ** 2);
    let mn = Infinity, mx = -Infinity, gx = 0;
    for (let i = 0; i <= 2000; i++) {
      const x = i / 20, v = raw(x);
      if (v < mn) { mn = v; gx = x; }
      if (v > mx) mx = v;
    }
    this.raw = raw;
    this.rawMin = mn;
    this.rawSpan = mx - mn || 1;
    this.globalX = gx;
    this.x0 = Util.rand(5, 95);
  }

  /** 0〜100 に正規化した目的関数 */
  f(x) { return Math.max(0, ((this.raw(x) - this.rawMin) / this.rawSpan) * 100); }

  expectedIters() { return Math.ceil(Math.log(SA_T_MIN / this.T0) / Math.log(this.alpha)); }

  /* ---------- 探索 ---------- */

  onAlgorithmChange(id) { this.algoId = id; }

  createGenerator(id) {
    this.maxIter = this.expectedIters();
    this.state = '探索中';
    return simulatedAnnealing((x) => this.f(x), {
      x0: this.x0, T0: this.T0, alpha: this.alpha, step: this.step,
      min: 0, max: 100, maxIter: this.maxIter, greedy: id === 'hill',
    });
  }

  applyStep(st) {
    this.cur = st;
    this.hist.e.push(st.e);
    this.hist.best.push(st.bestE);
    this.hist.T.push(st.T);
    if (st.accepted) {
      this.trail.push(st.x);
      if (this.trail.length > SA_TRAIL) this.trail.shift();
    }
    if (st.worse) this.worseCount++;
  }

  finish(res) {
    this.state = res.bestE <= 1 ? '大域最適解に到達' : '局所解で終了';
    if (this.cur) this.cur = { ...this.cur, cand: null };
  }

  clearVisual() {
    this.cur = null;
    this.hist = { e: [], best: [], T: [] };
    this.trail = [];
    this.worseCount = 0;
    this.maxIter = this.expectedIters();
    this.state = '待機中';
  }

  stats() {
    const c = this.cur;
    const fmt = (v) => (v === undefined ? '-' : v.toFixed(2));
    return [
      ['状態', this.state],
      ['反復', `${c ? c.iter : 0} / ${this.maxIter}`],
      ['温度 T', this.algoId === 'hill' ? '-' : fmt(c ? c.T : this.T0)],
      ['現在値 f(x)', fmt(c ? c.e : this.f(this.x0))],
      ['最良値（最適 = 0）', fmt(c ? c.bestE : undefined)],
      ['悪化を受理した回数', this.worseCount],
      ['直近の受理確率', c && c.dE > 0 ? c.prob.toFixed(3) : '-'],
    ];
  }

  /* ---------- 描画 ---------- */

  onShow() { this.resize(); }

  resize() {
    const w = this.wrap.clientWidth;
    if (!w) return;
    const h = Math.round(Math.min(360, Math.max(220, w * 0.42)));
    this.main = { ctx: Util.fitCanvas(this.canvas, w, h), w, h, pad: { l: 36, r: 14, t: 18, b: 26 } };
    this.chart = { ctx: Util.fitCanvas(this.chartCanvas, w, 150), w, h: 150, pad: { l: 36, r: 14, t: 26, b: 20 } };
    this.draw();
  }

  toPx(x) { const { pad, w } = this.main; return pad.l + (x / 100) * (w - pad.l - pad.r); }
  toX(px) { const { pad, w } = this.main; return ((px - pad.l) / (w - pad.l - pad.r)) * 100; }
  toPy(e) { const { pad, h } = this.main; return pad.t + (1 - e / 100) * (h - pad.t - pad.b); }

  draw() {
    if (!this.main) return;
    const col = Util.colors(['surface', 'text', 'muted', 'curve', 'accent', 'good', 'warn', 'gold', 'chart-grid', 'cell-goal']);
    this.drawLandscape(col);
    this.drawChart(col);
  }

  drawLandscape(col) {
    const { ctx, w, h, pad } = this.main;
    const bottom = h - pad.b;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = col.surface;
    ctx.fillRect(0, 0, w, h);

    // 軸と目盛り
    ctx.strokeStyle = col['chart-grid'];
    ctx.lineWidth = 1;
    ctx.fillStyle = col.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of [0, 50, 100]) {
      const y = this.toPy(v);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillText(v, pad.l - 6, y);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const v of [0, 25, 50, 75, 100]) ctx.fillText(v, this.toPx(v), bottom + 6);

    // 関数曲線
    const n = Math.max(200, Math.floor(w - pad.l - pad.r));
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * 100;
      const px = this.toPx(x), py = this.toPy(this.f(x));
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = col.curve;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineTo(this.toPx(100), bottom);
    ctx.lineTo(this.toPx(0), bottom);
    ctx.closePath();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = col.curve;
    ctx.fill();
    ctx.globalAlpha = 1;

    // 大域最適の位置
    const gx = this.toPx(this.globalX);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = col.muted;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx, pad.t); ctx.lineTo(gx, bottom); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = col.muted;
    ctx.textBaseline = 'bottom';
    ctx.fillText('大域最適', gx, pad.t + 2);

    const point = (x, r, fill, stroke) => {
      ctx.beginPath();
      ctx.arc(this.toPx(x), this.toPy(this.f(x)), r, 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
    };

    const c = this.cur;
    if (!c) {
      point(this.x0, 6, col.surface, col.accent);
      ctx.fillStyle = col.accent;
      ctx.textBaseline = 'bottom';
      ctx.fillText('開始点', this.toPx(this.x0), this.toPy(this.f(this.x0)) - 9);
      return;
    }

    // 受理された位置の軌跡
    this.trail.forEach((x, k) => {
      ctx.globalAlpha = 0.1 + 0.5 * (k / this.trail.length);
      point(x, 3, col.accent);
    });
    ctx.globalAlpha = 1;

    // 候補への移動
    if (c.cand !== null) {
      const color = !c.accepted ? col.muted : (c.worse ? col.warn : col.good);
      const fromX = c.accepted ? this.prevX(c) : c.x;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash(c.accepted ? [] : [3, 3]);
      ctx.beginPath();
      ctx.moveTo(this.toPx(fromX), this.toPy(this.f(fromX)));
      ctx.lineTo(this.toPx(c.cand), this.toPy(c.ce));
      ctx.stroke();
      ctx.setLineDash([]);
      point(c.cand, 5, null, color);
    }

    // 最良解（ひし形）
    const bx = this.toPx(c.best), by = this.toPy(c.bestE);
    ctx.fillStyle = col.gold;
    ctx.beginPath();
    ctx.moveTo(bx, by - 8); ctx.lineTo(bx + 7, by); ctx.lineTo(bx, by + 8); ctx.lineTo(bx - 7, by);
    ctx.closePath();
    ctx.fill();

    point(c.x, 6, col.accent, col.surface);
  }

  /** 受理された移動の移動元（軌跡の1つ前） */
  prevX(c) {
    const t = this.trail;
    return t.length >= 2 ? t[t.length - 2] : this.x0;
  }

  drawChart(col) {
    const { ctx, w, h, pad } = this.chart;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = col.surface;
    ctx.fillRect(0, 0, w, h);
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    const N = Math.max(1, this.maxIter, this.hist.e.length);
    const X = (i) => pad.l + (i / N) * iw;
    const Y = (v) => pad.t + (1 - v / 100) * ih;

    ctx.strokeStyle = col['chart-grid'];
    ctx.lineWidth = 1;
    ctx.fillStyle = col.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of [0, 50, 100]) {
      ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(w - pad.r, Y(v)); ctx.stroke();
      ctx.fillText(v, pad.l - 6, Y(v));
    }
    ctx.textBaseline = 'top';
    ctx.fillText(`反復 ${N}`, w - pad.r, h - pad.b + 4);

    const line = (arr, color, scale = 1, dash = []) => {
      if (!arr.length) return;
      const stride = Math.max(1, Math.floor(arr.length / iw));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(dash);
      ctx.beginPath();
      for (let i = 0; i < arr.length; i += stride) {
        const px = X(i + 1), py = Y(arr[i] * scale);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      const last = arr.length - 1;
      ctx.lineTo(X(last + 1), Y(arr[last] * scale));
      ctx.stroke();
      ctx.setLineDash([]);
    };
    if (this.algoId !== 'hill') line(this.hist.T, col['cell-goal'], 100 / this.T0, [4, 3]);
    line(this.hist.e, col.accent);
    line(this.hist.best, col.gold);

    // 凡例
    const items = [[col.accent, '現在値 f(x)'], [col.gold, '最良値']];
    if (this.algoId !== 'hill') items.push([col['cell-goal'], '温度 T（T₀ = 100 として表示）']);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let lx = pad.l;
    for (const [c, label] of items) {
      ctx.fillStyle = c;
      ctx.fillRect(lx, 10, 14, 3);
      ctx.fillStyle = col.muted;
      ctx.fillText(label, lx + 18, 12);
      lx += 18 + ctx.measureText(label).width + 16;
    }
  }
}
