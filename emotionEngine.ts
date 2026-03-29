// src/lib/emotionEngine.ts

export type EmotionState =
  | "idle"
  | "calm"
  | "focused"
  | "stressed"
  | "agitated"
  | "high_stress"
  | "danger";

export interface EmotionFeatures {
  pitchMean: number;       // 0–1 normalized
  pitchVariance: number;   // 0–1 normalized
  energyMean: number;      // 0–1 normalized
  energyVariance: number;  // 0–1 normalized
  spectralCentroid: number;// 0–1 normalized
  spectralSlope: number;   // 0–1 normalized (negative slope = calm voice)
  pauseRatio: number;      // 0–1: ratio of silence frames
}

/**
 * Score-based classifier using physiologically-grounded heuristics.
 * Weights derived from Murray & Arnott (1993) affective speech literature.
 */
export function classifyEmotion(f: EmotionFeatures): EmotionState {
  if (f.energyMean < 0.04) return "idle";

  // Composite stress score (0–1)
  const stressScore =
    f.energyMean       * 0.25 +
    f.pitchVariance    * 0.25 +
    f.spectralCentroid * 0.20 +
    f.spectralSlope    * 0.15 +
    (1 - f.pauseRatio) * 0.15;

  if (stressScore >= 0.85) return "danger";
  if (stressScore >= 0.70) return "high_stress";
  if (stressScore >= 0.55) return "agitated";
  if (stressScore >= 0.38) return "stressed";
  if (stressScore >= 0.20) return "focused";
  return "calm";
}

/**
 * Extract basic emotion features from a Web Audio AnalyserNode frame.
 * Call this from within an AudioWorkletProcessor or requestAnimationFrame loop.
 */
export function extractFeaturesFromAnalyser(
  analyser: AnalyserNode,
  sampleRate: number
): EmotionFeatures {
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Float32Array(bufferLength);
  analyser.getFloatFrequencyData(dataArray);

  // Convert dB → linear magnitude
  const linMags = dataArray.map((db) => Math.pow(10, db / 20));

  // Energy (RMS of magnitudes)
  const energyMean = Math.min(
    1,
    Math.sqrt(linMags.reduce((s, v) => s + v * v, 0) / bufferLength) * 4
  );

  const energyVariance = Math.min(
    1,
    linMags.reduce((s, v) => s + Math.abs(v - energyMean), 0) / bufferLength * 4
  );

  // Spectral centroid (frequency-weighted centre of mass, normalized)
  const binHz = sampleRate / 2 / bufferLength;
  let weightedSum = 0, magSum = 0;
  for (let i = 0; i < bufferLength; i++) {
    weightedSum += linMags[i] * i * binHz;
    magSum += linMags[i];
  }
  const centroidHz = magSum > 0 ? weightedSum / magSum : 0;
  const spectralCentroid = Math.min(1, centroidHz / (sampleRate / 4));

  // Spectral slope (linear regression across bins, positive = high-freq dominant)
  const slope = linMags.length > 1
    ? (linMags[linMags.length - 1] - linMags[0]) / linMags.length
    : 0;
  const spectralSlope = Math.min(1, Math.max(0, slope + 0.5));

  // Pause detection: ratio of near-silent frames
  const silenceThreshold = 0.005;
  const silentCount = linMags.filter((v) => v < silenceThreshold).length;
  const pauseRatio = silentCount / bufferLength;

  // Pitch proxies: variance in low-frequency bins (80–800 Hz = speech fundamental)
  const pitchBinStart = Math.floor(80 / binHz);
  const pitchBinEnd   = Math.floor(800 / binHz);
  const pitchBins = linMags.slice(pitchBinStart, pitchBinEnd);
  const pitchMeanRaw = pitchBins.reduce((a, b) => a + b, 0) / Math.max(1, pitchBins.length);
  const pitchMean = Math.min(1, pitchMeanRaw * 6);
  const pitchVariance = Math.min(
    1,
    pitchBins.reduce((s, v) => s + Math.pow(v - pitchMeanRaw, 2), 0) /
      Math.max(1, pitchBins.length) * 20
  );

  return {
    pitchMean,
    pitchVariance,
    energyMean,
    energyVariance,
    spectralCentroid,
    spectralSlope,
    pauseRatio,
  };
}
