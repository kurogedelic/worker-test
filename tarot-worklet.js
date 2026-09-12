// AudioWorkletProcessor host for the tarot core WASM module.
//
// The wasm module has zero imports (see core/src/capi.cpp), so it can be
// instantiated directly inside the worklet's own realm — no bridging to the
// main thread needed for audio. Parameter writes and LED reads cross the
// port as plain messages instead of AudioParams: there are 127 params and
// they change far less often than per-sample, so a message per edit is
// simpler than 127 k-rate AudioParams.
class TarotProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.ready = false;
    this.engine = 0;
    this.ledCounter = 0;
    this.port.onmessage = (e) => this.onMessage(e.data);
    WebAssembly.instantiate(options.processorOptions.wasmBytes, {}).then(({ instance }) => {
      this.exports = instance.exports;
      if (this.exports._initialize) this.exports._initialize();
      this.exports.tarot_init(sampleRate);
      const memBuf = this.exports.memory.buffer;
      this.params = new Float32Array(memBuf, this.exports.tarot_param_ptr(), this.exports.tarot_param_count());
      this.led = new Float32Array(memBuf, this.exports.tarot_led_ptr(), this.exports.tarot_led_count() * 3);
      this.sensorView = new Float32Array(memBuf, this.exports.tarot_sensor_ptr(), this.exports.tarot_sensor_len());
      this.inBuf = new Float32Array(memBuf, this.exports.tarot_in_ptr(), this.exports.tarot_max_block());
      this.outL = new Float32Array(memBuf, this.exports.tarot_out_l(), this.exports.tarot_max_block());
      this.outR = new Float32Array(memBuf, this.exports.tarot_out_r(), this.exports.tarot_max_block());
      this.ready = true;
      this.port.postMessage({ type: 'ready', paramCount: this.exports.tarot_param_count() });
    }).catch((err) => {
      this.port.postMessage({ type: 'error', message: String(err) });
    });
  }

  onMessage(msg) {
    if (!this.ready) return;
    if (msg.type === 'param') {
      this.params[msg.index] = msg.value;
    } else if (msg.type === 'engine') {
      this.engine = msg.value ? 1 : 0;
      this.params[0] = this.engine; // GBL_ENGINE is param 0
    } else if (msg.type === 'noteOn') {
      this.exports.tarot_note_on(msg.note, msg.vel);
    } else if (msg.type === 'noteOff') {
      this.exports.tarot_note_off(msg.note);
    }
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!this.ready || !out || out.length < 2) return true;
    const n = out[0].length;
    this.inBuf.fill(0, 0, n);
    this.exports.tarot_process(n);
    out[0].set(this.outL.subarray(0, n));
    out[1].set(this.outR.subarray(0, n));

    this.ledCounter += n;
    if (this.ledCounter >= 512) {
      this.ledCounter = 0;
      this.port.postMessage({ type: 'led', led: this.led.slice(), sensor: this.sensorView.slice(), engine: this.engine });
    }
    return true;
  }
}

registerProcessor('tarot-processor', TarotProcessor);
