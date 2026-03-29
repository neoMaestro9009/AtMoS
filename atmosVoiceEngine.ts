// src/lib/atmosVoiceEngine.ts
// AtMoS Voice Engine: Wake Word Gate + Confidence Filtering + Execution Lock
// ── Updated: Added balance_protocol + step_back commands ──

export type AtmosCommand =
  | "start_face"
  | "stop_face"
  | "start_finger"
  | "stop_finger"
  | "start_sonar"
  | "stop_sonar"
  | "start_audio"
  | "stop_audio"
  | "activate_emergency"
  | "open_balance"        // NEW: فتح بروتوكول التوازن
  | "close_balance"       // NEW: إغلاق بروتوكول التوازن
  | "step_back_mode"      // NEW: خطوة لورا مباشرة
  | "mirror_mode"         // NEW: مواجهة الذات مباشرة
  | "none";

interface AtmosVoiceCallbacks {
  onCommand: (cmd: AtmosCommand) => void;
  onListeningState: (listening: boolean) => void;
  onWakeWord: () => void;
  onWakeExpired: () => void;
  onError: (msg: string) => void;
}

export class AtmosVoiceEngine {
  private recognition: SpeechRecognition | null = null;
  private callbacks: AtmosVoiceCallbacks;
  private isListening = false;

  private wakeActive = false;
  private wakeTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly WAKE_WINDOW_MS = 5000;
  private readonly CONFIDENCE_THRESHOLD = 0.65; // خُفِّف قليلاً للعربي
  private executionLocked = false;
  private readonly LOCK_DURATION_MS = 2000;

  constructor(callbacks: AtmosVoiceCallbacks) {
    this.callbacks = callbacks;

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      this.callbacks.onError("التعرف على الصوت غير مدعوم على هذا الجهاز.");
      return;
    }

    this.recognition = new SpeechRecognitionClass() as SpeechRecognition;
    this.recognition.lang = "ar-EG";
    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    this.recognition.maxAlternatives = 2;

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[event.results.length - 1][0];
      const transcript = result.transcript.trim().toLowerCase();
      const confidence = result.confidence ?? 1;

      if (confidence < this.CONFIDENCE_THRESHOLD) return;
      this.handleSpeech(transcript);
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        try { this.recognition?.start(); } catch { /* ignore */ }
      }
    };

    this.recognition.onerror = (event: any) => {
      const ignorable = ["no-speech", "audio-capture"];
      if (!ignorable.includes(event.error)) {
        this.callbacks.onError(event.error || "خطأ في التعرف على الصوت");
      }
    };
  }

  start(): void {
    if (!this.recognition || this.isListening) return;
    this.isListening = true;
    try { this.recognition.start(); } catch { /* already started */ }
    this.callbacks.onListeningState(true);
  }

  stop(): void {
    if (!this.recognition) return;
    this.isListening = false;
    this.recognition.stop();
    this.callbacks.onListeningState(false);
    this.resetWake();
  }

  private handleSpeech(text: string): void {
    if (this.executionLocked) return;

    const isWakeWord =
      text.includes("يا اتموس") ||
      text.includes("اتموس")    ||
      text.includes("أتموس")    ||
      text.includes("يا أتموس");

    if (isWakeWord) {
      this.activateWake();
      return;
    }

    // ── تحقق فوري بدون Wake Word لأوامر الطوارئ القصيرة ─────
    const immediateCmd = this.parseImmediateCommand(text);
    if (immediateCmd !== "none") {
      this.executeCommand(immediateCmd);
      return;
    }

    if (this.wakeActive) {
      const command = this.parseCommand(text);
      if (command !== "none") {
        this.executeCommand(command);
      }
    }
  }

  /** أوامر لا تحتاج Wake Word — للطوارئ فقط */
  private parseImmediateCommand(text: string): AtmosCommand {
    if (
      text.includes("خطوة لوراء") ||
      text.includes("خطوة لورا") ||
      text.includes("خطوه لوراء")
    ) return "step_back_mode";

    if (
      text.includes("طوارئ") ||
      text.includes("نجدة") ||
      text.includes("اطلب المساعدة")
    ) return "activate_emergency";

    return "none";
  }

  private activateWake(): void {
    this.wakeActive = true;
    this.callbacks.onWakeWord();
    if (this.wakeTimeout) clearTimeout(this.wakeTimeout);
    this.wakeTimeout = setTimeout(() => {
      this.resetWake();
      this.callbacks.onWakeExpired();
    }, this.WAKE_WINDOW_MS);
  }

  private resetWake(): void {
    this.wakeActive = false;
    if (this.wakeTimeout) {
      clearTimeout(this.wakeTimeout);
      this.wakeTimeout = null;
    }
  }

  private executeCommand(command: AtmosCommand): void {
    this.executionLocked = true;
    this.callbacks.onCommand(command);
    this.resetWake();
    setTimeout(() => { this.executionLocked = false; }, this.LOCK_DURATION_MS);
  }

  private parseCommand(text: string): AtmosCommand {
    // ── Balance Protocol ──────────────────────────────────────
    if (
      text.includes("التوازن") ||
      text.includes("بروتوكول") ||
      text.includes("خطوة لوراء") ||
      text.includes("خطوة لورا") ||
      text.includes("خطوه لوراء") ||
      text.includes("balance")
    ) return "open_balance";

    if (
      text.includes("مواجهة الذات") ||
      text.includes("المرآة") ||
      text.includes("mirror")
    ) return "mirror_mode";

    if (text.includes("اغلق البروتوكول") || text.includes("close balance"))
      return "close_balance";

    // ── Face tracking ─────────────────────────────────────────
    if (text.includes("تشغيل تتبع الوجه") || text.includes("ابدأ تتبع الوجه"))
      return "start_face";
    if (text.includes("ايقاف تتبع الوجه") || text.includes("وقف تتبع الوجه"))
      return "stop_face";

    // ── Finger PPG ────────────────────────────────────────────
    if (text.includes("تشغيل قياس الاصبع") || text.includes("ابدأ قياس الاصبع"))
      return "start_finger";
    if (text.includes("ايقاف قياس الاصبع") || text.includes("وقف قياس الاصبع"))
      return "stop_finger";

    // ── Sonar ─────────────────────────────────────────────────
    if (text.includes("تشغيل السونار") || text.includes("ابدأ السونار"))
      return "start_sonar";
    if (text.includes("ايقاف السونار") || text.includes("وقف السونار"))
      return "stop_sonar";

    // ── Audio session ─────────────────────────────────────────
    if (text.includes("تشغيل التردد") || text.includes("ابدأ الجلسة"))
      return "start_audio";
    if (text.includes("ايقاف التردد") || text.includes("اوقف الجلسة"))
      return "stop_audio";

    // ── Emergency ─────────────────────────────────────────────
    if (text.includes("طوارئ") || text.includes("نجدة"))
      return "activate_emergency";

    return "none";
  }
}
