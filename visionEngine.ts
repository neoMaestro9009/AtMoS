import {
  FilesetResolver,
  FaceLandmarker,
  DrawingUtils,
} from "@mediapipe/tasks-vision";
import {
  PPGFilter,
  calculateBPMAndHRV,
  KalmanFilter,
  BPMResult,
  HRVTimeDomain,
  HRVFreqDomain,
  calculateSignalSNR,
  calculateLightScore,
  cleanRRIntervals,
} from "./filters";

// ── Accelerometer: Motion Artifact Removal + Respiratory Rate ────────────────
// Uses DeviceMotion API (available in all modern Android browsers with permission).
// Two purposes:
//   1. Motion magnitude → adaptive weight on PPG Kalman (freeze on movement)
//   2. Low-frequency vertical motion (0.1–0.6 Hz) → breathing rate estimate
//      Principle: chest expansion during breathing causes ~0.1–0.3g vertical accel
//      Reference: Bates et al. 2010, IEEE Sensors Journal
export class AccelerometerSensor {
  private motionMag = 0; // Current motion magnitude (g-force)
  private breathBuf: number[] = []; // Vertical accel envelope for breathing
  private breathTs: number[] = [];
  private lastBreathRate: number | null = null;
  private listener: ((e: DeviceMotionEvent) => void) | null = null;
  private readonly BREATH_FS = 10; // Downsample to 10 Hz for breathing analysis

  start() {
    if (typeof DeviceMotionEvent === "undefined") return;
    this.listener = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const x = a.x ?? 0,
        y = a.y ?? 0,
        z = a.z ?? 0;
      // Motion magnitude (subtract ~1g gravity from z for phone lying flat)
      this.motionMag = Math.sqrt(x * x + y * y + z * z);
      // Vertical axis (y on Poco X7 Pro in portrait) for breathing
      this.breathBuf.push(y);
      this.breathTs.push(performance.now());
      // Keep 30s
      while (this.breathBuf.length > this.BREATH_FS * 30) {
        this.breathBuf.shift();
        this.breathTs.shift();
      }
      if (this.breathBuf.length >= this.BREATH_FS * 15) {
        this.estimateBreathing();
      }
    };
    window.addEventListener("devicemotion", this.listener);
  }

  stop() {
    if (this.listener)
      window.removeEventListener("devicemotion", this.listener);
    this.listener = null;
    this.motionBuf = [];
    this.breathBuf = [];
    this.breathTs = [];
  }

  // Returns motion magnitude in g-force (>0.15g = notable movement)
  getMotionMag(): number {
    return this.motionMag;
  }

  // Returns accelerometer-based breathing rate (br/min) or null
  getBreathRate(): number | null {
    return this.lastBreathRate;
  }

  private motionBuf: number[] = [];

  private estimateBreathing() {
    const raw = [...this.breathBuf];
    const N = raw.length;

    // Moving-average detrend (remove gravity DC)
    const win = Math.round(this.BREATH_FS * 3);
    const detrended = raw.map((v, i) => {
      const s = Math.max(0, i - (win >> 1));
      const e = Math.min(N, i + (win >> 1));
      let sum = 0;
      for (let j = s; j < e; j++) sum += raw[j];
      return v - sum / (e - s);
    });

    // Peak detection for breathing (0.1–0.6 Hz = 6–36 br/min at 10 Hz)
    const minGap = Math.round(this.BREATH_FS * (60 / 36)); // max 36 br/min
    const maxGap = Math.round(this.BREATH_FS * (60 / 6)); // min 6 br/min
    const mean = detrended.reduce((s, v) => s + v, 0) / N;
    const std = Math.sqrt(
      detrended.reduce((s, v) => s + (v - mean) ** 2, 0) / N,
    );
    const thresh = mean + std * 0.3;

    const peaks: number[] = [];
    let lastPeak = -minGap;
    for (let i = 1; i < N - 1; i++) {
      if (
        detrended[i] > thresh &&
        detrended[i] >= detrended[i - 1] &&
        detrended[i] >= detrended[i + 1] &&
        i - lastPeak >= minGap
      ) {
        peaks.push(i);
        lastPeak = i;
      }
    }
    if (peaks.length < 3) return;

    const intervals: number[] = [];
    for (let i = 1; i < peaks.length; i++) {
      const gap = peaks[i] - peaks[i - 1];
      if (gap >= minGap && gap <= maxGap) intervals.push(gap / this.BREATH_FS);
    }
    if (intervals.length < 2) return;

    const meanInt = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    const rate = Math.round(60 / meanInt);
    if (rate >= 6 && rate <= 36) this.lastBreathRate = rate;
  }
}

