'use strict';

/* ============================================================
 * 共通データ構造
 * ============================================================ */

/** 優先度付きキュー（二分ヒープ）。同じ優先度は挿入順 */
class MinHeap {
  constructor() { this.a = []; this.order = 0; }
  get size() { return this.a.length; }

  push(node, pri) {
    const a = this.a;
    a.push({ node, pri, ord: this.order++ });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }

  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }

  less(x, y) { return x.pri < y.pri || (x.pri === y.pri && x.ord < y.ord); }
}

function buildPath(prev, goal) {
  const path = [];
  for (let v = goal; v !== -1; v = prev[v]) path.push(v);
  return path.reverse();
}

/* ============================================================
 * グリッド経路探索
 *   g = { size, start, goal, neighbors(i), cost(i), h(i) }
 *   yield { visit?, frontier?: [], pruned?: [] }
 *   return { path: number[] | null }
 * ============================================================ */

function* bestFirst(g, priority) {
  const { size, start, goal } = g;
  const dist = new Float64Array(size).fill(Infinity);
  const prev = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const heap = new MinHeap();
  dist[start] = 0;
  heap.push(start, priority(0, g.h(start)));

  while (heap.size) {
    const cur = heap.pop().node;
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goal) {
      yield { visit: cur };
      return { path: buildPath(prev, goal) };
    }
    const frontier = [];
    for (const n of g.neighbors(cur)) {
      if (closed[n]) continue;
      const nd = dist[cur] + g.cost(n);
      if (nd < dist[n]) {
        dist[n] = nd;
        prev[n] = cur;
        heap.push(n, priority(nd, g.h(n)));
        frontier.push(n);
      }
    }
    yield { visit: cur, frontier };
  }
  return { path: null };
}

const GridAlgorithms = {
  *bfs(g) {
    const { size, start, goal } = g;
    const prev = new Int32Array(size).fill(-2); // -2: 未発見
    prev[start] = -1;
    const queue = [start];
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      if (cur === goal) {
        yield { visit: cur };
        return { path: buildPath(prev, goal) };
      }
      const frontier = [];
      for (const n of g.neighbors(cur)) {
        if (prev[n] !== -2) continue;
        prev[n] = cur;
        queue.push(n);
        frontier.push(n);
      }
      yield { visit: cur, frontier };
    }
    return { path: null };
  },

  *dfs(g) {
    const { size, start, goal } = g;
    const prev = new Int32Array(size).fill(-1);
    const visited = new Uint8Array(size);
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop();
      if (visited[cur]) continue;
      visited[cur] = 1;
      if (cur === goal) {
        yield { visit: cur };
        return { path: buildPath(prev, goal) };
      }
      const frontier = [];
      const ns = g.neighbors(cur);
      // 逆順に積むことで「上→右→下→左」の順に深く進む
      for (let k = ns.length - 1; k >= 0; k--) {
        const n = ns[k];
        if (visited[n]) continue;
        prev[n] = cur; // 後から積んだ方が先に取り出されるので上書きで正しい
        stack.push(n);
        frontier.push(n);
      }
      yield { visit: cur, frontier };
    }
    return { path: null };
  },

  dijkstra(g) { return bestFirst(g, (cost) => cost); },

  // f = g + h。同値の場合は h が小さい方を優先（コストは整数なので最適性は保たれる）
  astar(g) { return bestFirst(g, (cost, h) => cost + h + h * 1e-3); },

  greedy(g) { return bestFirst(g, (cost, h) => h); },

  *beam(g, width) {
    const { size, start, goal } = g;
    const prev = new Int32Array(size).fill(-1);
    const visited = new Uint8Array(size);
    visited[start] = 1;
    let level = [start];
    while (level.length) {
      const candidates = [];
      for (const cur of level) {
        if (cur === goal) {
          yield { visit: cur };
          return { path: buildPath(prev, goal) };
        }
        const frontier = [];
        for (const n of g.neighbors(cur)) {
          if (visited[n]) continue;
          visited[n] = 1;
          prev[n] = cur;
          candidates.push(n);
          frontier.push(n);
        }
        yield { visit: cur, frontier };
      }
      // 次の深さはヒューリスティック上位 width 個だけ残す
      candidates.sort((a, b) => g.h(a) - g.h(b));
      level = candidates.slice(0, width);
      const pruned = candidates.slice(width);
      if (pruned.length) yield { pruned };
    }
    return { path: null };
  },
};

/* ============================================================
 * 配列探索
 * ============================================================ */

const ArrayAlgorithms = {
  *linear(arr, target) {
    for (let i = 0; i < arr.length; i++) {
      const equal = arr[i] === target;
      yield { kind: 'check', i, value: arr[i], equal };
      if (equal) return { found: i };
    }
    return { found: -1 };
  },

  *binary(arr, target) {
    let lo = 0, hi = arr.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = arr[mid];
      const cmp = v === target ? 0 : (v < target ? -1 : 1);
      yield { kind: 'probe', lo, hi, mid, value: v, cmp };
      if (cmp === 0) return { found: mid };
      if (cmp < 0) lo = mid + 1;
      else hi = mid - 1;
    }
    return { found: -1 };
  },
};

/* ============================================================
 * 焼きなまし法（1次元関数の最小化）
 *   greedy = true で山登り法（改善のみ受理）
 * ============================================================ */

function* simulatedAnnealing(f, { x0, T0, alpha, step, min, max, maxIter, greedy }) {
  const clamp = (x) => Math.min(max, Math.max(min, x));
  let x = x0, e = f(x0);
  let best = x, bestE = e;
  let T = T0;
  for (let iter = 1; iter <= maxIter; iter++) {
    const cand = clamp(x + Util.gauss() * step);
    const ce = f(cand);
    const dE = ce - e;
    let prob;
    if (dE <= 0) prob = 1;
    else prob = greedy ? 0 : Math.exp(-dE / T);
    const accepted = prob === 1 || Math.random() < prob;
    const worse = accepted && dE > 0;
    if (accepted) { x = cand; e = ce; }
    if (e < bestE) { best = x; bestE = e; }
    yield { iter, x, e, cand, ce, dE, prob, accepted, worse, T: greedy ? 0 : T, best, bestE };
    if (!greedy) T *= alpha;
  }
  return { best, bestE };
}
