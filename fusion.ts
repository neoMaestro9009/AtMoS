import { fft } from './filters';

export interface SensorReading {
  value:      number;
  confidence: number; // 0–100
  timestamp:  number;
}

export class BayesianFusion {
  private history: { [key: string]: SensorReading[] } = {};
  private readonly MAX_HISTORY = 10;
  private readonly DECAY_START_MS = 5000;

  // ── RR interval accumulator for coherence calculation ──────
  // Needs 60–120 seconds of data for meaningful coherence
  private rrAccumulator: Array<{ interval: number; timestamp: number }> = [];
  private readonly MAX_RR_HISTORY_MS = 120_000; // 2 minutes

  // Polygraph state
  private baselineHR: number | null = null;
  private baselineHRV: number | null = null;

  addReading(sensorId: string, value: number, confidence: number) {
    if (!this.history[sensorId]) this.history[sensorId] = [];
    this.history[sensorId].push({ value, confidence, timestamp: performance.now() });
    if (this.history[sensorId].length > this.MAX_HISTORY)
      this.history[sensorId].shift();
  }

  // Feed raw RR intervals from vision engine
  addRRIntervals(intervals: number[], timestamps: number[]) {
    for (let i = 0; i < intervals.length; i++) {
      this.rrAccumulator.push({ interval: intervals[i], timestamp: timestamps[i] });
    }
    // Prune old data
    const cutoff = performance.now() - this.MAX_RR_HISTORY_MS;
    this.rrAccumulator = this.rrAccumulator.filter(r => r.timestamp > cutoff);
  }

  getFusedValue(): { value: number; confidence: number } | null {
    let weightedSum = 0, totalWeight = 0, maxConf = 0;
    const now = performance.now();

    for (const sensorId in this.history) {
      const readings = this.history[sensorId];
      if (!readings.length) continue;
      const latest = readings[readings.length - 1];
      const age    = now - latest.timestamp;

      // Time-decay: reading older than 5s loses confidence linearly
      let weight = latest.confidence / 100;
      if (age > this.DECAY_START_MS)
        weight *= Math.max(0, 1 - (age - this.DECAY_START_MS) / this.DECAY_START_MS);

      if (weight > 0) {
        weightedSum  += latest.value * weight;
        totalWeight  += weight;
        maxConf = Math.max(maxConf, latest.confidence);
      }
    }

    if (totalWeight === 0) return null;
    return { value: Math.round(weightedSum / totalWeight), confidence: Math.round(maxConf) };
  }

  // ── FUSED BREATHING RATE ────────────────────────────────────
  // Combines two independent estimates: mic-based (SonarEngine) and accel-based (VisionEngine).
  // If both agree within 3 br/min → high confidence average.
  // If they disagree → use the one with higher individual confidence (or sonar by default).
  // Reference: Multi-modal respiratory rate estimation — Pimentel et al. 2017
  getFusedBreathRate(
    sonarRate: number | null,   sonarConf: number,
    accelRate: number | null,   accelConf: number
  ): { rate: number; confidence: number } | null {
    if (sonarRate === null && accelRate === null) return null;
    if (sonarRate === null) return accelRate !== null ? { rate: accelRate, confidence: Math.round(accelConf * 0.7) } : null;
    if (accelRate === null) return { rate: sonarRate, confidence: sonarConf };

    const diff = Math.abs(sonarRate - accelRate);
    if (diff <= 3) {
      // Sensors agree → weighted average, boost confidence
      const totalW = sonarConf + accelConf;
      const fusedRate = Math.round((sonarRate * sonarConf + accelRate * accelConf) / totalW);
      const fusedConf = Math.min(95, Math.round(totalW / 2 * 1.2)); // 20% boost for agreement
      return { rate: fusedRate, confidence: fusedConf };
    }
    // Sensors disagree → trust the higher confidence one
    return sonarConf >= accelConf
      ? { rate: sonarRate, confidence: Math.round(sonarConf * 0.8) }
      : { rate: accelRate, confidence: Math.round(accelConf * 0.8) };
  }

