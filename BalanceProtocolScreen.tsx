import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  EyeOff,
  HeartPulse,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

export type BalanceMode = "step_back" | "mirror" | "both";

type Phase =
  | "idle"
  | "prepare"
  | "breath_sync"
  | "eyes_closed"
  | "recall_scene"
  | "choose_path"
  | "execute"
  | "cooldown"
  | "done";

interface BalanceProtocolScreenProps {
  onClose?: () => void;
  onFinish?: (mode: BalanceMode) => void;
  defaultMode?: BalanceMode;
}

const PREPARE_MS = 15_000;
const EYES_CLOSED_MS = 20_000;
const RECALL_MS = 30_000;
const COOLDOWN_MS = 6_000;

const voiceLines = {
  intro: ["ابدأ الآن.", "انظر إلى الميزان.", "شهيق خمس.", "زفير خمس."],
  closed: ["أغمض عينيك.", "دع التنفس يعمل وحده.", "تذكّر الموقف فقط."],
  choose: ["اختر المسار.", "خطوة لورا أو مواجهة الذات."],
  stepBack: ["خذ خطوة لورا.", "لا ترد الآن."],
  mirror: ["واجه نفسك بهدوء.", "شاهد نفسك من الخارج."],
  both: ["خذ خطوة لورا.", "ثم واجه نفسك بهدوء."],
  done: ["الآن قرر.", "تكلم بهدوء.", "أنت أهدأ الآن."],
};

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function StepBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <div
      className={`rounded-full border px-3 py-1 text-[11px] font-mono uppercase tracking-[0.28em] transition-all ${
        active
          ? "border-[#00c8e8]/40 bg-[#00c8e8]/10 text-[#00c8e8]"
          : "border-white/10 bg-white/5 text-[#8ea2b7]"
      }`}
    >
      {label}
    </div>
  );
}

