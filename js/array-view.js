'use strict';

const MAX_VALUE = 99;

class ArrayView {
  constructor(hooks) {
    this.hooks = hooks;
    this.algoId = 'linear';
    this.barsEl = document.getElementById('bars');
    this.logEl = document.getElementById('arr-log');
    this.targetEl = document.getElementById('arr-target');
    this.sortedEl = document.getElementById('arr-sorted');

    this.algorithms = [
      { id: 'linear', label: '線形探索',
        desc: '先頭から順番に1つずつ目的の値と比較します。ソートされていない配列でも使えますが、最悪 n 回の比較が必要です（O(n)）。' },
      { id: 'binary', label: '二分探索',
        desc: 'ソート済み配列の中央の値と比較し、目的の値がある側の半分だけに範囲を絞り込みます。比較のたびに範囲が半分になるため O(log n) で済みます。' },
    ];

    this.size = Util.bindRange('arr-size', (v) => v, (v) => {
      this.size = v;
      this.generate();
    });
    document.getElementById('arr-new').addEventListener('click', () => this.generate());
    document.getElementById('arr-pick').addEventListener('click', () => {
      this.pickTarget();
      this.hooks.invalidate(this);
    });
    this.targetEl.addEventListener('input', () => this.hooks.invalidate(this));
    this.sortedEl.addEventListener('change', () => {
      if (this.sortedEl.checked) this.values.sort((a, b) => a - b);
      else Util.shuffle(this.values);
      this.renderBars();
      this.hooks.invalidate(this);
    });

    this.generate(false);
  }

  get target() { return Number(this.targetEl.value); }

  generate(notify = true) {
    const pool = Util.shuffle(Array.from({ length: MAX_VALUE }, (_, i) => i + 1));
    this.values = pool.slice(0, this.size);
    if (this.sortedEl.checked) this.values.sort((a, b) => a - b);
    this.pickTarget();
    this.renderBars();
    if (notify) this.hooks.invalidate(this);
    else this.clearVisual();
  }

  pickTarget() {
    this.targetEl.value = this.values[Math.floor(Math.random() * this.values.length)];
  }

  onAlgorithmChange(id) {
    this.algoId = id;
    const needSorted = id === 'binary';
    this.sortedEl.disabled = needSorted;
    if (needSorted && !this.sortedEl.checked) {
      this.sortedEl.checked = true;
      this.values.sort((a, b) => a - b);
      this.renderBars();
    }
  }

  renderBars() {
    this.barsEl.innerHTML = '';
    this.barsEl.classList.toggle('dense', this.values.length > 32);
    this.barsEl.classList.toggle('very-dense', this.values.length > 48);
    this.colEls = this.values.map((v) => {
      const col = document.createElement('div');
      col.className = 'col';
      col.innerHTML = '<div class="bar-area"><div class="bar"></div></div><div class="val"></div><div class="mark"></div>';
      col.querySelector('.bar').style.height = `${(v / MAX_VALUE) * 100}%`;
      col.querySelector('.val').textContent = v;
      this.barsEl.appendChild(col);
      return col;
    });
    this.colEls.forEach((el, i) => { el.title = `a[${i}] = ${this.values[i]}`; });
    this.status = new Array(this.values.length).fill('');
    this.marks = {};
  }

  createGenerator(id) {
    this.state = '探索中';
    return ArrayAlgorithms[id](this.values.slice(), this.target);
  }

  applyStep(st) {
    this.comparisons++;
    const t = this.target;
    if (st.kind === 'check') {
      if (this.current >= 0) this.status[this.current] = 'checked';
      this.status[st.i] = 'current';
      this.current = st.i;
      this.marks = { [st.i]: 'i' };
      this.log = `a[${st.i}] = ${st.value} ${st.equal ? '=' : '≠'} ${t}`
        + (st.equal ? ' → 一致！' : ' → 次の要素へ');
    } else {
      const { lo, hi, mid, value, cmp } = st;
      for (let k = 0; k < this.status.length; k++) {
        this.status[k] = k < lo || k > hi ? 'out' : '';
      }
      this.status[mid] = 'current';
      this.current = mid;
      this.marks = {};
      const addMark = (k, m) => { this.marks[k] = this.marks[k] ? `${this.marks[k]}${m}` : m; };
      addMark(lo, 'L'); addMark(mid, 'M'); addMark(hi, 'H');
      if (cmp === 0) this.log = `範囲 [${lo}, ${hi}] の中央 a[${mid}] = ${value} = ${t} → 一致！`;
      else if (cmp < 0) this.log = `範囲 [${lo}, ${hi}] の中央 a[${mid}] = ${value} < ${t} → 右半分 [${mid + 1}, ${hi}] へ`;
      else this.log = `範囲 [${lo}, ${hi}] の中央 a[${mid}] = ${value} > ${t} → 左半分 [${lo}, ${mid - 1}] へ`;
    }
  }

  finish(res) {
    this.current = -1;
    if (res.found >= 0) {
      this.status = this.status.map((s) => (s === 'current' ? 'checked' : s));
      this.status[res.found] = 'found';
      this.marks = { [res.found]: '✓' };
      this.state = '発見';
      this.log = `a[${res.found}] に ${this.target} を発見しました（比較 ${this.comparisons} 回）`;
    } else {
      this.status = this.status.map(() => (this.algoId === 'binary' ? 'out' : 'checked'));
      this.marks = {};
      this.state = '見つからず';
      this.log = `${this.target} は配列に存在しません（比較 ${this.comparisons} 回）`;
    }
  }

  clearVisual() {
    this.status = new Array(this.values.length).fill('');
    this.marks = {};
    this.current = -1;
    this.comparisons = 0;
    this.state = '待機中';
    this.log = `目的の値 ${this.targetEl.value || '?'} を探します`;
  }

  stats() {
    const n = this.values.length;
    const worst = this.algoId === 'binary' ? Math.ceil(Math.log2(n + 1)) : n;
    return [
      ['状態', this.state],
      ['比較回数', this.comparisons],
      ['要素数 n', n],
      ['最悪比較回数', worst],
    ];
  }

  onShow() { this.draw(); }

  draw() {
    this.colEls.forEach((el, i) => {
      el.className = `col ${this.status[i] || ''}`;
      el.querySelector('.mark').textContent = this.marks[i] || '';
    });
    this.logEl.textContent = this.log;
  }
}
