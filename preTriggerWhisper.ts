// src/lib/preTriggerWhisper.ts
// ════════════════════════════════════════════════════════════════
// PreTriggerWhisper — نظام الهمسة الاستباقية قبل الانفعال
// يتدخل قبل الانفجار بـ 3-5 ثواني بكلمة واحدة هادئة
// ════════════════════════════════════════════════════════════════

import { speak } from "./atmosTTS";
import { adaptiveBaseline } from "./adaptiveBaseline";
import { triggerHaptic } from "./haptics";

const WHISPER_COOLDOWN_MS = 30_000; // 30 ثانية بين كل همسة كحد أدنى
const LEVEL2_COOLDOWN_MS  = 10_000; // 10 ثواني بين همسات Level 2

export type WhisperLevel = "level1" | "level2" | "silent";

interface WhisperState {
  lastWhisperTime: number;
  lastLevel2Time: number;
  consecutiveHighReadings: number;
  whisperCount: number;
}

// ── الكلمات القصيرة جداً — مختارة بعناية ──────────────────────
const WHISPER_WORDS_L1 = [
  "اهدى شوية",
  "خد نفس",
  "براحة",
  "تمام",
];

const WHISPER_WORDS_L2 = [
  "خطوة لوراء",
  "لحظة",
  "اصبر",
];

let _state: WhisperState = {
  lastWhisperTime: 0,
  lastLevel2Time: 0,
  consecutiveHighReadings: 0,
  whisperCount: 0,
};

/**
 * يُستدعى من useNeuralFusion أو useOmniState كل 2 ثانية
 * لتقييم إذا كانت الهمسة الاستباقية مطلوبة
 */
export function evaluatePreTrigger(params: {
  hr: number | null;
  stressIdx: number | null;
  isBalanceOpen: boolean;
  isEmergencyActive: boolean;
}): WhisperLevel {
  const { hr, stressIdx, isBalanceOpen, isEmergencyActive } = params;

  // لا همسة إذا البروتوكول أو الطوارئ نشطة
  if (isBalanceOpen || isEmergencyActive) {
    _state.consecutiveHighReadings = 0;
    return "silent";
  }

  const now = Date.now();
  let isHighState = false;

  // تحقق من الخط الأساسي الشخصي
  if (hr != null && adaptiveBaseline.isAbovePersonalBaseline(hr)) {
    isHighState = true;
  }
  if (stressIdx != null && adaptiveBaseline.isHighStress(stressIdx)) {
    isHighState = true;
  }

  if (!isHighState) {
    _state.consecutiveHighReadings = Math.max(0, _state.consecutiveHighReadings - 1);
    return "silent";
  }

  _state.consecutiveHighReadings++;

  // Level 1: همسة خفيفة بعد 2 قراءات متتالية مرتفعة
  if (
    _state.consecutiveHighReadings >= 2 &&
    now - _state.lastWhisperTime > WHISPER_COOLDOWN_MS
  ) {
    const word = WHISPER_WORDS_L1[_state.whisperCount % WHISPER_WORDS_L1.length];
    speak(word, "calm");
    triggerHaptic("start"); // اهتزاز خفيف جداً
    _state.lastWhisperTime = now;
    _state.whisperCount++;
    return "level1";
  }

  // Level 2: همسة أقوى بعد 4 قراءات مرتفعة متتالية
  if (
    _state.consecutiveHighReadings >= 4 &&
    now - _state.lastLevel2Time > LEVEL2_COOLDOWN_MS
  ) {
    const word = WHISPER_WORDS_L2[_state.whisperCount % WHISPER_WORDS_L2.length];
    speak(word, "calm");
    triggerHaptic("warning");
    _state.lastLevel2Time = now;
    _state.lastWhisperTime = now;
    _state.whisperCount++;
    return "level2";
  }

  return "silent";
}

/** إعادة ضبط العداد بعد تفعيل بروتوكول أو هدوء حقيقي */
export function resetPreTrigger(): void {
  _state.consecutiveHighReadings = 0;
}

export function getPreTriggerState(): Readonly<WhisperState> {
  return { ..._state };
}
