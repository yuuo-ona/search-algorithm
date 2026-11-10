'use strict';

const Util = {
  /** canvas を CSS ピクセルサイズ w×h に合わせ、高DPI対応した 2D コンテキストを返す */
  fitCanvas(canvas, w, h) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  },

  /** CSS 変数 (--name) の値をまとめて取得 */
  colors(names) {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    for (const n of names) out[n] = cs.getPropertyValue(`--${n}`).trim();
    return out;
  },

  /** range input と対応する <output id="{id}-out"> を連動させる */
  bindRange(id, format, onInput) {
    const el = document.getElementById(id);
    const out = document.getElementById(`${id}-out`);
    const update = () => { if (out) out.textContent = format(Number(el.value)); };
    el.addEventListener('input', () => { update(); onInput(Number(el.value)); });
    update();
    return Number(el.value);
  },

  rand(a, b) { return a + Math.random() * (b - a); },
  randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); },

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  /** 標準正規分布の乱数 (Box-Muller) */
  gauss() {
    let u = 0;
    while (u === 0) u = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
  },
};
