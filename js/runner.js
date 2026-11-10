'use strict';

/** 速度 (1〜10) ごとの [待機ms, 1ティックあたりのステップ数] */
const SPEEDS = [
  null,
  [400, 1], [250, 1], [150, 1], [80, 1], [40, 1],
  [16, 1], [16, 2], [16, 5], [16, 12], [16, 30],
];

/**
 * generator 関数で書かれたアルゴリズムを1ステップずつ進めるアニメーション制御。
 * generator は yield でステップ情報を、return で最終結果を返す。
 */
class Runner {
  constructor({ onStep, onDone, onTick }) {
    this.onStep = onStep;
    this.onDone = onDone;
    this.onTick = onTick;
    this.gen = null;
    this.playing = false;
    this.timer = null;
    this.speed = 6;
  }

  get loaded() { return this.gen !== null; }

  load(gen) {
    this.stop();
    this.gen = gen;
  }

  play() {
    if (!this.gen) return;
    this.playing = true;
    this.loop();
  }

  pause() {
    this.playing = false;
    clearTimeout(this.timer);
  }

  stop() {
    this.pause();
    this.gen = null;
  }

  step() {
    if (!this.gen) return;
    this.advance();
    this.onTick();
  }

  /** 1ステップ進める。終了したら false */
  advance() {
    const r = this.gen.next();
    if (r.done) {
      this.gen = null;
      this.playing = false;
      this.onDone(r.value);
      return false;
    }
    this.onStep(r.value);
    return true;
  }

  loop() {
    if (!this.playing) return;
    const [delay, batch] = SPEEDS[this.speed];
    for (let i = 0; i < batch; i++) {
      if (!this.advance()) break;
    }
    this.onTick();
    if (this.playing) this.timer = setTimeout(() => this.loop(), delay);
  }
}
