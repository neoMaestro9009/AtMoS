// ════════════════════════════════════════════════════════════════
// filters.ts — Signal Processing Engine
// Butterworth IIR filters + FFT + BPM/HRV calculation
// ════════════════════════════════════════════════════════════════

export class KalmanFilter {
  private q: number;
  private r: number;
  private x: number;
  private p: number;
  private k: number;

  constructor(q = 0.05, r = 0.5) {
    this.q = q;
    this.r = r;
    this.x = 0;
    this.p = 1;
    this.k = 0;
  }

  filter(measurement: number, rOverride?: number): number {
    if (this.x === 0) this.x = measurement;
    this.p = this.p + this.q;
    const currentR = rOverride !== undefined ? rOverride : this.r;
    this.k = this.p / (this.p + currentR);
    this.x = this.x + this.k * (measurement - this.x);
    this.p = (1 - this.k) * this.p;
    return this.x;
  }

  reset() {
    this.x = 0;
    this.p = 1;
    this.k = 0;
  }
}

export class ButterworthFilter {
  private x: number[] = [0, 0, 0];
  private y: number[] = [0, 0, 0];

  constructor(private b: number[], private a: number[]) {}

  filter(val: number): number {
    this.x[2] = this.x[1]; this.x[1] = this.x[0]; this.x[0] = val;
    this.y[2] = this.y[1]; this.y[1] = this.y[0];
    this.y[0] =
      this.b[0] * this.x[0] + this.b[1] * this.x[1] + this.b[2] * this.x[2]
      - this.a[1] * this.y[1] - this.a[2] * this.y[2];
    return this.y[0];
  }

  reset() { this.x = [0,0,0]; this.y = [0,0,0]; }
}

// 2nd-order Butterworth bandpass 0.7–3.5 Hz @ 30 fps
export class PPGFilter {
  private hp = new ButterworthFilter(
    [0.9565, -1.9131, 0.9565], [1.0, -1.9112, 0.915]  // HP 0.7 Hz
  );
  private lp = new ButterworthFilter(
    [0.1311, 0.2622, 0.1311], [1.0, -0.7478, 0.2722]  // LP 3.5 Hz
  );

  process(val: number): number { return this.lp.filter(this.hp.filter(val)); }
  reset() { this.hp.reset(); this.lp.reset(); }
}

// CHROM-approximation rPPG (de Haan & Jeanne, IEEE TNSRE 2013)
// 3G - 2R cancels specular reflection from lighting changes
export class ARPPGExtractor {
  private filter = new PPGFilter();
  process(r: number, g: number, b: number): number {
    return this.filter.process(3 * g - 2 * r);
  }
  reset() { this.filter.reset(); }
}

// Cooley-Tukey in-place FFT
export function fft(real: number[], imag: number[]) {
  const n = real.length;
  if (n <= 1) return;
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) { j -= m; m >>= 1; }
    j += m;
  }
  for (let size = 2; size <= n; size *= 2) {
    const half = size >> 1;
    const step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let k = 0, t = 0; k < half; k++, t += step) {
        const angle = (-2 * Math.PI * t) / n;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const tr = cos * real[i+half+k] - sin * imag[i+half+k];
        const ti = sin * real[i+half+k] + cos * imag[i+half+k];
        real[i+half+k] = real[i+k] - tr; imag[i+half+k] = imag[i+k] - ti;
        real[i+k] += tr; imag[i+k] += ti;
      }
    }
  }
}

function nextPow2(n: number) { return Math.pow(2, Math.ceil(Math.log2(n))); }

export interface HRVFreqDomain {
  lfPower: number;          // Low frequency power (0.04–0.15 Hz) — sympathetic + parasympathetic
  hfPower: number;          // High frequency power (0.15–0.40 Hz) — pure parasympathetic (vagal)
  lfhfRatio: number;        // LF/HF ratio — autonomic balance (>2 = stress, <1 = relaxation)
  // Reference: Task Force ESC/NASPE, Circulation 1996
  // Note: meaningful only after ≥60s of RR data; returned null until then
}

