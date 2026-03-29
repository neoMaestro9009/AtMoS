export interface BreathPattern {
  rate: number;           // breaths per minute
  regularity: number;     // 0–100 (100 = perfectly regular)
  depthScore: number;     // 0–100 (relative amplitude, not tidal volume in mL)
  confidence: number;     // 0–80 (mic-based = honest cap)
}

export class SonarEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private rafId: number | null = null;

  // Envelope buffer at RATE Hz
  private envBuf: number[] = [];
  private envTs:  number[] = [];  // timestamps for each sample
  private lastT = 0;
  private readonly RATE = 10;    // Hz — envelope sampling rate

  // Voice stress buffers
  private pitchBuf: number[] = [];
  private ampBuf:   number[] = [];

  // Speech Gate
  private speechFrames: number[] = []; // 1 for speech, 0 for silence/breath

  // Mic Calibration
  public calibGain = 1.0;

  private onBreathUpdate?:      (bp: BreathPattern) => void;
  private onVoiceTensionUpdate?: (score: number) => void;

  constructor(
    onBreathUpdate?:       (bp: BreathPattern) => void,
    onVoiceTensionUpdate?: (score: number) => void
  ) {
    this.onBreathUpdate      = onBreathUpdate;
    this.onVoiceTensionUpdate = onVoiceTensionUpdate;
  }

  async start() {
    if (this.audioCtx) return;

    this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Disable ALL processing — we want raw signal
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation:  false,
        noiseSuppression:  false,
        autoGainControl:   false,
      },
      video: false,
    });

    const src = this.audioCtx.createMediaStreamSource(this.micStream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 2048;
    src.connect(this.analyser);

    // Mic Calibration
    await this.calibrateMic(src);

    this.envBuf = [];
    this.envTs  = [];
    this.pitchBuf = [];
    this.ampBuf   = [];
    this.speechFrames = [];
    this.rafId = requestAnimationFrame(() => this.tick());
  }

  private async calibrateMic(src: MediaStreamAudioSourceNode) {
    if (!this.audioCtx || !this.analyser) return;

    // Measure ambient
    const ambientRms = await this.measureRms(100);

    // Play 440Hz tone at -30dBFS
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.frequency.value = 440;
    gain.gain.value = 0.0316; // -30dBFS
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start();

    // Measure response
    const responseRms = await this.measureRms(200);
    osc.stop();
    osc.disconnect();
    gain.disconnect();

    const TARGET_RESPONSE = 0.05;
    const rawGain = TARGET_RESPONSE / (responseRms - ambientRms + 0.0001);
    this.calibGain = Math.max(0.3, Math.min(5.0, rawGain));

    // Dispatch notification
    window.dispatchEvent(new CustomEvent('omni_notification', {
      detail: `🎙️ Microphone Calibration: gain = ${this.calibGain.toFixed(2)}x`
    }));
  }

  private measureRms(durationMs: number): Promise<number> {
    return new Promise(resolve => {
      if (!this.analyser) return resolve(0);
      const data = new Float32Array(this.analyser.fftSize);
      let sumSq = 0;
      let count = 0;
      
      const start = performance.now();
      const measure = () => {
        if (performance.now() - start > durationMs) {
          resolve(count > 0 ? Math.sqrt(sumSq / count) : 0);
          return;
        }
        this.analyser!.getFloatTimeDomainData(data);
        for (let i = 0; i < data.length; i++) {
          sumSq += data[i] * data[i];
          count++;
        }
        requestAnimationFrame(measure);
      };
      measure();
    });
  }

  private tick() {
    if (!this.analyser || !this.audioCtx) return;

    const now = performance.now();
    if (now - this.lastT < (1000 / this.RATE) * 0.85) {
      this.rafId = requestAnimationFrame(() => this.tick());
      return;
    }
    this.lastT = now;

    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);

    // ── RMS envelope sample ──────────────────────────────────
    let sumSq = 0;
    let zeroCrossings = 0;
    for (let i = 0; i < data.length; i++) {
      sumSq += data[i] * data[i];
      if (i > 0 && data[i] * data[i-1] < 0) zeroCrossings++;
    }
    const rawRms = Math.sqrt(sumSq / data.length);
    const rms = rawRms * this.calibGain;
    this.envBuf.push(rms);
    this.envTs.push(now);

    // Speech Gate using ZCR
    const zcr = zeroCrossings / data.length;
    const isSpeech = rms > 0.01 && zcr > 0.1 ? 1 : 0;
    this.speechFrames.push(isSpeech);

    // Voice stress: only collect when there's speech
    if (this.audioCtx && isSpeech) {
      const pitch = (zeroCrossings / 2) * (this.audioCtx.sampleRate / data.length);
      this.pitchBuf.push(pitch);
      this.ampBuf.push(rms);
    }

    // ── Buffer management ────────────────────────────────────
    // Keep 60s of envelope history
    while (this.envBuf.length > this.RATE * 60) {
      this.envBuf.shift();
      this.envTs.shift();
      this.speechFrames.shift();
    }
    // Keep 5s of voice data
    while (this.pitchBuf.length > this.RATE * 5) {
      this.pitchBuf.shift();
      this.ampBuf.shift();
    }

    // ── Compute when enough data ──────────────────────────────
    // Need 20s minimum: a breath is 3-15s, need ≥3 breaths for rate
    if (this.envBuf.length >= this.RATE * 20) {
      this.computeBreathPattern();
    }

    if (this.pitchBuf.length >= this.RATE * 2) {
      this.computeVoiceTension();
    }

    this.rafId = requestAnimationFrame(() => this.tick());
  }

  // ── BREATH PATTERN ────────────────────────────────────────────
  // Algorithm:
  //   1. Moving-average smooth (window = 2s) — removes high-freq noise
  //   2. Peak detection on smoothed signal with physiological timing constraints
  //   3. Inter-peak intervals → breath rate
  //   4. CV of intervals → regularity
  //   5. Mean peak amplitude → depth score
  private computeBreathPattern() {
    // Speech Gate: if >30% of recent frames are speech, pause breath computation
    const recentSpeech = this.speechFrames.slice(-this.RATE * 10); // last 10s
    const speechRatio = recentSpeech.reduce((a, b) => a + b, 0) / recentSpeech.length;
    if (speechRatio > 0.3) return;

    const raw = [...this.envBuf];
    const N   = raw.length;

    // Step 1: Moving-average smooth with 2s window (= 20 samples at 10Hz)
    const smoothWin = Math.round(this.RATE * 2);
    const smooth: number[] = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      const s = Math.max(0, i - (smoothWin >> 1));
      const e = Math.min(N, i + (smoothWin >> 1));
      let sum = 0;
      for (let j = s; j < e; j++) sum += raw[j];
      smooth[i] = sum / (e - s);
    }

    // Step 2: Noise floor estimate (5th percentile of smoothed signal)
    const sorted = [...smooth].sort((a, b) => a - b);
    const noiseFloor = sorted[Math.floor(N * 0.05)];
    const signalTop  = sorted[Math.floor(N * 0.95)];
    const signalRange = signalTop - noiseFloor;

    // If there's barely any signal above noise, we can't reliably detect breaths
    if (signalRange < 0.003) {
      // Silence or too quiet — no breath detected yet
      return;
    }

    // Dynamic threshold: 25% above noise floor
    const peakThresh = noiseFloor + signalRange * 0.25;

    // Step 3: Peak detection with physiological constraints
    // A breath takes 1.5s–15s (4–40 breaths/min)
    const minGapSamples = Math.round(this.RATE * 1.5);   // 40 br/min max
    const maxGapSamples = Math.round(this.RATE * 15);     // 4 br/min min

    const peakIndices: number[] = [];
    let lastPeak = -minGapSamples;

    for (let i = 1; i < N - 1; i++) {
      if (
        smooth[i] > peakThresh &&
        smooth[i] >= smooth[i-1] &&
        smooth[i] >= smooth[i+1] &&
        i - lastPeak >= minGapSamples
      ) {
        peakIndices.push(i);
        lastPeak = i;
      }
    }

    if (peakIndices.length < 3) return; // Need ≥3 peaks for ≥2 intervals

    // Step 4: Inter-peak intervals
    const intervals: number[] = [];
    for (let i = 1; i < peakIndices.length; i++) {
      const gap = peakIndices[i] - peakIndices[i-1];
      // Only accept physiologically plausible intervals
      if (gap >= minGapSamples && gap <= maxGapSamples) {
        intervals.push(gap / this.RATE); // convert to seconds
      }
    }

    if (intervals.length < 2) return;

    // Breath rate (breaths per minute)
    const meanInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    const breathRate   = Math.round(60 / meanInterval);

    if (breathRate < 4 || breathRate > 40) return;

    // Step 5: Regularity (coefficient of variation — lower CV = more regular)
    const stdInterval = Math.sqrt(
      intervals.reduce((s, v) => s + Math.pow(v - meanInterval, 2), 0) / intervals.length
    );
    const cv = stdInterval / meanInterval;
    // CV < 0.1 = very regular, CV > 0.5 = irregular
    const regularity = Math.round(Math.max(0, Math.min(100, (1 - cv / 0.5) * 100)));

    // Step 6: Depth score (mean peak amplitude above noise, normalized)
    const peakAmplitudes = peakIndices.map(i => smooth[i]);
    const meanPeakAmp    = peakAmplitudes.reduce((s, v) => s + v, 0) / peakAmplitudes.length;
    const depthScore     = Math.round(Math.min(100, ((meanPeakAmp - noiseFloor) / (signalRange + 0.0001)) * 100));

    // Confidence: honest cap at 75% for mic-based breathing
    // Higher confidence when more peaks detected and signal is clean
    const conf = Math.min(75, Math.round(
      (Math.min(peakIndices.length, 8) / 8) * 40 +  // enough peaks
      (regularity / 100) * 20 +                       // regularity of signal
      (signalRange > 0.01 ? 15 : 5)                   // signal above noise
    ));

    this.onBreathUpdate?.({ rate: breathRate, regularity, depthScore, confidence: conf });
  }

  // ── VOICE TENSION ─────────────────────────────────────────────
  // Jitter (pitch perturbation) + Shimmer (amplitude perturbation)
  // These are established clinical voice quality metrics.
  // Reference: Farrús et al. 2007, Titze 1994
  //
  // NOTE: "Voice Tension" not "stress" — jitter/shimmer detect
  // vocal fold irregularity which correlates with tension/effort,
  // NOT psychological deception. Do not use for lie detection.
  private computeVoiceTension() {
    if (this.pitchBuf.length < 10) return;

    // Jitter: mean absolute cycle-to-cycle pitch variation / mean pitch
    let jitterSum = 0;
    for (let i = 1; i < this.pitchBuf.length; i++)
      jitterSum += Math.abs(this.pitchBuf[i] - this.pitchBuf[i-1]);
    const meanPitch = this.pitchBuf.reduce((a, b) => a + b, 0) / this.pitchBuf.length;
    const jitter = meanPitch > 0 ? (jitterSum / (this.pitchBuf.length - 1)) / meanPitch : 0;

    // Shimmer: mean absolute cycle-to-cycle amplitude variation / mean amplitude
    let shimmerSum = 0;
    for (let i = 1; i < this.ampBuf.length; i++)
      shimmerSum += Math.abs(this.ampBuf[i] - this.ampBuf[i-1]);
    const meanAmp   = this.ampBuf.reduce((a, b) => a + b, 0) / this.ampBuf.length;
    const shimmer   = meanAmp > 0 ? (shimmerSum / (this.ampBuf.length - 1)) / meanAmp : 0;

    // Normal jitter < 1% (0.01), pathological > 3% (0.03) — Farrús 2007
    // Normal shimmer < 3% (0.03), pathological > 10% (0.10)
    const jitterScore  = Math.min(100, (jitter  / 0.15) * 100);
    const shimmerScore = Math.min(100, (shimmer / 0.25) * 100);
    const tensionScore = Math.round((jitterScore + shimmerScore) / 2);

    this.onVoiceTensionUpdate?.(tensionScore);
  }

  stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.envBuf = []; this.envTs = [];
    this.pitchBuf = []; this.ampBuf = [];
    if (this.micStream) { this.micStream.getTracks().forEach(t => t.stop()); this.micStream = null; }
    if (this.audioCtx) { this.audioCtx.close(); this.audioCtx = null; }
    this.analyser = null;
  }
}
