// src/lib/adaptiveBaseline.ts
// ════════════════════════════════════════════════════════════════
// AdaptiveBaseline — محرك الخط الأساسي التكيفي الشخصي
// يتعلم النمط الفسيولوجي الخاص بكل مستخدم ويعدّل الحدود تلقائياً
// ════════════════════════════════════════════════════════════════

const STORAGE_KEY = "atmos_adaptive_baseline_v2";
const LEARNING_RATE = 0.08; // معدل التعلم — بطيء يحافظ على الاستقرار
const MIN_SAMPLES = 20;      // عدد قراءات ادنى قبل تفعيل التكيّف

export interface PersonalBaseline {
  avgHR: number;
  avgHRV: number;
  avgBreathRate: number;
  avgStress: number;
  sampleCount: number;
  lastUpdated: number;
  // نمط زمني — ساعة اليوم → مستوى التوتر المتوقع
  hourlyStressPattern: number[]; // 24 قيمة
}

function defaultBaseline(): PersonalBaseline {
  return {
    avgHR: 75,
    avgHRV: 45,
    avgBreathRate: 14,
    avgStress: 35,
    sampleCount: 0,
    lastUpdated: Date.now(),
    hourlyStressPattern: new Array(24).fill(35),
  };
}

export class AdaptiveBaseline {
  private baseline: PersonalBaseline;

  constructor() {
    this.baseline = this.load();
  }

  private load(): PersonalBaseline {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...defaultBaseline(), ...JSON.parse(saved) };
    } catch {}
    return defaultBaseline();
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.baseline));
    } catch {}
  }

  // ── تحديث الخط الأساسي بقراءة جديدة ─────────────────────────
  update(params: {
    hr?: number | null;
    hrv?: number | null;
    breathRate?: number | null;
    stressIdx?: number | null;
  }): void {
    const lr = LEARNING_RATE;
    const b = this.baseline;

    if (params.hr != null && params.hr > 0)
      b.avgHR = b.avgHR * (1 - lr) + params.hr * lr;
    if (params.hrv != null && params.hrv > 0)
      b.avgHRV = b.avgHRV * (1 - lr) + params.hrv * lr;
    if (params.breathRate != null && params.breathRate > 0)
      b.avgBreathRate = b.avgBreathRate * (1 - lr) + params.breathRate * lr;
    if (params.stressIdx != null && params.stressIdx >= 0) {
      b.avgStress = b.avgStress * (1 - lr) + params.stressIdx * lr;
      // تحديث نمط الساعة
      const hour = new Date().getHours();
      b.hourlyStressPattern[hour] =
        b.hourlyStressPattern[hour] * (1 - lr) + params.stressIdx * lr;
    }

    b.sampleCount++;
    b.lastUpdated = Date.now();

    // حفظ كل 10 قراءات
    if (b.sampleCount % 10 === 0) this.save();
  }

  // ── حساب حدود التشغيل الشخصية ───────────────────────────────
  getPreTriggerThreshold(): number {
    const base = this.baseline.avgHR;
    // الـ Pre-Trigger: +10% من المعدل الشخصي
    return Math.min(base * 1.1, base + 12);
  }

  getProtocolThreshold(): number {
    const base = this.baseline.avgHR;
    // الـ Full Protocol: +18% من المعدل الشخصي
    return Math.min(base * 1.18, base + 18);
  }

  getExpectedStressForNow(): number {
    const hour = new Date().getHours();
    return this.baseline.hourlyStressPattern[hour];
  }

  isAbovePersonalBaseline(hr: number): boolean {
    return (
      this.baseline.sampleCount >= MIN_SAMPLES &&
      hr > this.getPreTriggerThreshold()
    );
  }

  isHighStress(stressIdx: number): boolean {
    const expected = this.getExpectedStressForNow();
    // التوتر مرتفع إذا تجاوز المتوقع لهذه الساعة بـ 20 نقطة
    return stressIdx > expected + 20;
  }

  // ── Getters ───────────────────────────────────────────────────
  get(): PersonalBaseline { return { ...this.baseline }; }
  isReady(): boolean { return this.baseline.sampleCount >= MIN_SAMPLES; }

  reset(): void {
    this.baseline = defaultBaseline();
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }
}

// ── Singleton ────────────────────────────────────────────────
export const adaptiveBaseline = new AdaptiveBaseline();