export function BalanceProtocolScreen({
  onClose,
  onFinish,
  defaultMode = "step_back",
}: BalanceProtocolScreenProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<BalanceMode>(defaultMode);
  const [countdown, setCountdown] = useState<number>(0);
  const [showInstruction, setShowInstruction] = useState(true);
  const [breathIn, setBreathIn] = useState(true);
  const [ringScale, setRingScale] = useState(1);
  const [voiceIndex, setVoiceIndex] = useState(0);
  const [tick, setTick] = useState(0);

  const activeLines = useMemo(() => {
    switch (phase) {
      case "prepare":
      case "breath_sync":
        return voiceLines.intro;
      case "eyes_closed":
        return voiceLines.closed;
      case "choose_path":
        return voiceLines.choose;
      case "execute":
        if (mode === "step_back") return voiceLines.stepBack;
        if (mode === "mirror") return voiceLines.mirror;
        return voiceLines.both;
      case "cooldown":
      case "done":
        return voiceLines.done;
      default:
        return ["استعد."];
    }
  }, [mode, phase]);

  useEffect(() => {
    setVoiceIndex(0);
  }, [phase, mode]);

  // Countdown timer
  useEffect(() => {
    if (phase === "idle" || phase === "done") {
      setCountdown(0);
      setRingScale(1);
      return;
    }

    const durations: Partial<Record<Phase, number>> = {
      prepare: PREPARE_MS,
      breath_sync: PREPARE_MS,
      eyes_closed: EYES_CLOSED_MS,
      recall_scene: RECALL_MS,
      cooldown: COOLDOWN_MS,
    };

    if (phase === "choose_path" || phase === "execute") return;

    const ms = durations[phase] ?? 0;
    setCountdown(Math.ceil(ms / 1000));
    const start = Date.now();
    const id = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const left = Math.max(0, Math.ceil((ms - elapsed) / 1000));
      setCountdown(left);
    }, 250);

    return () => window.clearInterval(id);
  }, [phase]);

  // Tick for ring animation
  useEffect(() => {
    if (
      phase !== "prepare" &&
      phase !== "breath_sync" &&
      phase !== "eyes_closed" &&
      phase !== "recall_scene"
    )
      return;

    const id = window.setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  // Ring scale based on breath
  useEffect(() => {
    const base =
      phase === "eyes_closed" || phase === "recall_scene" ? 1.03 : 1.0;
    const amp = phase === "prepare" ? 0.09 : phase === "breath_sync" ? 0.11 : 0.06;
    const direction = breathIn ? 1 : -1;
    setRingScale(base + direction * amp);
  }, [breathIn, phase, tick]);

  // Breath cycle — recursive setTimeout (CPU-efficient, no drift)
  useEffect(() => {
    if (
      phase === "idle" ||
      phase === "done" ||
      phase === "choose_path" ||
      phase === "execute"
    )
      return;

    const interval =
      phase === "eyes_closed" || phase === "recall_scene" ? 5000 : 4500;

    let timerId: ReturnType<typeof setTimeout>;
    const tick = () => {
      setBreathIn((v) => !v);
      timerId = setTimeout(tick, interval);
    };
    timerId = setTimeout(tick, interval);
    return () => clearTimeout(timerId);
  }, [phase]);

  // Auto-advance phases
  useEffect(() => {
    if (
      phase === "idle" ||
      phase === "done" ||
      phase === "choose_path" ||
      phase === "execute"
    )
      return;

    const durations: Partial<Record<Phase, number>> = {
      prepare: PREPARE_MS,
      breath_sync: PREPARE_MS,
      eyes_closed: EYES_CLOSED_MS,
      recall_scene: RECALL_MS,
      cooldown: COOLDOWN_MS,
    };

    const ms = durations[phase];
    if (!ms) return;

    const id = window.setTimeout(() => nextPhase(), ms);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Voice cycling for choose_path / execute
  useEffect(() => {
    if (phase !== "choose_path" && phase !== "execute") return;

    const words = activeLines;
    const id = window.setInterval(() => {
      setVoiceIndex((i) => {
        const next = i + 1;
        return next >= words.length ? i : next;
      });
    }, 2800);

    return () => window.clearInterval(id);
  }, [phase, activeLines]);

  // TTS
  const emitVoice = (text: string) => {
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "ar-EG";
      utter.rate = 0.92;
      utter.pitch = 1;
      speechSynthesis.cancel();
      speechSynthesis.speak(utter);
    } catch {
      // no-op in environments without TTS
    }
  };

  useEffect(() => {
    if (phase === "idle") return;
    emitVoice(activeLines[voiceIndex] ?? activeLines[activeLines.length - 1] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, voiceIndex]);

  const nextPhase = () => {
    setShowInstruction(true);
    setVoiceIndex(0);

    const flow: Record<Phase, Phase | null> = {
      idle: null,
      prepare: "breath_sync",
      breath_sync: "eyes_closed",
      eyes_closed: "recall_scene",
      recall_scene: "choose_path",
      choose_path: "execute",
      execute: "cooldown",
      cooldown: "done",
      done: null,
    };

    const next = flow[phase];
    if (!next) return;

    if (next === "done") {
      setPhase("done");
      onFinish?.(mode);
      return;
    }

    setPhase(next);
  };

  const start = () => {
    setPhase("prepare");
    setShowInstruction(true);
    setCountdown(Math.ceil(PREPARE_MS / 1000));
  };

  const reset = () => {
    setPhase("idle");
    setCountdown(0);
    setVoiceIndex(0);
    setShowInstruction(true);
    speechSynthesis.cancel();
  };

  const currentInstruction =
    activeLines[voiceIndex] ?? activeLines[activeLines.length - 1] ?? "";

  const progressLabel: Record<Phase, string> = {
    idle: "جاهز",
    prepare: "التهيئة",
    breath_sync: "مزامنة النفس",
    eyes_closed: "إغماض العين",
    recall_scene: "استحضار المشهد",
    choose_path: "اختيار المسار",
    execute: "التنفيذ",
    cooldown: "هدوء",
    done: "مكتمل",
  };

  const progressPct: Record<Phase, number> = {
    idle: 0,
    prepare: 12,
    breath_sync: 25,
    eyes_closed: 45,
    recall_scene: 70,
    choose_path: 82,
    execute: 92,
    cooldown: 98,
    done: 100,
  };

  const phaseCopy: Record<BalanceMode, string[]> = {
    step_back: [
      "خذ مسافة صغيرة من الموقف.",
      "اترك مساحة للوعي قبل الرد.",
      "لا ترد الآن.",
    ],
    mirror: [
      "شاهد نفسك من الخارج.",
      "لاحظ الفعل بلا حكم.",
      "تحدث بعد الهدوء.",
    ],
    both: [
      "خذ خطوة لورا.",
      "ثم واجه نفسك بهدوء.",
      "الآن قرر.",
    ],
  };

  const progress = progressPct[phase];

  return (
    <div className="min-h-screen bg-[#080c10] text-[#eef5fb]">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between rounded-[24px] border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-md">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.36em] text-[#8ea2b7]">
              AtMoS Protocol
            </div>
            <h1 className="mt-1 text-lg font-semibold text-[#f3f8fc]">
              Balance Protocol
            </h1>
          </div>
          <button
            onClick={onClose ?? reset}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#d9e4ee] transition-all hover:border-[#00c8e8]/25 hover:text-[#00c8e8]"
          >
            <X size={16} />
            إغلاق
          </button>
        </div>

        {/* Main grid */}
        <div className="grid flex-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          {/* Left panel */}
          <div className="rounded-[30px] border border-white/10 bg-gradient-to-b from-white/8 to-white/4 p-5 shadow-[0_0_60px_rgba(0,0,0,0.28)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#8ea2b7]">
                  Prepare / Restore / Choose
                </div>
                <p className="mt-2 text-sm leading-6 text-[#d9e4ee]">
                  الهدف ليس الإبطاء. الهدف شراء ثانية إدراك قبل الرد.
                </p>
              </div>

              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2">
                <HeartPulse size={14} className="text-[#00c8e8]" />
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#8ea2b7]">
                  {progressLabel[phase]}
                </span>
              </div>
            </div>

            {/* Mode badges */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <StepBadge label="5:5" active={phase !== "idle"} />
              <StepBadge label="Step Back" active={mode === "step_back"} />
              <StepBadge label="Mirror" active={mode === "mirror"} />
              <StepBadge label="Both" active={mode === "both"} />
            </div>

            {/* Breathing ring */}
            <div className="mt-6 flex justify-center">
              <div className="relative flex h-[320px] w-[320px] items-center justify-center rounded-full border border-[#00c8e8]/20 bg-[#00c8e8]/5 p-6 shadow-[0_0_80px_rgba(0,200,232,0.08)]">
                <div
                  className="absolute inset-10 rounded-full border border-white/10 bg-black/15 transition-transform duration-700 ease-in-out"
                  style={{ transform: `scale(${ringScale})` }}
                />
                <div
                  className="absolute inset-4 rounded-full border border-[#00c8e8]/15 transition-all duration-700 ease-in-out"
                  style={{ opacity: 0.6 + clamp(progress, 0, 100) / 200 }}
                />

                <div className="relative z-10 flex flex-col items-center justify-center text-center">
                  <Sparkles size={22} className="mb-2 text-[#00e070]" />
                  <div className="font-mono text-[12px] uppercase tracking-[0.4em] text-[#8ea2b7]">
                    Balance
                  </div>
                  <div className="mt-3 text-5xl font-semibold text-[#eef5fb]">
                    5:5
                  </div>
                  <div className="mt-2 text-sm text-[#c8d8e8]">
                    {countdown > 0 ? `${countdown}s` : "جاهز"}
                  </div>
                </div>
              </div>
            </div>

            {/* Instruction card */}
            <div className="mt-6 rounded-[24px] border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between">
                <div className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#8ea2b7]">
                  Current guidance
                </div>
                <button
                  onClick={() => setShowInstruction((s) => !s)}
                  className="text-xs text-[#00c8e8] transition-colors hover:text-[#8ff3ff]"
                >
                  {showInstruction ? "إخفاء" : "إظهار"}
                </button>
              </div>

              {showInstruction && (
                <div className="mt-3 space-y-2 text-sm leading-6 text-[#d9e4ee]">
                  {phaseCopy[mode].map((line, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#00e070]" />
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={start}
                disabled={phase !== "idle" && phase !== "done"}
                className="inline-flex items-center gap-2 rounded-2xl border border-[#00e070]/25 bg-[#00e070]/10 px-4 py-3 text-sm font-semibold text-[#00e070] transition-all hover:bg-[#00e070]/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play size={16} />
                ابدأ البروتوكول
              </button>
              <button
                onClick={nextPhase}
                disabled={
                  phase === "idle" ||
                  phase === "done" ||
                  phase === "choose_path" ||
                  phase === "execute"
                }
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-[#d9e4ee] transition-all hover:border-[#00c8e8]/25 hover:text-[#00c8e8] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowLeftRight size={16} />
                التالي
              </button>
              <button
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-[#d9e4ee] transition-all hover:border-[#e8a000]/25 hover:text-[#e8a000]"
              >
                <RotateCcw size={16} />
                إعادة ضبط
              </button>
            </div>
          </div>

          {/* Right panel */}
          <div className="flex flex-col gap-4">
            {/* Path selection */}
            <div className="rounded-[30px] border border-white/10 bg-white/5 p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#8ea2b7]">
                Choose path
              </div>
              <div className="mt-3 grid gap-3">
                <button
                  onClick={() => setMode("step_back")}
                  className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                    mode === "step_back"
                      ? "border-[#00c8e8]/35 bg-[#00c8e8]/10"
                      : "border-white/10 bg-black/15 hover:border-[#00c8e8]/20"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#eef5fb]">
                    <ShieldCheck size={16} className="text-[#00e070]" />
                    خطوة لورا
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[#9eb0bf]">
                    كسر الاندفاع قبل أي رد أو فعل.
                  </div>
                </button>

                <button
                  onClick={() => setMode("mirror")}
                  className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                    mode === "mirror"
                      ? "border-[#00c8e8]/35 bg-[#00c8e8]/10"
                      : "border-white/10 bg-black/15 hover:border-[#00c8e8]/20"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#eef5fb]">
                    <EyeOff size={16} className="text-[#00c8e8]" />
                    مواجهة الذات
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[#9eb0bf]">
                    رؤية النفس من الخارج بهدوء وبدون حكم.
                  </div>
                </button>

                <button
                  onClick={() => setMode("both")}
                  className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                    mode === "both"
                      ? "border-[#e8a000]/35 bg-[#e8a000]/10"
                      : "border-white/10 bg-black/15 hover:border-[#e8a000]/20"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#eef5fb]">
                    <Sparkles size={16} className="text-[#ffd36a]" />
                    الاثنان معًا
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[#9eb0bf]">
                    كسر الاندفاع ثم إصلاح النظرة الداخلية.
                  </div>
                </button>
              </div>
            </div>

            {/* Live state */}
            <div className="rounded-[30px] border border-white/10 bg-white/5 p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#8ea2b7]">
                Live state
              </div>
              <div className="mt-3 grid gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-[#8ea2b7]">
                    Phase
                  </div>
                  <div className="mt-1 text-sm text-[#eef5fb]">
                    {progressLabel[phase]}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-[#8ea2b7]">
                    Selected path
                  </div>
                  <div className="mt-1 text-sm text-[#eef5fb]">
                    {mode === "step_back"
                      ? "خطوة لورا"
                      : mode === "mirror"
                      ? "مواجهة الذات"
                      : "الاثنان معًا"}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-[#8ea2b7]">
                    Voice
                  </div>
                  <div className="mt-1 text-sm leading-6 text-[#d9e4ee]">
                    {currentInstruction}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BalanceProtocolScreen;