// ── Full CHROM algorithm (de Haan & Jeanne, IEEE TNSRE 2013) ──────────────────
// Uses normalized RGB channels + alpha-weighted orthogonal projection.
// Significantly more robust against specular reflection than 3G-2R shortcut.
// Ported from AudioLab AtMoSEngine.ts (proven implementation).
class CHROMExtractor {
  private rBuf: number[] = [];
  private gBuf: number[] = [];
  private bBuf: number[] = [];
  private filter = new PPGFilter();
  private readonly WIN = 32; // sliding window for normalization

  process(r: number, g: number, b: number): number {
    this.rBuf.push(r);
    this.gBuf.push(g);
    this.bBuf.push(b);
    if (this.rBuf.length > this.WIN) {
      this.rBuf.shift();
      this.gBuf.shift();
      this.bBuf.shift();
    }
    if (this.rBuf.length < 4) return 0;

    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const std = (a: number[], m: number) =>
      Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);

    const Rm = mean(this.rBuf) || 1;
    const Gm = mean(this.gBuf) || 1;
    const Bm = mean(this.bBuf) || 1;

    // Normalize each channel by its own mean
    const Rn = this.rBuf.map((v) => v / Rm);
    const Gn = this.gBuf.map((v) => v / Gm);
    const Bn = this.bBuf.map((v) => v / Bm);

    // Two orthogonal projections from de Haan & Jeanne
    const Xs = Rn.map((r, i) => 3 * r - 2 * Gn[i]);
    const Ys = Rn.map((r, i) => 1.5 * r + Gn[i] - 1.5 * Bn[i]);

    const mXs = mean(Xs);
    const mYs = mean(Ys);
    const sX = std(Xs, mXs) || 0.0001;
    const sY = std(Ys, mYs) || 0.0001;

    // Alpha balances the two projections to cancel luminance noise
    const alpha = sX / sY;
    const chromSignal = Xs[Xs.length - 1] - alpha * Ys[Ys.length - 1];

    return this.filter.process(chromSignal);
  }

  reset() {
    this.rBuf = [];
    this.gBuf = [];
    this.bBuf = [];
    this.filter.reset();
  }
}

function isSkinDetected(
  r: number,
  g: number,
  b: number,
  mode: "remote" | "contact" = "remote",
) {
  if (mode === "contact") {
    return r > g * 1.5 && r > b * 1.5;
  }
  return (
    r > 80 &&
    r > g + 5 &&
    r > b + 10 &&
    g > 40 &&
    b < 200 &&
    r / (g + 1) > 1.1 &&
    r / (b + 1) > 1.2
  );
}

export class VisionEngine {
  private videoEl: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private ctx:
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null = null;
  private rafId: number | null = null;
  private stream: MediaStream | null = null;

  // Float32Array for APEX memory management
  private floatBuf = new Float32Array(512);
  private timeBufFloat = new Float64Array(512);
  private bufLen = 0;

  private lastT = 0;
  private fps = 30;
  private lastBpmUpdateT = 0; // throttle React state updates to ~2/sec (saves battery)

  // Accelerometer: motion artifact removal + secondary breath rate
  private accel = new AccelerometerSensor();

  private contactFilter = new PPGFilter();
  private remoteFilter = new CHROMExtractor(); // PATCH v1: full CHROM (was simplified ARPPGExtractor)
  private kalman = new KalmanFilter(0.05, 0.5);

  private faceLandmarker: FaceLandmarker | null = null;
  private mode: "contact" | "remote" = "contact";

  // Canvas direct draw — bypasses React useState for waveform (eliminates 30fps re-renders)
  private waveCanvasCtx: CanvasRenderingContext2D | null = null;
  private lastBpmCallbackFrame = 0; // For throttling BPM callbacks to ~2/sec

