import React, { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Bot, Volume2, VolumeX } from "lucide-react";

// ── Physiologically-adaptive TTS ─────────────────────────────────────────────
// Modulates pitch and rate based on stressIdx and coherenceIdx:
//   High stress (>70) → slower rate (0.78) + slightly lower pitch (0.92) → calming
//   High coherence (>60) → normal rate (1.0) + balanced pitch (1.0) → affirming
//   Default → natural speech rate (0.9) 
// Reference: affective speech synthesis literature (Murray & Arnott 1993)
function speakAdaptive(text: string, stressIdx: number | null, coherenceIdx?: number | null) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'ar-SA';

  // Adaptive modulation based on physiological state
  if (stressIdx && stressIdx > 70) {
    // High stress — speak slowly and calmly to guide user to relax
    utt.rate  = 0.78;
    utt.pitch = 0.92;
  } else if (coherenceIdx && coherenceIdx > 60) {
    // High coherence — user is in a good state, affirming normal speech
    utt.rate  = 1.0;
    utt.pitch = 1.02;
  } else {
    // Default — slightly slower than system default for clarity
    utt.rate  = 0.90;
    utt.pitch = 1.0;
  }
  utt.volume = 0.85;

  // Prefer Arabic voice if available
  const voices = window.speechSynthesis.getVoices();
  const arVoice = voices.find(v => v.lang.startsWith('ar'));
  if (arVoice) utt.voice = arVoice;

  window.speechSynthesis.speak(utt);
}

// ── Push Notification (background awareness) ─────────────────────
async function sendNotification(title: string, body: string) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: "/icon.svg", tag: "atmos-guide" });
  }
}

interface AIGuideProps {
  bpm: number | null;
  hrv: number | null;
  stressIdx: number | null;
  coherenceIdx?: number | null;
  breathRate: number | null;
  breathDepth?: number | null;
  microExpr?: number | null;
  // HRV extended
  sdnn?: number | null;
  pnn50?: number | null;
  heartCoherence?: number | null;
  sqiQuality?: string;
  deceptionProb?: number | null;
  isContactPPG: boolean;
  isRemotePPG: boolean;
  isSonarActive: boolean;
  isAudioPlaying: boolean;
  polygraphPhase: "idle" | "baseline" | "testing";
  isShaking?: boolean;
  signalStatus?: "idle" | "no-skin" | "unstable" | "stable";
}