export interface HRVTimeDomain {
  rmssd: number;          // Root Mean Square of Successive Differences (ms)
  sdnn: number | null;    // Standard Deviation of NN intervals (ms) — needs ≥20 RR
  pnn50: number | null;   // % of successive RR differences > 50ms — needs ≥20 RR
  coherence: number | null; // Heart-Brain Coherence ratio (0–1) — needs ≥30s
}

export interface BPMResult {
  bpm: number;
  hrv: number | null;             // RMSSD in ms — null = not enough data → show "--"
  hrvTime: HRVTimeDomain | null;  // Full time-domain HRV suite — null until ≥20s
  hrvFreq: HRVFreqDomain | null;  // Frequency domain HRV — null until ≥60s
  conf: number;
  sqiQuality: "excellent" | "good" | "poor" | "invalid"; // Signal Quality Index classification
  peaks: number[];
  signal: number[];
  rrIntervals: number[];
  rrTimestamps: number[];
}

export function calculateBPMAndHRV(
  data: number[],
  timestamps: number[],
  fps: number
): BPMResult | null {
  const N = data.length;
  if (N < fps * 4) return null;   // need at least 4s for BPM

  // ── Detrending ──────────────────────────────────────────────
  const winSize = Math.floor(fps * 1.5);
  const detrended = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    const s = Math.max(0, i - (winSize >> 1));
    const e = Math.min(N, i + (winSize >> 1));
    let sum = 0;
    for (let j = s; j < e; j++) sum += data[j];
    detrended[i] = data[i] - sum / (e - s);
  }

  // ── FFT for BPM (frequency domain) ──────────────────────────
  const fftSize = nextPow2(N);
  const real = new Array(fftSize).fill(0);
  const imag = new Array(fftSize).fill(0);
  for (let i = 0; i < N; i++) {
    const hamming = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1));
    real[i] = detrended[i] * hamming;
  }
  fft(real, imag);

  const freqRes = fps / fftSize;
  const minIdx = Math.floor(0.7 / freqRes);
  const maxIdx = Math.ceil(3.5 / freqRes);
  let maxPower = 0, peakIdx = 0;
  for (let i = minIdx; i <= maxIdx; i++) {
    const p = real[i]*real[i] + imag[i]*imag[i];
    if (p > maxPower) { maxPower = p; peakIdx = i; }
  }
  const fftBpm = Math.round((peakIdx * freqRes) * 60);

  // ── Peak detection (time domain) ────────────────────────────
  const mean = detrended.reduce((s, v) => s + v, 0) / N;
  const std  = Math.sqrt(detrended.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / N);

  // Adaptive threshold: relax on noisier signals
  const noiseEst  = Math.abs(detrended[N-1] - detrended[N-2]);
  const snrRaw    = std / (noiseEst + 0.0001);
  const threshMult = snrRaw > 5 ? 0.8 : 0.5;
  const thresh = mean + std * threshMult;

  const peaks: number[] = [];
  const minGap = Math.round(fps * (60 / 210));
  let lastPeak = -minGap;
  for (let i = 2; i < N - 2; i++) {
    if (
      detrended[i] > thresh &&
      detrended[i] > detrended[i-1] && detrended[i] > detrended[i-2] &&
      detrended[i] > detrended[i+1] && detrended[i] > detrended[i+2] &&
      i - lastPeak >= minGap
    ) { peaks.push(i); lastPeak = i; }
  }

  // ── RR intervals ────────────────────────────────────────────
  const rawRR: number[] = [];
  const rrTs:  number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    const dt = timestamps[peaks[i]] - timestamps[peaks[i-1]];
    if (dt > 285 && dt < 1500) {
      rawRR.push(dt);
      rrTs.push(timestamps[peaks[i]]);
    }
  }

  // ── Time-domain BPM + HRV ───────────────────────────────────
  let timeBpm = fftBpm;
  let hrv: number | null = null;
  let validRR: number[] = [];

  if (rawRR.length >= 2) {
    // Apply 3-Sigma rule for outlier rejection
    validRR = cleanRRIntervals(rawRR);

    if (validRR.length >= 2) {
      const rrMean = validRR.reduce((s, v) => s + v, 0) / validRR.length;
      timeBpm = Math.round(60000 / rrMean);

      // PATCH v1: require ≥4 RR intervals AND ≥20s window for reliable RMSSD
      // 6s is statistically unreliable — RMSSD jumps 20→80ms in noisy signals.
      // 20s minimum gives ~3+ full respiratory cycles needed for stable estimate.
      // Reference: Task Force ESC/NASPE 1996 recommends ≥60s; 20s is mobile minimum.
      if (validRR.length >= 4 && N >= fps * 20) {
        let ssq = 0;
        for (let i = 1; i < validRR.length; i++)
          ssq += Math.pow(validRR[i] - validRR[i-1], 2);
        hrv = Math.round(Math.sqrt(ssq / (validRR.length - 1)));
      }
    }
  }

  // ── Full HRV Time-Domain Suite ───────────────────────────────
  let hrvTime: HRVTimeDomain | null = null;
  if (validRR.length >= 4 && N >= fps * 20) {
    const rmssdVal = hrv ?? 0;

    // SDNN — needs ≥20 RR intervals for stability
    let sdnn: number | null = null;
    if (validRR.length >= 20) {
      const rrMeanV = validRR.reduce((s, v) => s + v, 0) / validRR.length;
      const rrVar   = validRR.reduce((s, v) => s + Math.pow(v - rrMeanV, 2), 0) / (validRR.length - 1);
      sdnn = Math.round(Math.sqrt(rrVar));
    }

    // pNN50 — % successive differences > 50ms
    let pnn50: number | null = null;
    if (validRR.length >= 20) {
      const diffs50 = validRR.slice(1).map((v, i) => Math.abs(v - validRR[i]));
      const nn50    = diffs50.filter(d => d > 50).length;
      pnn50 = Math.round((nn50 / diffs50.length) * 1000) / 10; // one decimal
    }

    // Heart-Brain Coherence — ratio of LF peak power to total LF band power
    // Needs ≥30s of RR data; uses existing LF FFT from the frequency domain block below
    let coherence: number | null = null;
    if (validRR.length >= 30 && rrTs.length >= 30) {
      const fsRR2  = 4;
      const t0c    = rrTs[0];
      const totalC = rrTs[rrTs.length - 1] - t0c;
      const nC     = Math.floor((totalC / 1000) * fsRR2);
      if (nC >= 32) {
        const cumTc: number[] = [0];
        for (let i = 1; i < rrTs.length; i++) cumTc.push((rrTs[i] - t0c) / 1000);
        const resC: number[] = [];
        for (let n = 0; n < nC; n++) {
          const t = n / fsRR2;
          let j = 0;
          while (j < cumTc.length - 1 && cumTc[j + 1] < t) j++;
          if (j >= cumTc.length - 1) { resC.push(validRR[validRR.length - 1]); }
          else {
            const fr = (t - cumTc[j]) / ((cumTc[j + 1] - cumTc[j]) || 0.001);
            resC.push(validRR[Math.min(j, validRR.length - 1)] + fr * (validRR[Math.min(j + 1, validRR.length - 1)] - validRR[Math.min(j, validRR.length - 1)]));
          }
        }
        const meanC = resC.reduce((s, v) => s + v, 0) / resC.length;
        const deC   = resC.map(v => v - meanC);
        const fszC  = nextPow2(deC.length);
        const rC    = new Array(fszC).fill(0);
        const iC    = new Array(fszC).fill(0);
        for (let i = 0; i < deC.length; i++) {
          const h = 0.5 * (1 - Math.cos(2 * Math.PI * i / (deC.length - 1)));
          rC[i] = deC[i] * h;
        }
        fft(rC, iC);
        const frC   = fsRR2 / fszC;
        const lfMin = Math.floor(0.04 / frC);
        const lfMax = Math.ceil(0.15 / frC);
        let peakP = 0, totP = 0;
        for (let i = lfMin; i <= Math.min(lfMax, fszC / 2); i++) {
          const p = rC[i] * rC[i] + iC[i] * iC[i];
          totP += p;
          if (p > peakP) peakP = p;
        }
        coherence = totP > 0 ? Math.round((peakP / totP) * 100) / 100 : null;
      }
    }

    hrvTime = { rmssd: rmssdVal, sdnn, pnn50, coherence };
  }

  const finalBpm = (maxPower > 0.05 && fftBpm >= 40 && fftBpm <= 210)
    ? fftBpm : timeBpm;

  // ── Confidence ──────────────────────────────────────────────
  const snr = std / (noiseEst + 0.0001);
  let regularityScore = 20;
  if (validRR.length >= 3) {
    const rrM = validRR.reduce((s, v) => s + v, 0) / validRR.length;
    const rrS = Math.sqrt(validRR.reduce((s, v) => s + Math.pow(v - rrM, 2), 0) / validRR.length);
    regularityScore = Math.max(0, 100 - (rrS / rrM) * 200);
  }

  const conf = Math.min(100, Math.max(0, Math.round(
    (Math.min(snr, 15) / 15) * 40 +
    (Math.min(peaks.length, 12) / 12) * 30 +
    (regularityScore / 100) * 30
  )));

  // ── HRV Frequency Domain (LF/HF) ─────────────────────────
  // Requires ≥60s of RR data for statistically reliable spectral estimates.
  // Resamples RR intervals to 4 Hz, applies FFT, computes LF and HF power.
  // Reference: Task Force ESC/NASPE, Circulation 1996
  let hrvFreq: HRVFreqDomain | null = null;

  if (validRR.length >= 20 && timestamps[timestamps.length - 1] - timestamps[0] >= 60000) {
    const rrForFreq = validRR;
    const tsForFreq = rrTs.slice(0, validRR.length);

    if (tsForFreq.length >= 2) {
      // Resample to 4 Hz via linear interpolation
      const fsRR = 4;
      const t0 = tsForFreq[0];
      const totalMs = tsForFreq[tsForFreq.length - 1] - t0;
      const nSamples = Math.floor((totalMs / 1000) * fsRR);

      if (nSamples >= 64) {
        // Build cumulative time axis in seconds
        const cumT: number[] = [0];
        for (let i = 1; i < tsForFreq.length; i++) {
          cumT.push((tsForFreq[i] - t0) / 1000);
        }

        const resampled: number[] = [];
        for (let n = 0; n < nSamples; n++) {
          const t = n / fsRR;
          let j = 0;
          while (j < cumT.length - 1 && cumT[j + 1] < t) j++;
          if (j >= cumT.length - 1) {
            resampled.push(rrForFreq[rrForFreq.length - 1]);
          } else {
            const frac = (t - cumT[j]) / ((cumT[j + 1] - cumT[j]) || 0.001);
            resampled.push(rrForFreq[j] + frac * (rrForFreq[j + 1] - rrForFreq[j]));
          }
        }

        // Detrend
        const rrMeanR = resampled.reduce((s, v) => s + v, 0) / resampled.length;
        const deR = resampled.map(v => v - rrMeanR);

        // FFT with Hann window
        const fftSz = nextPow2(deR.length);
        const realF = new Array(fftSz).fill(0);
        const imagF = new Array(fftSz).fill(0);
        for (let i = 0; i < deR.length; i++) {
          const hann = 0.5 * (1 - Math.cos(2 * Math.PI * i / (deR.length - 1)));
          realF[i] = deR[i] * hann;
        }
        fft(realF, imagF);

        const freqResF = fsRR / fftSz;
        const lfMin = Math.floor(0.04 / freqResF);
        const lfMax = Math.ceil(0.15 / freqResF);
        const hfMax = Math.ceil(0.40 / freqResF);

        let lfP = 0, hfP = 0;
        for (let i = lfMin; i <= Math.min(hfMax, fftSz / 2); i++) {
          const p = realF[i] * realF[i] + imagF[i] * imagF[i];
          if (i <= lfMax) lfP += p;
          else hfP += p;
        }

        const lfhf = hfP > 0 ? Math.round((lfP / hfP) * 100) / 100 : 0;
        hrvFreq = {
          lfPower: Math.round(lfP),
          hfPower: Math.round(hfP),
          lfhfRatio: lfhf
        };
      }
    }
  }

  // ── SQI Quality Classification ──────────────────────────────
  const snrQuick = calculateSignalSNR(data, fps);
  let sqiQuality: BPMResult["sqiQuality"] = "invalid";
  if (snrQuick.powerRatio >= 0.55 && snrQuick.perfusion >= 0.6 && conf >= 70) sqiQuality = "excellent";
  else if (snrQuick.powerRatio >= 0.35 && snrQuick.perfusion >= 0.4 && conf >= 45) sqiQuality = "good";
  else if (snrQuick.powerRatio >= 0.18 && conf >= 25) sqiQuality = "poor";

  return { bpm: finalBpm, hrv, hrvTime, hrvFreq, conf, sqiQuality, peaks, signal: detrended, rrIntervals: rawRR, rrTimestamps: rrTs };
}

