// Main-thread wrapper around the tarot core WASM module.
//
// Two separate wasm instances exist by design: this module instantiates one
// synchronously-fetched copy on the main thread purely to read the
// self-describing param spec (tarot_param_spec) and build the UI from it —
// it never runs process(). The AudioWorkletProcessor (tarot-worklet.js)
// instantiates its own copy inside the audio thread and is the only one that
// touches audio. Params cross between them as postMessage calls; there is
// no shared memory.
let wasmBytesCache = null;
async function fetchWasmBytes() {
  if (!wasmBytesCache) wasmBytesCache = await fetch('tarot.wasm').then((r) => r.arrayBuffer());
  return wasmBytesCache;
}

function parseParamSpec(str) {
  const specs = [];
  for (const [i, entry] of str.split(';').entries()) {
    if (!entry) continue;
    const [path, min, max, def, curve] = entry.split('|');
    const slash = path.indexOf('/');
    specs.push({
      index: i,
      group: slash >= 0 ? path.slice(0, slash) : path,
      name: slash >= 0 ? path.slice(slash + 1) : path,
      path,
      min: parseFloat(min),
      max: parseFloat(max),
      def: parseFloat(def),
      curve: parseInt(curve, 10),
    });
  }
  return specs;
}

export class TarotCore {
  constructor() {
    this.node = null;
    this.paramSpecs = [];
    this.onLed = null;
    this.ready = false;
  }

  // GBL_ENGINE is param 0: 0 = STRENGTH, 1 = JUDGEMENT (see capi.cpp runControl()).
  static ENGINE_STRENGTH = 0;
  static ENGINE_JUDGEMENT = 1;

  async attach(audioCtx) {
    const bytes = await fetchWasmBytes();

    // Local copy: metadata only, never processes audio.
    const { instance } = await WebAssembly.instantiate(bytes, {});
    if (instance.exports._initialize) instance.exports._initialize();
    instance.exports.tarot_init(audioCtx.sampleRate);
    const mem = new Uint8Array(instance.exports.memory.buffer);
    const specPtr = instance.exports.tarot_param_spec();
    let s = '', i = specPtr;
    while (mem[i] !== 0) { s += String.fromCharCode(mem[i]); i++; }
    this.paramSpecs = parseParamSpec(s);

    await audioCtx.audioWorklet.addModule('tarot-worklet.js');
    this.node = new AudioWorkletNode(audioCtx, 'tarot-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { wasmBytes: bytes },
    });
    this.node.port.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'ready') this.ready = true;
      else if (msg.type === 'led' && this.onLed) this.onLed(msg.led, msg.sensor, msg.engine);
      else if (msg.type === 'error') console.error('tarot core error:', msg.message);
    };
    // Push defaults once the worklet is up.
    for (const spec of this.paramSpecs) this.setParam(spec.index, spec.def);
    return this.node;
  }

  setParam(index, value) {
    if (!this.node) return;
    this.node.port.postMessage({ type: 'param', index, value });
  }

  setEngine(engine) {
    if (!this.node) return;
    this.node.port.postMessage({ type: 'engine', value: engine });
  }
}