  // For micro-expressions
  private prevLandmarks: any[] | null = null;
  private expressionVarianceBuf: number[] = [];

  // Light Calibration
  public onLightCalibration?: (score: number, hint: string) => void;
  public lightCalibScore: number | null = null;
  private lightCalibFrames: number = 0;

  constructor(
    private onBpmUpdate: (
      bpm: number,
      hrv: number | null,
      conf: number,
      microExpr?: number,
      rrIntervals?: number[],
      rrTimestamps?: number[],
      hrvTime?: HRVTimeDomain | null,
      sqiQuality?: BPMResult["sqiQuality"],
    ) => void,
    private onWaveUpdate: ((data: number[]) => void) | null, // kept for backward compat — pass null to use canvas
    private overlayCanvasRef?: { current: HTMLCanvasElement | null },
    private onStatusUpdate?: (
      status: "no-skin" | "unstable" | "stable",
    ) => void,
    private waveCanvasRef?: { current: HTMLCanvasElement | null }, // direct canvas — no React re-render
  ) {}

  async initFaceLandmarker() {
    if (this.faceLandmarker) return;
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
    );
    this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        delegate: "GPU",
      },
      outputFaceBlendshapes: true,
      runningMode: "VIDEO",
      numFaces: 1,
    });
  }

  async start(mode: "contact" | "remote", videoEl: HTMLVideoElement) {
    this.mode = mode;
    this.videoEl = videoEl;

    // APEX: Use OffscreenCanvas if available for zero latency
    if (typeof OffscreenCanvas !== "undefined") {
      this.canvas = new OffscreenCanvas(64, 64);
      this.ctx = this.canvas.getContext("2d", {
        willReadFrequently: true,
      }) as OffscreenCanvasRenderingContext2D;
    } else {
      this.canvas = document.createElement("canvas");
      this.ctx = this.canvas.getContext("2d", {
        willReadFrequently: true,
      }) as CanvasRenderingContext2D;
    }

    this.bufLen = 0;
    this.expressionVarianceBuf = [];
    this.prevLandmarks = null;
    this.contactFilter.reset();
    this.remoteFilter.reset();
    this.kalman.reset();

    if (mode === "remote") {
      await this.initFaceLandmarker();
    }

    const constraints = {
      video: {
        facingMode:
          mode === "contact" ? { ideal: "environment" } : { ideal: "user" },
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: this.fps, min: 15 },
      },
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);

    if (mode === "contact") {
      const track = this.stream.getVideoTracks()[0];
      try {
        await track.applyConstraints({ advanced: [{ torch: true } as any] });
      } catch (e) {
        // Torch not available
      }
    }

    this.videoEl.srcObject = this.stream;
    await this.videoEl.play();

    this.accel.start(); // Start accelerometer for motion artifact removal + breathing
    this.rafId = requestAnimationFrame(() => this.readFrame());
  }

  private readFrame() {
    if (!this.ctx || !this.videoEl || this.videoEl.readyState < 2) return;

    const now = performance.now();
    if (now - this.lastT < (1000 / this.fps) * 0.85) {
      this.rafId = requestAnimationFrame(() => this.readFrame());
      return;
    }
    this.lastT = now;

    let signalValue = 0;
    let microExprScore = 0;
    let rMean = 0,
      gMean = 0,
      bMean = 0;

    if (this.mode === "contact") {
      // APEX: 64x64 processing
      const sw = 64;
      const sh = 64;

      this.canvas!.width = sw;
      this.canvas!.height = sh;
      this.ctx.drawImage(this.videoEl, 0, 0, sw, sh);
      const imgData = this.ctx.getImageData(0, 0, sw, sh).data;

      let rSum = 0,
        gSum = 0,
        bSum = 0;
      for (let i = 0; i < imgData.length; i += 4) {
        rSum += imgData[i];
        gSum += imgData[i + 1];
        bSum += imgData[i + 2];
      }

      const pixelCount = imgData.length / 4;
      rMean = rSum / pixelCount;
      gMean = gSum / pixelCount;
      bMean = bSum / pixelCount;

      // Compute skinOk HERE (early) so the Kalman freeze gate below can use it
      const skinOk = isSkinDetected(rMean, gMean, bMean, this.mode);

      // PATCH v4: Light quality score (ITU-R BT.709)
      // Used for Kalman SQI and passed to calculateBPMAndHRV for conf weighting.
      const lightData = calculateLightScore(rMean, gMean, bMean);
      const lightFactor = lightData.lightScore / 100; // 0–1 for Kalman

      // PATCH v3: Adaptive Kalman — continuous motionFactor replaces binary freeze gate.
      // motionFactor = 0 when still (gravity only), ramps to 1.0 at +2.5 m/s² above gravity.
      // PATCH v4: SQI = combined motion + light quality → drives Kalman R adaptation.
      const motionMag = this.accel.getMotionMag();
      const GRAVITY = 9.81;
      const motionExcess = Math.max(0, motionMag - GRAVITY);
      const motionFactor = Math.min(1, motionExcess / 2.5);

      // SQI for Kalman: 0 = worst signal (high motion + bad light), 1 = perfect
      const instantSQI = Math.max(
        0,
        lightFactor * 0.5 + (1 - motionFactor) * 0.5,
      );

      const rawFiltered = this.contactFilter.process(rMean);
      signalValue = skinOk
        ? this.kalman.filter(rawFiltered, 1 - instantSQI) // motionFactor replaced by unified SQI factor
        : rawFiltered;
    } else {
      // Remote rPPG using FaceLandmarker
      if (this.faceLandmarker) {
        const results = this.faceLandmarker.detectForVideo(this.videoEl, now);

        // Draw Mesh if overlay canvas is provided
        if (this.overlayCanvasRef?.current && this.videoEl.videoWidth > 0) {
          const canvas = this.overlayCanvasRef.current;
          if (canvas.width !== this.videoEl.videoWidth) {
            canvas.width = this.videoEl.videoWidth;
            canvas.height = this.videoEl.videoHeight;
          }
          const overlayCtx = canvas.getContext("2d");
          if (overlayCtx) {
            overlayCtx.clearRect(0, 0, canvas.width, canvas.height);
            if (results.faceLandmarks && results.faceLandmarks.length > 0) {
              const drawingUtils = new DrawingUtils(overlayCtx);
              for (const landmarks of results.faceLandmarks) {
                drawingUtils.drawConnectors(
                  landmarks,
                  FaceLandmarker.FACE_LANDMARKS_TESSELATION,
                  { color: "#00c8e840", lineWidth: 1 },
                );
                drawingUtils.drawConnectors(
                  landmarks,
                  FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
                  { color: "#00e070", lineWidth: 2 },
                );
                drawingUtils.drawConnectors(
                  landmarks,
                  FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
                  { color: "#00e070", lineWidth: 2 },
                );
                drawingUtils.drawConnectors(
                  landmarks,
                  FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
                  { color: "#00c8e8", lineWidth: 2 },
                );
              }
            }
          }
        }

        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
          const landmarks = results.faceLandmarks[0];

          // --- Micro-expression Analysis ---
          if (this.prevLandmarks) {
            let totalMovement = 0;
            const keyPoints = [13, 14, 33, 263, 61, 291, 10, 152];
            for (const idx of keyPoints) {
              const dx = landmarks[idx].x - this.prevLandmarks[idx].x;
              const dy = landmarks[idx].y - this.prevLandmarks[idx].y;
              totalMovement += Math.sqrt(dx * dx + dy * dy);
            }
            this.expressionVarianceBuf.push(totalMovement);
            if (this.expressionVarianceBuf.length > this.fps * 2) {
              this.expressionVarianceBuf.shift();
            }

            if (this.expressionVarianceBuf.length > 10) {
              const mean =
                this.expressionVarianceBuf.reduce((a, b) => a + b, 0) /
                this.expressionVarianceBuf.length;
              const variance =
                this.expressionVarianceBuf.reduce(
                  (a, b) => a + Math.pow(b - mean, 2),
                  0,
                ) / this.expressionVarianceBuf.length;
              microExprScore = Math.min(100, variance * 20000);
            }
          }
          this.prevLandmarks = landmarks;

          // --- ARPPG Extraction ---
          const roiIndices = [
            10,
            109,
            67,
            103,
            54,
            21,
            162,
            127,
            234,
            93, // Forehead
            116,
            117,
            118,
            119,
            100,
            120,
            121,
            122,
            129,
            142, // Left Cheek
            345,
            346,
            347,
            348,
            329,
            349,
            350,
            351,
            358,
            371, // Right Cheek
          ];

          const W = this.videoEl.videoWidth;
          const H = this.videoEl.videoHeight;

          if (W > 0 && H > 0) {
            this.canvas!.width = W;
            this.canvas!.height = H;
            this.ctx.drawImage(this.videoEl, 0, 0, W, H);
            const imgData = this.ctx.getImageData(0, 0, W, H).data;

            let rSum = 0,
              gSum = 0,
              bSum = 0,
              pixelCount = 0;

            for (const idx of roiIndices) {
              const lm = landmarks[idx];
              if (!lm) continue;
              const px = Math.floor(lm.x * W);
              const py = Math.floor(lm.y * H);

              for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                  const nx = px + dx;
                  const ny = py + dy;
                  if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
                    const i = (ny * W + nx) * 4;
                    rSum += imgData[i];
                    gSum += imgData[i + 1];
                    bSum += imgData[i + 2];
                    pixelCount++;
                  }
                }
              }
            }

            if (pixelCount > 0) {
              rMean = rSum / pixelCount;
              gMean = gSum / pixelCount;
              bMean = bSum / pixelCount;
              signalValue = this.remoteFilter.process(rMean, gMean, bMean);
            }
          }
        }
      }
    }

    // Skin detection gate (used for remote mode status + early-exit guard)
    // Contact mode already computed its own local skinOk above for the Kalman freeze gate.
    const skinOkGlobal = isSkinDetected(rMean, gMean, bMean, this.mode);
    const motionMagGlobal = this.accel.getMotionMag();

    // Light Calibration (Global)
    if (this.lightCalibScore === null) {
      const motionExcess = Math.max(0, motionMagGlobal - 9.81);
      const motionFactor = Math.min(1, motionExcess / 2.5);

      if (skinOkGlobal && motionFactor < 0.15) {
        this.lightCalibFrames++;
        const lightData = calculateLightScore(rMean, gMean, bMean);

        // Provide real-time feedback during calibration
        if (this.lightCalibFrames % 10 === 0) {
          const progress = Math.min(
            100,
            Math.round((this.lightCalibFrames / 90) * 100),
          );
          this.onLightCalibration?.(
            lightData.lightScore,
            `جاري المعايرة (${progress}%)... ${lightData.hint}`,
          );
        }

        if (this.lightCalibFrames >= 90) {
          // ~3 seconds at 30fps
          this.lightCalibScore = lightData.lightScore;
          this.onLightCalibration?.(lightData.lightScore, lightData.hint);
        }
      } else {
        if (
          this.lightCalibFrames > 0 ||
          (this.lightCalibFrames === 0 && Math.random() < 0.05)
        ) {
          this.onLightCalibration?.(
            0,
            "يرجى تثبيت الإصبع أو الوجه في إضاءة جيدة للبدء...",
          );
        }
        this.lightCalibFrames = 0;
      }
    }

    if (this.onStatusUpdate) {
      if (!skinOkGlobal) {
        this.onStatusUpdate("no-skin");
      } else if (motionMagGlobal > 9.9) {
        this.onStatusUpdate("unstable"); // motion artifact — signal unreliable
      } else {
        this.onStatusUpdate("stable");
      }
    }

    if (!skinOkGlobal && this.mode === "contact") {
      // No skin detected — drop frame, don't accumulate noise
      this.rafId = requestAnimationFrame(() => this.readFrame());
      return;
    }

    if (signalValue !== 0) {
      // APEX: Float32Array Circular Buffer
      if (this.bufLen < 512) {
        this.floatBuf[this.bufLen] = signalValue;
        this.timeBufFloat[this.bufLen] = now;
        this.bufLen++;
      } else {
        this.floatBuf.copyWithin(0, 1);
        this.timeBufFloat.copyWithin(0, 1);
        this.floatBuf[511] = signalValue;
        this.timeBufFloat[511] = now;
      }

      // ── Waveform: draw directly on canvas (no React re-render) ───────────
      // OPTIMIZATION: Instead of setWaveData(array) which causes 30 React re-renders/sec,
      // we draw the waveform directly on the canvas using Canvas2D API.
      // React state is only updated ~2x/sec for the BPM number display.
      const displayLen = Math.min(this.bufLen, this.fps * 10);
      const displayBuf = this.floatBuf.subarray(
        this.bufLen - displayLen,
        this.bufLen,
      );

      if (this.waveCanvasRef?.current) {
        // Direct canvas draw — zero React overhead
        const canvas = this.waveCanvasRef.current;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const W = canvas.width,
            H = canvas.height;
          ctx.clearRect(0, 0, W, H);
          // FIX: Fixed scale ±0.05 for stable visual representation.
          // Dynamic min/max caused the waveform to "jump" as signal amplitude varied,
          // making it hard to see real signal changes. Fixed scale shows true amplitude.
          // If signal occasionally exceeds range it clips, which is visually acceptable.
          const FIXED_SCALE_RANGE = 0.10; // ±0.05 around zero
          const min = -FIXED_SCALE_RANGE / 2;
          const range = FIXED_SCALE_RANGE;
          ctx.beginPath();
          ctx.strokeStyle = "#00c8e8";
          ctx.lineWidth = 1.5;
          for (let i = 0; i < displayBuf.length; i++) {
            const x = (i / displayBuf.length) * W;
            const y = H - ((displayBuf[i] - min) / range) * H;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      } else if (this.onWaveUpdate) {
        // Fallback: legacy callback (if waveCanvasRef not provided)
        this.onWaveUpdate(Array.from(displayBuf));
      }

      // ── BPM calculation: throttled to 2/sec to avoid React overload ──────
      const shouldCalcBpm =
        this.bufLen >= this.fps * 4 && now - this.lastBpmUpdateT >= 500;
      if (shouldCalcBpm) {
        this.lastBpmUpdateT = now;
        const processBuf = Array.from(this.floatBuf.subarray(0, this.bufLen));
        const processTime = Array.from(
          this.timeBufFloat.subarray(0, this.bufLen),
        );
        const result = calculateBPMAndHRV(processBuf, processTime, this.fps);
        if (result) {
          // PATCH v4: Apply SNR-based confidence penalty on top of existing conf.
          // snrPenalty reduces conf when spectral peak is weak (noisy signal).
          // This is the missing piece Gemini identified — without it conf ignores
          // whether the FFT actually found a clean heartbeat frequency.
          const snrData = calculateSignalSNR(processBuf, this.fps);
          // powerRatio < 0.3 = mostly noise; > 0.7 = clean signal
          const snrBonus = Math.round(((snrData.powerRatio - 0.3) / 0.4) * 20); // ±20 points
          const finalConf = Math.max(0, Math.min(100, result.conf + snrBonus));

          this.onBpmUpdate(
            result.bpm,
            result.hrv,
            finalConf,
            microExprScore,
            result.rrIntervals,
            result.rrTimestamps,
            result.hrvTime,
            result.sqiQuality,
          );
        }
      }
    }

    this.rafId = requestAnimationFrame(() => this.readFrame());
  }

  // Accelerometer-based breathing rate (secondary estimate, fused in fusion.ts)
  getAccelBreathRate(): number | null {
    return this.accel.getBreathRate();
  }

  // Current motion magnitude — useful for UI "hold still" feedback
  getMotionMag(): number {
    return this.accel.getMotionMag();
  }

  stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.bufLen = 0;
    this.expressionVarianceBuf = [];
    this.prevLandmarks = null;
    this.accel.stop();

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }

    if (this.overlayCanvasRef?.current) {
      const overlayCtx = this.overlayCanvasRef.current.getContext("2d");
      if (overlayCtx) {
        overlayCtx.clearRect(
          0,
          0,
          this.overlayCanvasRef.current.width,
          this.overlayCanvasRef.current.height,
        );
      }
    }
  }
}
