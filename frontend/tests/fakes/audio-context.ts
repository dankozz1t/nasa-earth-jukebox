// Minimal Web Audio stand-in. Install per test file with installFakeAudioContext().

class FakeParam {
  value = 0;
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  setTargetAtTime() {}
  cancelScheduledValues() {}
}

class FakeNode {
  connect<T>(target: T): T {
    return target;
  }
  disconnect() {}
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  start() {}
  stop() {}
}

class FakePanner extends FakeNode {
  pan = new FakeParam();
}

export class FakeAnalyser extends FakeNode {
  fftSize = 2048;
  smoothingTimeConstant = 0.8;
  get frequencyBinCount() {
    return this.fftSize / 2;
  }
  getByteFrequencyData(out: Uint8Array) {
    out.fill(128);
  }
}

export class FakeAudioContext {
  static created = 0;
  currentTime = 0;
  destination = new FakeNode();
  constructor() {
    FakeAudioContext.created++;
  }
  createGain() {
    return new FakeGain();
  }
  createBufferSource() {
    return new FakeSource();
  }
  createStereoPanner() {
    return new FakePanner();
  }
  createAnalyser() {
    return new FakeAnalyser();
  }
  async decodeAudioData() {
    return { duration: 10 } as unknown as AudioBuffer;
  }
  async resume() {}
}

export function installFakeAudioContext(): void {
  FakeAudioContext.created = 0;
  (globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
}
