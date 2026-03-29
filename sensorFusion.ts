// src/lib/sensorFusion.ts
// ════════════════════════════════════════════════════════════════
// SensorFusionEngine — محرك الدمج الحسي المتقدم بفلاتر كالمان
// يستبدل BayesianFusion البسيط بنظام أكثر دقة وشمولية
// ════════════════════════════════════════════════════════════════

export type FusionMood = "calm" | "focused" | "stressed" | "agitated" | "danger";
export type FusionMode = "normal" | "assist" | "emergency";

export interface FusionInputs {
  hrv: number | null;
  breathRate: number | null;
  motion: number | null;
  voiceStress: number | null;
  emotionConfidence: number | null;
  signalQuality: number | null;
  ppgConfidence: number | null;
  noiseLevel: number | null;
}

export interface FusionSnapshot {
  coherenceScore: number;   // 0..100
  riskScore: number;        // 0..100
  stabilityScore: number;   // 0..100
  mood: FusionMood;
  mode: FusionMode;
  inputs: Required<FusionInputs>;
  timestamp: number;
}

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));

// ── فلتر كالمان أحادي البُعد ──────────────────────────────────
class Kalman1D {
  private x = 0;
  private p = 1;
  constructor(private q = 0.06, private r = 4) {}

  update(measurement: number) {
    this.p += this.q;
    const k = this.p / (this.p + this.r);
    this.x = this.x + k * (measurement - this.x);
    this.p = (1 - k) * this.p;
    return this.x;
  }

  seed(value: number) {
    this.x = value;
    this.p = 1;
  }

  get value() { return this.x; }
}

function safe(v: number | null | undefined, fallback: number): number {
  return Number.isFinite(v as number) ? (v as number) : fallback;
}

// ── دوال التقييم الفسيولوجي ───────────────────────────────────
function scoreHrv(hrv: number | null): number {
  if (hrv === null) return 0.5;
  return clamp(hrv / 90, 0, 1); // HRV مرتفع = صحة أفضل
}

function scoreBreath(breathRate: number | null): number {
  if (breathRate === null) return 0.5;
  const dist = Math.abs(breathRate - 6); // 6 br/min = تنفس رنيني مثالي
  return clamp(1 - dist / 10, 0, 1);
}

function scoreMotion(motion: number | null): number {
  if (motion === null) return 0.5;
  return clamp(1 - motion, 0, 1);
}

function scoreVoice(voiceStress: number | null): number {
  if (voiceStress === null) return 0.5;
  return clamp(1 - voiceStress, 0, 1);
}

function scoreSignal(signalQuality: number | null): number {
  if (signalQuality === null) return 0.5;
  return clamp(signalQuality, 0, 1);
}

function scorePpg(ppgConfidence: number | null): number {
  if (ppgConfidence === null) return 0.5;
  return clamp(ppgConfidence, 0, 1);
}

function scoreNoise(noiseLevel: number | null): number {
  if (noiseLevel === null) return 0.5;
  return clamp(1 - noiseLevel, 0, 1);
}

function moodFromRisk(risk: number): FusionMood {
  if (risk >= 0.82) return "danger";
  if (risk >= 0.65) return "agitated";
  if (risk >= 0.48) return "stressed";
  if (risk >= 0.28) return "focused";
  return "calm";
}

function modeFromMood(mood: FusionMood): FusionMode {
  if (mood === "danger") return "emergency";
  if (mood === "agitated" || mood === "stressed") return "assist";
  return "normal";
}

export class SensorFusionEngine {
  private coherenceFilter = new Kalman1D(0.08, 3);
  private riskFilter       = new Kalman1D(0.08, 3);
  private lastSnapshot: FusionSnapshot | null = null;

  update(input: Partial<FusionInputs>): FusionSnapshot {
    const merged: Required<FusionInputs> = {
      hrv:               safe(input.hrv, 0),
      breathRate:        safe(input.breathRate, 0),
      motion:            safe(input.motion, 0),
      voiceStress:       safe(input.voiceStress, 0),
      emotionConfidence: safe(input.emotionConfidence, 0.5),
      signalQuality:     safe(input.signalQuality, 0.5),
      ppgConfidence:     safe(input.ppgConfidence, 0.5),
      noiseLevel:        safe(input.noiseLevel, 0),
    };

    const hrvScore    = scoreHrv(input.hrv ?? null);
    const breathScore = scoreBreath(input.breathRate ?? null);
    const motionScore = scoreMotion(input.motion ?? null);
    const voiceScore  = scoreVoice(input.voiceStress ?? null);
    const signalScore = scoreSignal(input.signalQuality ?? null);
    const ppgScore    = scorePpg(input.ppgConfidence ?? null);
    const noiseScore  = scoreNoise(input.noiseLevel ?? null);
    const emotionTrust = clamp(input.emotionConfidence ?? 0.5, 0, 1);

    // ── معادلة الاتساق المرجحة ────────────────────────────────
    const coherenceRaw =
      0.22 * hrvScore    +
      0.18 * breathScore +
      0.16 * motionScore +
      0.14 * voiceScore  +
      0.12 * signalScore +
      0.12 * ppgScore    +
      0.06 * noiseScore  +
      0.02 * emotionTrust;

    const riskRaw = 1 - coherenceRaw;

    const stabilityRaw =
      0.30 * signalScore +
      0.25 * motionScore +
      0.20 * noiseScore  +
      0.15 * ppgScore    +
      0.10 * breathScore;

    const coherenceScore  = Math.round(clamp(this.coherenceFilter.update(coherenceRaw * 100), 0, 100));
    const riskScore       = Math.round(clamp(this.riskFilter.update(riskRaw * 100), 0, 100));
    const stabilityScore  = Math.round(clamp(stabilityRaw * 100, 0, 100));

    const mood = moodFromRisk(riskScore / 100);
    const mode = modeFromMood(mood);

    const snapshot: FusionSnapshot = {
      coherenceScore,
      riskScore,
      stabilityScore,
      mood,
      mode,
      inputs: merged,
      timestamp: Date.now(),
    };

    this.lastSnapshot = snapshot;
    return snapshot;
  }

  seedCoherence(value: number) { this.coherenceFilter.seed(value); }
  seedRisk(value: number)      { this.riskFilter.seed(value); }
  getLastSnapshot()            { return this.lastSnapshot; }
  getCoherencePercent(): number { return this.lastSnapshot?.coherenceScore ?? 100; }
  getRiskPercent(): number      { return this.lastSnapshot?.riskScore ?? 0; }
  getMood(): FusionMood         { return this.lastSnapshot?.mood ?? "calm"; }
  getMode(): FusionMode         { return this.lastSnapshot?.mode ?? "normal"; }
}

// ── Singleton للاستخدام العام ─────────────────────────────────
export const globalSensorFusion = new SensorFusionEngine();