  // ── STRESS INDEX ─────────────────────────────────────────────
  // Low HRV = high sympathetic tone = stress.
  // Fast breathing = sympathetic activation.
  // High LF/HF ratio = sympathetic dominance.
  // Reference: Task Force of ESC & NASPE, Circulation 1996
  getStressIndex(
    hrv: number | null,
    breathRate: number | null,
    hrvConf: number,
    brConf: number,
    lfhfRatio?: number | null   // optional: LF/HF from HRV frequency domain
  ): number {
    const hrvScore = (hrv !== null && hrv > 0)
      ? Math.max(0, Math.min(100, Math.round(100 - (hrv / 100) * 100)))
      : null;

    const brScore = (breathRate !== null && breathRate > 0)
      ? Math.max(0, Math.min(100, Math.round(((breathRate - 8) / 22) * 100)))
      : null;

    // LF/HF ratio: >2 = sympathetic dominance (stress); <1 = parasympathetic (calm)
    // Normalized: ratio 0→0, ratio 4→100
    const lfhfScore = (lfhfRatio != null && lfhfRatio > 0)
      ? Math.max(0, Math.min(100, Math.round((lfhfRatio / 4) * 100)))
      : null;

    if (hrvScore === null && brScore === null && lfhfScore === null) return 0;

    let weighted = 0, totalConf = 0;
    if (hrvScore !== null && hrvConf > 0) {
      // RMSSD: weight 40%
      weighted += hrvScore * (hrvConf / 100) * 0.4; totalConf += (hrvConf / 100) * 0.4;
    }
    if (brScore !== null && brConf > 0) {
      // Breathing rate: weight 30%
      weighted += brScore * (brConf / 100) * 0.3; totalConf += (brConf / 100) * 0.3;
    }
    if (lfhfScore !== null) {
      // LF/HF: weight 30% (no separate confidence — derived from same RR data as HRV)
      const lfhfW = Math.min(hrvConf, 80) / 100 * 0.3;
      weighted += lfhfScore * lfhfW; totalConf += lfhfW;
    }

    return totalConf > 0 ? Math.round(weighted / totalConf) : 0;
  }

  // ── VITALITY INDEX ───────────────────────────────────────────
  // Resting HR 60-80 + high HRV = good cardiovascular fitness
  getVitalityIndex(hr: number, hrv: number | null, hrConf: number, hrvConf: number): number {
    if (hrConf === 0 && hrvConf === 0) return 0;

    let hrScore = 50;
    if (hr > 0) {
      if (hr >= 55 && hr <= 80)       hrScore = 100;
      else if (hr < 55)               hrScore = Math.max(0, 100 - (55 - hr) * 2);
      else                            hrScore = Math.max(0, 100 - (hr - 80) * 2);
    }

    let hrvScore = 50;
    if (hrv !== null && hrv > 0) hrvScore = Math.min(100, (hrv / 80) * 100);

    let weighted = 0, totalConf = 0;
    if (hrConf  > 0) { weighted += hrScore  * (hrConf  / 100); totalConf += hrConf  / 100; }
    if (hrvConf > 0 && hrv !== null) { weighted += hrvScore * (hrvConf / 100); totalConf += hrvConf / 100; }

    return totalConf > 0 ? Math.round(weighted / totalConf) : 0;
  }

  // ── FOCUS INDEX ──────────────────────────────────────────────
  // Moderate-to-high HRV + low facial micro-movement = focused state
  getFocusIndex(hrv: number | null, microExpr: number, hrvConf: number): number {
    if (hrvConf === 0) return 0;
    const hrvScore  = (hrv !== null && hrv > 0) ? Math.min(100, (hrv / 80) * 100) : 50;
    const exprScore = Math.max(0, 100 - microExpr);
    return Math.round(hrvScore * 0.6 + exprScore * 0.4);
  }

