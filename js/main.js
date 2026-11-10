'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const runBtn = $('run'), stepBtn = $('step'), resetBtn = $('reset');
  const algoSel = $('algo'), speedEl = $('speed');
  const statsEl = $('stats'), nameEl = $('algo-name'), descEl = $('algo-desc');

  let current = null;

  const runner = new Runner({
    onStep: (st) => current.applyStep(st),
    onDone: (res) => current.finish(res),
    onTick: () => refresh(),
  });

  /** 盤面やパラメータが変わったときに各ビューから呼ばれる */
  const hooks = {
    invalidate(view) {
      if (view === current) runner.stop();
      view.clearVisual();
      view.draw();
      if (view === current) { renderStats(); updateUI(); }
    },
  };

  const views = {
    grid: new GridView(hooks),
    array: new ArrayView(hooks),
    anneal: new AnnealView(hooks),
  };

  function renderStats() {
    statsEl.innerHTML = current.stats()
      .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
      .join('');
  }

  function updateUI() {
    runBtn.textContent = runner.playing ? '一時停止' : (runner.loaded ? '再開' : '実行');
  }

  function refresh() {
    current.draw();
    renderStats();
    updateUI();
  }

  function showInfo() {
    const algo = current.algorithms.find((a) => a.id === algoSel.value);
    nameEl.textContent = algo.label;
    descEl.textContent = algo.desc;
  }

  function reset() {
    runner.stop();
    current.clearVisual();
    refresh();
  }

  function activate(name) {
    runner.stop();
    document.querySelectorAll('.tab').forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on);
    });
    for (const [key, view] of Object.entries(views)) $(`view-${key}`).hidden = key !== name;

    current = views[name];
    algoSel.innerHTML = current.algorithms
      .map((a) => `<option value="${a.id}">${a.label}</option>`)
      .join('');
    algoSel.value = current.algoId;
    current.onAlgorithmChange(current.algoId);
    showInfo();
    current.clearVisual();
    current.onShow();
    refresh();
  }

  function ensureLoaded() {
    if (runner.loaded) return;
    current.clearVisual();
    runner.load(current.createGenerator(algoSel.value));
  }

  function togglePlay() {
    if (runner.playing) runner.pause();
    else { ensureLoaded(); runner.play(); }
    updateUI();
  }

  function stepOnce() {
    runner.pause();
    ensureLoaded();
    runner.step();
  }

  runBtn.addEventListener('click', togglePlay);
  stepBtn.addEventListener('click', stepOnce);
  resetBtn.addEventListener('click', reset);

  algoSel.addEventListener('change', () => {
    current.onAlgorithmChange(algoSel.value);
    showInfo();
    reset();
  });

  runner.speed = Number(speedEl.value);
  speedEl.addEventListener('input', () => { runner.speed = Number(speedEl.value); });

  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => activate(t.dataset.tab));
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea, button')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); stepOnce(); }
    else if (e.key === 'r' || e.key === 'R') reset();
  });

  window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => current.draw());

  activate('grid');
})();