// ════════════════════════════════════════════════════════════════
// PATCH v4: Three additions from Gemini review — using our O(N log N)
// FFT, NOT Gemini's O(N²) simpleFFT which takes 20x longer on mobile.
// ════════════════════════════════════════════════════════════════

// ── 1. SNR (Signal Quality) using existing FFT ───────────────────
// Measures how dominant the heartbeat frequency peak is vs. total noise.
// powerRatio = peakPower / totalPower → 0 = pure noise, 1 = clean signal.
// Reference: Orphanidou et al. 2015, IEEE JBHI
export function calculateSignalSNR(signal: number[], fps: number): {
  powerRatio: number;  // 0–1: fraction of spectral power at heartbeat frequency
  perfusion: number;   // AC/DC: proxy for blood perfusion in the ROI
} {
  if (signal.length < fps * 2) return { powerRatio: 0, perfusion: 0 };

  const N = signal.length;
  const mean = signal.reduce((s, v) => s + v, 0) / N;

  // Detrend + Hann window
  const fftSize = nextPow2(N);
  const realF = new Array(fftSize).fill(0);
  const imagF = new Array(fftSize).fill(0);
  for (let i = 0; i < N; i++) {
    const hann = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
    realF[i] = (signal[i] - mean) * hann;
  }
  fft(realF, imagF); // O(N log N) — our existing Cooley-Tukey

  const freqRes = fps / fftSize;
  const minBin = Math.floor(0.7 / freqRes);  // 42 BPM
  const maxBin = Math.ceil(3.5 / freqRes);   // 210 BPM

  let peakPower = 0, totalPower = 0;
  for (let i = 1; i < fftSize / 2; i++) {
    const p = realF[i] * realF[i] + imagF[i] * imagF[i];
    totalPower += p;
    if (i >= minBin && i <= maxBin && p > peakPower) peakPower = p;
  }

  const powerRatio = totalPower > 0 ? peakPower / totalPower : 0;

  // AC/DC perfusion index (de Haan 2013): AC = peak-to-peak amplitude, DC = mean
  const sorted = [...signal].sort((a, b) => a - b);
  const p90 = sorted[Math.floor(N * 0.9)];
  const p10 = sorted[Math.floor(N * 0.1)];
  const ac = p90 - p10;
  const dc = Math.abs(mean) || 1;
  const perfusion = Math.min(1, ac / dc);

  // Full quality classification
  let quality: "excellent" | "good" | "poor" | "invalid" = "invalid";
  if (powerRatio >= 0.55 && perfusion >= 0.6) quality = "excellent";
  else if (powerRatio >= 0.35 && perfusion >= 0.4) quality = "good";
  else if (powerRatio >= 0.18) quality = "poor";

  return {
    powerRatio: Math.max(0, Math.min(1, powerRatio)),
    perfusion: Math.max(0, perfusion),
    quality,
  };
}