  // ── HRV COHERENCE ────────────────────────────────────────────
  // Measures how dominant the LF peak (0.04–0.15 Hz) is in the RR spectrum.
  // High coherence = rhythmic, sine-wave-like HRV at respiratory frequency.
  // This is what HeartMath emWave measures. It reflects parasympathetic tone.
  //
  // Algorithm:
  //   1. Resample RR intervals to 4 Hz (linear interpolation)
  //   2. Detrend + Hann window
  //   3. FFT → power spectrum
  //   4. Coherence ratio = peak LF power / total HF+LF power
  //
  // Returns 0 until enough data (~60s), then 0–100.
  getHRVCoherence(): number {
    if (this.rrAccumulator.length < 20) return 0;

    const rr   = this.rrAccumulator.map(r => r.interval);
    const ts   = this.rrAccumulator.map(r => r.timestamp);

    // ── Resample to 4 Hz ──
    const fs = 4;
    const t0 = ts[0];
    const cumTime = ts.map(t => (t - t0) / 1000); // seconds from start
    const totalDur = cumTime[cumTime.length - 1];
    const nSamples = Math.floor(totalDur * fs);

    if (nSamples < 32) return 0; // need at least 8 seconds

    const resampled: number[] = [];
    for (let n = 0; n < nSamples; n++) {
      const t = n / fs;
      let j = 0;
      while (j < cumTime.length - 1 && cumTime[j + 1] < t) j++;
      if (j >= cumTime.length - 1) {
        resampled.push(rr[rr.length - 1]);
      } else {
        const frac = (t - cumTime[j]) / ((cumTime[j+1] - cumTime[j]) || 0.001);
        resampled.push(rr[j] + frac * (rr[j+1] - rr[j]));
      }
    }

    // ── Detrend ──
    const mean = resampled.reduce((s, v) => s + v, 0) / resampled.length;
    const detrended = resampled.map(v => v - mean);

    // ── FFT ──
    const fftSize = Math.pow(2, Math.floor(Math.log2(detrended.length)));
    const real = new Array(fftSize).fill(0);
    const imag = new Array(fftSize).fill(0);
    for (let i = 0; i < fftSize; i++) {
      const hann = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
      real[i] = detrended[i] * hann;
    }
    fft(real, imag);

    // ── Power Spectral Density ──
    const freqRes = fs / fftSize;
    const lfMinIdx = Math.floor(0.04 / freqRes);
    const lfMaxIdx = Math.ceil(0.15  / freqRes);
    const hfMaxIdx = Math.ceil(0.40  / freqRes);

    let lfPower = 0, totalPower = 0, peakLFPower = 0;

    for (let i = lfMinIdx; i <= Math.min(hfMaxIdx, fftSize / 2); i++) {
      const p = real[i] * real[i] + imag[i] * imag[i];
      totalPower += p;
      if (i <= lfMaxIdx) {
        lfPower += p;
        if (p > peakLFPower) peakLFPower = p;
      }
    }

    if (totalPower < 1e-10) return 0;

    // Coherence ratio: how dominant is the single LF peak?
    // High = one clear frequency dominates = rhythmic breathing entraining HRV
    const coherenceRatio = peakLFPower / totalPower;

    // Scale: ratio > 0.5 is excellent coherence (HeartMath threshold for "high")
    return Math.round(Math.min(100, coherenceRatio * 200));
  }

  // ── BREATHING COHERENCE GUIDE ────────────────────────────────
  // Returns the optimal breathing rate for coherence based on current HR.
  // Resonant frequency breathing: typically 4.5–7 breaths/min for adults.
  // Reference: Lehrer & Gevirtz 2014, Applied Psychophysiology & Biofeedback
  getResonantBreathRate(bpm: number): number {
    // Empirical relationship: resonant frequency ≈ HR / (some constant)
    // Most adults: 5.5 br/min (range 4.5–7)
    // This is an approximation — true resonant frequency needs HRV biofeedback
    if (bpm <= 0) return 5.5;
    if (bpm < 50) return 4.5;
    if (bpm > 90) return 6.5;
    return 5.5;
  }

  // --- Polygraph / Deception Detection ---
  setBaseline(hr: number, hrv: number) {
    this.baselineHR = hr;
    this.baselineHRV = hrv;
  }

  getDeceptionProbability(
    currentHR: number,
    currentHRV: number,
    voiceStressScore: number,
    microExpressionScore: number
  ): number {
    if (!this.baselineHR || !this.baselineHRV) return 0;

    // 1. Heart Rate Spike (Sympathetic arousal)
    const hrSpike = Math.max(0, currentHR - this.baselineHR);
    const hrPenalty = Math.min(30, (hrSpike / 15) * 30); // Max 30 points

    // 2. HRV Drop (Vagal withdrawal)
    const hrvDrop = Math.max(0, this.baselineHRV - currentHRV);
    const hrvPenalty = Math.min(20, (hrvDrop / 20) * 20); // Max 20 points

    // 3. Voice Stress (Jitter/Shimmer)
    const voicePenalty = Math.min(30, (voiceStressScore / 100) * 30); // Max 30 points

    // 4. Facial Micro-expressions (Twitches, blinks, lip biting)
    const expressionPenalty = Math.min(20, (microExpressionScore / 100) * 20); // Max 20 points

    const totalProbability = hrPenalty + hrvPenalty + voicePenalty + expressionPenalty;

    return Math.round(Math.min(100, Math.max(0, totalProbability)));
  }
}
