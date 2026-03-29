// src/lib/sonarRadar.ts
// ════════════════════════════════════════════════════════════════
// SpatialRadar — رادار الحماية المكانية بتقنية Doppler السمعية
// يحول الهاتف إلى حارس ليلي صامت لكبار السن وغرف الطوارئ
// ════════════════════════════════════════════════════════════════

export type MotionType = "hand" | "body" | "unknown";

export interface RadarEvent {
  motionIntensity: number;    // ratio vs baseline — >3.0 = significant
  motionType: MotionType;     // hand (close, fast) | body (distant, slow) | unknown
  timestamp: number;
}

export class SpatialRadar {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private rafId: number | null = null;

  private readonly FREQ = 19000; // 19 kHz — خارج نطاق سمع الإنسان البالغ
  private baselineEnergy = 0;
  private isCalibrating = true;
  private calibrationFrames = 0;
  private lastAlertTime = 0;
  private readonly ALERT_COOLDOWN_MS = 3000; // 3 ثواني بين كل تنبيه

  private onMotionDetected: (event: RadarEvent) => void;
  private onCalibrationDone?: () => void;

  constructor(
    onMotionDetected: (event: RadarEvent) => void,
    onCalibrationDone?: () => void
  ) {
    this.onMotionDetected = onMotionDetected;
    this.onCalibrationDone = onCalibrationDone;
  }

  async start(): Promise<void> {
    if (this.ctx) return;

    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    // ── 1. الميكروفون ─────────────────────────────────────────
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch (err) {
      console.error("SpatialRadar: Mic access denied", err);
      throw new Error("تعذّر الوصول إلى الميكروفون للرادار المكاني");
    }

    const source = this.ctx.createMediaStreamSource(this.micStream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 4096; // دقة عالية لاكتشاف فروق دوبلر الدقيقة
    this.analyser.smoothingTimeConstant = 0.15;
    source.connect(this.analyser);

    // ── 2. المُصدِر فوق الصوتي ────────────────────────────────
    this.osc = this.ctx.createOscillator();
    this.osc.type = "sine";
    this.osc.frequency.value = this.FREQ;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.75; // كافٍ للارتداد، لكن صامت للإنسان

    this.osc.connect(gain);
    gain.connect(this.ctx.destination);
    this.osc.start();

    // ── 3. بدء المسح ─────────────────────────────────────────
    this.isCalibrating = true;
    this.calibrationFrames = 0;
    this.baselineEnergy = 0;
    this.scanLoop();
    console.log("AtMoS SpatialRadar: Active at 19kHz");
  }

  private scanLoop(): void {
    if (!this.analyser || !this.ctx) return;

    const dataArray = new Float32Array(this.analyser.frequencyBinCount);
    this.analyser.getFloatFrequencyData(dataArray);

    const nyquist = this.ctx.sampleRate / 2;
    const binSize = nyquist / this.analyser.frequencyBinCount;
    const targetBin = Math.round(this.FREQ / binSize);

    // طاقة النطاق الجانبي (Sideband) — أين تظهر إزاحة دوبلر
    let motionEnergy = 0;
    const sidebandWidth = 8;
    for (let i = 1; i <= sidebandWidth; i++) {
      const binL = targetBin - i;
      const binR = targetBin + i;
      if (binL >= 0) motionEnergy += Math.pow(10, dataArray[binL] / 10);
      if (binR < dataArray.length) motionEnergy += Math.pow(10, dataArray[binR] / 10);
    }

    if (this.isCalibrating) {
      // تعلّم الغرفة الهادئة (أول ~2 ثانية)
      this.baselineEnergy =
        (this.baselineEnergy * this.calibrationFrames + motionEnergy) /
        (this.calibrationFrames + 1);
      this.calibrationFrames++;
      if (this.calibrationFrames > 120) {
        this.isCalibrating = false;
        console.log("AtMoS SpatialRadar: Calibrated. Baseline:", this.baselineEnergy);
        this.onCalibrationDone?.();
      }
    } else {
      // مقارنة مع الخط الأساسي
      const motionRatio = motionEnergy / (this.baselineEnergy + 1e-9);
      const now = Date.now();

      if (motionRatio > 3.0 && now - this.lastAlertTime > this.ALERT_COOLDOWN_MS) {
        this.lastAlertTime = now;

        // ── Smart discrimination: hand vs body ────────────────
        // Hand (close): strong energy concentrated near target frequency
        // Body (distant): broader, weaker energy spread across wider bands
        const nearBinCount  = 3; // very close to 19kHz
        const farBinCount   = sidebandWidth; // full sideband

        let nearEnergy = 0;
        for (let i = 1; i <= nearBinCount; i++) {
          const bL = targetBin - i;
          const bR = targetBin + i;
          if (bL >= 0) nearEnergy += Math.pow(10, dataArray[bL] / 10);
          if (bR < dataArray.length) nearEnergy += Math.pow(10, dataArray[bR] / 10);
        }

        // If near-band has >55% of total sideband energy → likely a hand gesture
        const nearRatio = nearEnergy / (motionEnergy + 1e-9);
        const motionType: MotionType =
          nearRatio > 0.55 ? "hand" :
          motionRatio > 5.0 ? "body" : "unknown";

        this.onMotionDetected({ motionIntensity: motionRatio, motionType, timestamp: now });
      }
    }

    this.rafId = requestAnimationFrame(() => this.scanLoop());
  }

  isActive(): boolean {
    return this.ctx !== null && !this.isCalibrating;
  }

  isCalibrated(): boolean {
    return !this.isCalibrating && this.ctx !== null;
  }

  stop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.osc) { this.osc.stop(); this.osc.disconnect(); }
    if (this.micStream) this.micStream.getTracks().forEach((t) => t.stop());
    if (this.ctx) this.ctx.close();
    this.ctx = null;
    this.rafId = null;
    console.log("AtMoS SpatialRadar: Offline");
  }
}