export function AIGuide({
  bpm, hrv, stressIdx, coherenceIdx,
  breathRate, breathDepth, microExpr,
  sdnn, pnn50, heartCoherence, sqiQuality, deceptionProb,
  isContactPPG, isRemotePPG, isSonarActive, isAudioPlaying,
  polygraphPhase, isShaking, signalStatus,
}: AIGuideProps) {
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState("✨");
  const [isVisible, setIsVisible] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(false); // off by default — user opt-in
  const prevMessageRef = useRef("");

  useEffect(() => {
    let newMessage = "";
    let newTone = "✨";

    if (isShaking) {
      newMessage = "ألاحظ حركة زائدة. يرجى الثبات لضمان دقة القياسات الحيوية.";
      newTone = "⚠️";
    } else if (signalStatus === "no-skin" && isContactPPG) {
      newMessage =
        "لم أتمكن من اكتشاف بشرتك. تأكد من وضع إصبعك بالكامل على الكاميرا والفلاش.";
      newTone = "🔍";
    } else if (signalStatus === "no-skin" && isRemotePPG) {
      newMessage =
        "لم أتمكن من رؤية وجهك بوضوح. تأكد من الإضاءة الجيدة وأن وجهك داخل الإطار.";
      newTone = "🔍";
    } else if (signalStatus === "unstable" && (isContactPPG || isRemotePPG)) {
      newMessage = "الإشارة غير مستقرة. حاول تقليل الحركة والتنفس بهدوء.";
      newTone = "⚠️";
    } else if (polygraphPhase === "baseline") {
      newMessage =
        "جاري أخذ القراءة الأساسية. أرجو منك الثبات والتنفس بهدوء لمدة 20 ثانية.";
      newTone = "🛡️";
    } else if (polygraphPhase === "testing") {
      newMessage =
        "الآن، اقرأ الجملة المعروضة بصوت واضح. أنا أحلل نبرة صوتك وتعبيرات وجهك.";
      newTone = "👁️";
    } else if (isContactPPG && !bpm) {
      newMessage =
        "ممتاز! ضع إصبعك برفق على الكاميرا الخلفية والفلاش. حافظ على ثبات يدك حتى نلتقط نبضك بدقة.";
      newTone = "🤍";
    } else if (isRemotePPG && !bpm) {
      newMessage =
        "رائع! انظر إلى الكاميرا الأمامية وتأكد من إضاءة وجهك جيداً. حافظ على ثباتك.";
      newTone = "🤍";
    } else if (isSonarActive && !breathRate) {
      newMessage = "جاري تحليل نمط تنفسك عبر الصوت. تنفس بشكل طبيعي.";
      newTone = "🌊";
    } else if (bpm && bpm > 0 && !isAudioPlaying) {
      if (stressIdx && stressIdx > 80) {
        newMessage = `نبضك ${bpm} BPM والتوتر مرتفع جداً (${stressIdx}%). أنصح بفتح بروتوكول التوازن — قل "خطوة لوراء" أو اضغط ⚖️`;
        newTone = "🌿";
        sendNotification("AtMoS — تنبيه", `مستوى التوتر مرتفع (${stressIdx}%). خذ نفساً.`);
      } else if (stressIdx && stressIdx > 60) {
        newMessage = `نبضك ${bpm} BPM ومستوى التوتر مرتفع (${stressIdx}%). اختر تردد 432Hz أو 174Hz. يمكنك إزالة إصبعك الآن.`;
        newTone = "🌿";
      } else if (sdnn && sdnn < 20) {
        newMessage = `SDNN منخفض (${sdnn}ms) — يشير لاحتمال إجهاد الجهاز العصبي. انصح بجلسة تنفس هادئة ونوم كافٍ.`;
        newTone = "⚠️";
      } else if (pnn50 !== null && pnn50 !== undefined && pnn50 < 5) {
        newMessage = `pNN50 منخفض (${pnn50}%) — المرونة العاطفية للجهاز العصبي تحتاج دعم. جرب تردد 10Hz ألفا.`;
        newTone = "🌊";
      } else if (heartCoherence && heartCoherence > 60) {
        newMessage = `تماسك القلب ممتاز (${heartCoherence}%)! هذا مؤشر على توازن الجهاز العصبي. وقت مثالي لجلسة تركيز 40Hz.`;
        newTone = "⚡";
      } else if (microExpr && microExpr > 60) {
        newMessage = `ألاحظ توتراً في تعابير وجهك الدقيقة. خذ نفساً عميقاً وحاول الاسترخاء.`;
        newTone = "👁️";
      } else if (hrv && hrv > 50) {
        newMessage = `ممتاز! نبضك ${bpm} BPM وHRV جيد (${hrv}ms). يمكنك تجربة ترددات التركيز (40Hz).`;
        newTone = "⚡";
      } else {
        newMessage = `التقطنا قياساتك! (النبض: ${bpm}). اختر التردد المناسب وابدأ الجلسة.`;
        newTone = "✨";
      }
    } else if (isAudioPlaying) {
      if (stressIdx && stressIdx > 70) {
        newMessage =
          "اهدى… كل حاجة تحت السيطرة. ركز في الأرض تحتك… نفس هادي… زفير أطول.";
        newTone = "🌿";
      } else if (breathDepth && breathDepth < 30) {
        newMessage =
          "تنفسك يبدو سطحياً. حاول التنفس بعمق أكبر من بطنك لزيادة الاسترخاء.";
        newTone = "🌊";
      } else if (hrv && hrv > 50) {
        newMessage =
          "أنا هنا معك… خطوة بخطوة. وجودك هنا كفاية. استمر في هذا التناغم.";
        newTone = "🤍";
      } else {
        newMessage =
          "الجلسة مستمرة. استرخِ ودع الترددات تتناغم مع جسدك. أنا أراقب استجابتك الحيوية.";
        newTone = "🌌";
      }
    } else {
      newMessage =
        'مرحباً بك في OmniVerse! أنا "نور"، مرشدتك الذكية. لنبدأ بأخذ قياساتك الحيوية. اضغط على أي من أزرار القياس بالأسفل (مثل قياس نبض الإصبع).';
      newTone = "✨";
    }

    if (newMessage !== message) {
      setMessage(newMessage);
      setTone(newTone);
      setIsVisible(true);
      // Adaptive TTS — only speaks when user opted in AND message actually changed
      if (voiceEnabled && newMessage !== prevMessageRef.current) {
        prevMessageRef.current = newMessage;
        speakAdaptive(newMessage, stressIdx, coherenceIdx);
      }
    }
  }, [voiceEnabled, coherenceIdx,
    bpm, hrv, stressIdx, breathRate, breathDepth, microExpr,
    sdnn, pnn50, heartCoherence, sqiQuality, deceptionProb,
    isContactPPG, isRemotePPG, isSonarActive,
    isAudioPlaying, polygraphPhase, isShaking, signalStatus,
  ]);

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="fixed bottom-24 right-4 z-50 max-w-xs"
      >
        <div className="relative bg-slate-900/95 backdrop-blur-xl border border-cyan-500/40 p-4 rounded-2xl shadow-[0_0_40px_rgba(0,229,255,0.2)] text-right">
          <button
            onClick={() => setIsVisible(false)}
            className="absolute top-2 left-2 text-slate-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
          {/* Voice toggle — user opts in to adaptive TTS */}
          <button
            onClick={() => {
              setVoiceEnabled(v => !v);
              if (!voiceEnabled && message) speakAdaptive(message, stressIdx, coherenceIdx);
            }}
            title={voiceEnabled ? 'إيقاف الصوت' : 'تشغيل قراءة الرسائل بصوت'}
            className="absolute top-2 left-8 text-slate-400 hover:text-cyan-400 transition-colors"
          >
            {voiceEnabled ? <Volume2 size={14} className="text-cyan-400" /> : <VolumeX size={14} />}
          </button>

          <div className="flex items-start gap-3 mb-2">
            <div className="relative flex-shrink-0 mt-1">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-[0_0_15px_rgba(0,229,255,0.5)] text-xl">
                {tone}
              </div>
              <motion.div
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute inset-0 rounded-full border border-cyan-400"
              />
            </div>
            <div>
              <h4 className="text-cyan-400 font-bold text-sm flex items-center gap-1">
                <Bot size={14} />
                نور (المرشد الذكي)
              </h4>
              <p className="text-slate-200 text-sm leading-relaxed mt-1 font-medium">
                {message}
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
