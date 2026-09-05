// audio-worklet.js — тап аудиопотока для Vosk.
// Даунмикс в моно + накопление ~4096 сэмплов, чтобы не слать
// сообщение каждые 128 сэмплов (2,7 мс).

class BleepTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(4096);
    this.pos = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (input && input.length) {
      const ch0 = input[0];
      const n = ch0.length;
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let c = 0; c < input.length; c++) s += input[c][i];
        this.buf[this.pos++] = s / input.length;

        if (this.pos === this.buf.length) {
          const out = this.buf.slice();
          this.port.postMessage(out.buffer, [out.buffer]);
          this.pos = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('bleep-tap', BleepTap);