// ── 2. Light Level Score from RGB buffers ───────────────────────
// ITU-R BT.709 luminance formula — standard for digital video/camera.
// Returns 0–100 score: optimal range is luminance 80–200 for rPPG.
// Reference: ITU-R BT.709 (2015)
export function calculateLightScore(rMean: number, gMean: number, bMean: number): {
  luminance: number;   // 0–255 relative luminance
  lightScore: number;  // 0–100 quality score for rPPG measurement
  hint: string;        // Arabic user hint
} {
  // BT.709 coefficients (more accurate than BT.601 for modern phone sensors)
  const lum = 0.2126 * rMean + 0.7152 * gMean + 0.0722 * bMean;

  let score: number;
  let hint: string;

  if (lum < 8)         { score = 0;                                        hint = 'ظلام تام — لا يمكن القياس، أضئ المكان'; }
  else if (lum < 30)   { score = (lum / 30) * 35;                        hint = 'إضاءة ضعيفة جداً — اقترب من مصدر ضوء قوي'; }
  else if (lum < 55)   { score = 35 + ((lum - 30) / 25) * 25;            hint = 'إضاءة ضعيفة — يُفضل إضاءة أفضل للدقة'; }
  else if (lum < 80)   { score = 60 + ((lum - 55) / 25) * 15;            hint = 'إضاءة مقبولة — يمكن تحسينها قليلاً'; }
  else if (lum <= 180) { score = 75 + ((lum - 80) / 100) * 25;            hint = 'إضاءة مثالية للقياس'; }
  else if (lum <= 220) { score = Math.max(65, 100 - (lum - 180) / 0.8);  hint = 'إضاءة ساطعة — مقبول لكن يُفضل تخفيفها'; }
  else if (lum <= 245) { score = Math.max(40, 100 - (lum - 220) / 0.5);  hint = 'إضاءة ساطعة جداً — خفف المصدر الضوئي'; }
  else                  { score = Math.max(10, 100 - (lum - 245) / 0.3); hint = 'وهج شديد — يؤثر على دقة القياس بشكل كبير'; }

  return {
    luminance: Math.round(lum),
    lightScore: Math.round(Math.max(0, Math.min(100, score))),
    hint
  };
}

// ── 3. RR Interval Cleaning (3-sigma outlier rejection) ──────────
// Upgrade from our 40% threshold to statistically rigorous 3σ rejection.
// Reference: Malik et al. Task Force 1996 (artifact rejection protocol)
export function cleanRRIntervals(rrIntervals: number[]): number[] {
  if (rrIntervals.length < 3) return rrIntervals;

  const mean = rrIntervals.reduce((s, v) => s + v, 0) / rrIntervals.length;
  const std  = Math.sqrt(rrIntervals.reduce((s, v) => s + (v - mean) ** 2, 0) / rrIntervals.length);

  // 3-sigma rule: reject anything further than 3 std deviations from mean
  const cleaned = rrIntervals.filter(rr =>
    Math.abs(rr - mean) <= 3 * std && rr >= 285 && rr <= 1500
  );

  // Safety: if cleaning removed too much, return original
  return cleaned.length >= 3 ? cleaned : rrIntervals;
}
