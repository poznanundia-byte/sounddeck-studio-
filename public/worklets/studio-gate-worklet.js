// Low-latency AudioWorkletProcessor for sample-accurate Noise Gate + Soft-Knee Peak Clipper
class StudioGateWorkletProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'gateEnabled',
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      },
      {
        name: 'thresholdDb',
        defaultValue: -42,
        minValue: -80,
        maxValue: -6,
        automationRate: 'k-rate',
      },
      {
        name: 'attackMs',
        defaultValue: 6,
        minValue: 1,
        maxValue: 80,
        automationRate: 'k-rate',
      },
      {
        name: 'releaseMs',
        defaultValue: 120,
        minValue: 20,
        maxValue: 600,
        automationRate: 'k-rate',
      },
      {
        name: 'softClipEnabled',
        defaultValue: 1,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      },
    ];
  }

  constructor() {
    super();
    this.env = 0;
    this.gateGain = 1;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !output || input.length === 0) return true;

    const gateEnabled = parameters.gateEnabled[0] >= 0.5;
    const thresholdLinear = Math.pow(10, parameters.thresholdDb[0] / 20);
    const attackSec = Math.max(0.001, parameters.attackMs[0] / 1000);
    const releaseSec = Math.max(0.02, parameters.releaseMs[0] / 1000);
    const softClip = parameters.softClipEnabled[0] >= 0.5;

    const attCoeff = Math.exp(-1 / (sampleRate * attackSec));
    const relCoeff = Math.exp(-1 / (sampleRate * releaseSec));

    const numChannels = Math.min(input.length, output.length);
    const blockSize = input[0].length;

    for (let i = 0; i < blockSize; i++) {
      let peak = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        const s = Math.abs(input[ch][i] || 0);
        if (s > peak) peak = s;
      }

      if (peak > this.env) {
        this.env = attCoeff * this.env + (1 - attCoeff) * peak;
      } else {
        this.env = relCoeff * this.env + (1 - relCoeff) * peak;
      }

      let targetGain = 1;
      if (gateEnabled) {
        if (this.env < thresholdLinear * 0.45) {
          targetGain = 0.02;
        } else if (this.env < thresholdLinear) {
          const norm = (this.env - thresholdLinear * 0.45) / (thresholdLinear * 0.55);
          targetGain = 0.02 + 0.98 * Math.max(0, Math.min(1, norm));
        }
      }

      const gCoeff = targetGain > this.gateGain ? attCoeff : relCoeff;
      this.gateGain = gCoeff * this.gateGain + (1 - gCoeff) * targetGain;

      for (let ch = 0; ch < numChannels; ch++) {
        let sample = (input[ch][i] || 0) * this.gateGain;
        if (softClip) {
          if (sample > 0.92) {
            sample = 0.92 + 0.08 * Math.tanh((sample - 0.92) * 5);
          } else if (sample < -0.92) {
            sample = -0.92 + 0.08 * Math.tanh((sample + 0.92) * 5);
          }
        }
        output[ch][i] = sample;
      }
    }

    return true;
  }
}

registerProcessor('studio-gate-processor', StudioGateWorkletProcessor);
