/**
 * @license SPDX-License-Identifier: Apache-2.0
 * App.tsx — OmniVerse Core Shell v3 Sovereign
 * Lean orchestration layer: all state lives in useOmniState.
 */
import React, { useCallback } from "react";
import {
  Activity, Camera, Stethoscope,
  Play, Square, AlertTriangle,
  ShieldAlert, MessageSquare, Settings, Bot,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// ── Hooks & engines ───────────────────────────────────────────────
import { useOmniState }                          from "./hooks/useOmniState";
import { useEmotion, EmotionProvider }           from "./contexts/EmotionContext";
import { EmergencyProvider }                     from "./contexts/EmergencyContext";
import { useNeuralFusion }                       from "./hooks/useNeuralFusion";
import { useAtmosVoice }                         from "./hooks/useAtmosVoice";

// ── Components ────────────────────────────────────────────────────
import { ErrorBoundary }                         from "./components/ErrorBoundary";
import { AIGuide }                               from "./components/AIGuide";
import { BioHistoryChart }                       from "./components/BioHistoryChart";
import { Onboarding }                            from "./components/Onboarding";
import { FeedbackModal }                         from "./components/FeedbackModal";
import { SettingsModal, getDefaultSessionDuration } from "./components/SettingsModal";
import { OmniPuppet }                            from "./screens/OmniPuppet";
import { NexusEmergencyPanel }                   from "./screens/NexusEmergencyPanel";
import { BioScanner }                            from "./screens/BioScanner";
import { BalanceProtocolScreen }                 from "./screens/BalanceProtocolScreen";

// ── Utilities ──────────────────────────────────────────────────────
import { generateMedicalPDF }                    from "./engines/pdfExport";
import OmniLogo from './assets/contact-ppg.png';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

// ═══════════════════════════════════════════════════════════════════
export default function App() {
  return (
    <EmergencyProvider>
      <EmotionProvider>
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </EmotionProvider>
    </EmergencyProvider>
  );
}

// ═══════════════════════════════════════════════════════════════════
function AppContent() {
  const s = useOmniState();
  const { emotion } = useEmotion();

  // Neural fusion watches for emergency triggers
  useNeuralFusion(s.bpm, emotion, s.isContactPPG || s.isRemotePPG || s.isSonarActive);

  // Voice commands
  const atmosVoice = useAtmosVoice({
    startFace:    () => { if (!s.isRemotePPG)   s.toggleRemotePPG();  },
    stopFace:     () => { if (s.isRemotePPG)    s.toggleRemotePPG();  },
    startFinger:  () => { if (!s.isContactPPG)  s.toggleContactPPG(); },
    stopFinger:   () => { if (s.isContactPPG)   s.toggleContactPPG(); },
    startSonar:   () => { if (!s.isSonarActive) s.toggleSonar();      },
    stopSonar:    () => { if (s.isSonarActive)  s.toggleSonar();      },
    startAudio:   () => { if (!s.isAudioPlaying) s.toggleAudio();     },
    stopAudio:    () => { if (s.isAudioPlaying)  s.toggleAudio();     },
    openBalance:  () => s.openBalance("step_back"),
    closeBalance: () => s.closeBalance(),
    stepBackMode: () => s.openBalance("step_back"),
    mirrorMode:   () => s.openBalance("mirror"),
  });

  // PDF export handler
  const handleExportPDF = useCallback(async () => {
    const blob = await generateMedicalPDF({
      bpm: s.bpm, hrv: s.hrv, sdnn: s.sdnn, pnn50: s.pnn50,
      heartCoherence: s.heartCoherence, breathRate: s.breathRate,
      breathDepth: s.breathDepth, stressIdx: s.stressIdx,
      vitalityIdx: s.vitalityIdx, focusIdx: s.focusIdx,
      coherenceIdx: s.coherenceIdx, sqiQuality: s.sqiQuality,
      sessionDuration: s.sessionSec,
      protocolName: s.selectedProto?.name ?? "",
    });
    // Web Share API — share to WhatsApp/Email if supported
    if (blob && navigator.canShare?.({ files: [blob] })) {
      try {
        await navigator.share({
          title: "تقرير AtMoS الصحي",
          text: "تقرير صحي سيادي من AtMoS OmniVerse",
          files: [blob],
        });
        return;
      } catch { /* fallback to download */ }
    }
    // Fallback: download
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement("a");
      a.href     = url;
      a.download = `AtMoS_Report_${new Date().toISOString().slice(0,10)}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [s]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec/60).toString().padStart(2,"0");
    const ss = (sec%60).toString().padStart(2,"0");
    return `${m}:${ss}`;
  };

  // ── Render ──────────────────────────────────────────────────────
  return (
    <>
      {/* ── Emergency overlay ── */}
      <NexusEmergencyPanel />

      {/* ── Balance Protocol ── */}
      {s.showBalance && (
        <div className="fixed inset-0 z-[150] bg-black/95 backdrop-blur-xl overflow-y-auto flex flex-col">
          <BalanceProtocolScreen
            defaultMode={s.balanceDefaultMode}
            onClose={s.closeBalance}
            onFinish={s.closeBalance}
          />
        </div>
      )}

      {/* ── OmniPuppet ── */}
      {s.showPuppet && (
        <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-xl overflow-y-auto flex flex-col">
          <div className="p-4 flex justify-end">
            <button onClick={() => s.setShowPuppet(false)}
              className="px-4 py-2 bg-red-500/20 text-red-500 font-bold rounded-lg border border-red-500/30 hover:bg-red-500/40 transition-colors">
              إغلاق والعودة للقياسات
            </button>
          </div>
          <div className="flex-1 w-full"><OmniPuppet /></div>
        </div>
      )}

      {/* ── Voice button ── */}
      <button
        onClick={() => atmosVoice.isListening ? atmosVoice.stopListening() : atmosVoice.startListening()}
        title={atmosVoice.wakeActive ? "أتموس يستمع..." : atmosVoice.isListening ? "إيقاف" : "تفعيل AtMoS Voice"}
        className={cn(
          "fixed bottom-6 left-6 z-[100] w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-xl border transition-all active:scale-90",
          atmosVoice.wakeActive
            ? "bg-cyan-500 border-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.5)] animate-pulse"
            : atmosVoice.isListening
            ? "bg-[#00c8e8]/20 border-[#00c8e8] text-[#00c8e8]"
            : "bg-[#0d1318] border-[#1e2d3d] text-[#3d5570] hover:border-[#00c8e8]/50"
        )}
      >
        {atmosVoice.wakeActive ? "🔵" : atmosVoice.isListening ? "🎙️" : "🎤"}
      </button>

      {/* ── Contact PPG cinematic bg ── */}
      {s.isContactPPG && (
        <div className="fixed inset-0 z-[-1] bg-cover bg-center bg-no-repeat opacity-40 pointer-events-none"
          style={{ backgroundImage: `url(${OmniLogo})`, filter:"contrast(1.2) brightness(0.8)" }} />
      )}

      {/* ── Modals ── */}
      {s.showOnboarding && <Onboarding onComplete={() => {
        localStorage.setItem("omni_hasCompletedOnboarding","true");
        s.setShowOnboarding(false);
      }} />}

      <FeedbackModal isOpen={s.showFeedback} onClose={() => s.setShowFeedback(false)}
        bioData={{ bpm: s.bpm, hrv: s.hrv, breathRate: s.breathRate, stressIdx: s.stressIdx }} />

      <SettingsModal isOpen={s.showSettings} onClose={() => {
        s.setShowSettings(false);
        const np = getDefaultSessionDuration(); // refresh
        const newProtos = s.protocols; // already updated via setProtocols
        const curr = s.selectedProto?.id;
        const updated = newProtos.find(p => p.id === curr);
        if (updated) s.setSelectedProto(updated);
      }} />

      <AIGuide
        bpm={s.bpm} hrv={s.hrv} stressIdx={s.stressIdx}
        coherenceIdx={s.coherenceIdx} breathRate={s.breathRate}
        breathDepth={s.breathDepth} microExpr={s.microExpr}
        sdnn={s.sdnn} pnn50={s.pnn50}
        heartCoherence={s.heartCoherence} sqiQuality={s.sqiQuality}
        deceptionProb={s.deceptionProb}
        isContactPPG={s.isContactPPG} isRemotePPG={s.isRemotePPG}
        isSonarActive={s.isSonarActive} isAudioPlaying={s.isAudioPlaying}
        polygraphPhase={s.coherencePhase === "active" ? "testing" : s.coherencePhase}
        isShaking={s.isShaking} signalStatus={s.signalStatus}
      />

      {/* ══ MAIN LAYOUT ══════════════════════════════════════════ */}
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Header ── */}
        <header className="flex items-center justify-between border-b border-[#1e2d3d] pb-4 mb-6">
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full transition-all duration-500",
              s.isContactPPG || s.isRemotePPG || s.isSonarActive
                ? "bg-[#00e070] shadow-[0_0_8px_#00e070]" : "bg-[#3d5570]"
            )} />
            <h1 className="font-mono text-xs tracking-widest text-[#6a8099] uppercase">OmniVerse Core</h1>
            {s.wakeLockActive && (
              <span className="font-mono text-[9px] text-[#00e070] bg-[#00e070]/10 px-2 py-0.5 rounded border border-[#00e070]/20">
                🔒 شاشة مفتوحة
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* PDF Export */}
            <button onClick={handleExportPDF}
              className="p-2 rounded-full bg-[#e8a000]/10 text-[#e8a000] border border-[#e8a000]/30 hover:bg-[#e8a000]/30 transition-colors flex items-center gap-1 text-sm font-bold"
              title="تصدير / مشاركة تقرير طبي">
              <span>📄</span>
              <span className="hidden sm:inline text-xs">تقرير</span>
            </button>
            {/* Balance Protocol */}
            <button onClick={() => s.openBalance("step_back")}
              className="p-2 rounded-full bg-[#00e070]/10 text-[#00e070] border border-[#00e070]/30 hover:bg-[#00e070]/30 transition-colors flex items-center gap-1 text-sm font-bold"
              title="بروتوكول التوازن">
              <span>⚖️</span>
              <span className="hidden sm:inline text-xs">توازن</span>
            </button>
            {/* OmniPuppet */}
            <button onClick={() => s.setShowPuppet(true)}
              className="p-2 rounded-full bg-[#00c8e8]/10 text-[#00c8e8] border border-[#00c8e8]/30 hover:bg-[#00c8e8]/30 transition-colors flex items-center gap-1 text-sm font-bold"
              title="الكيان التفاعلي">
              <Bot size={16} />
              <span className="hidden sm:inline text-xs">Puppet</span>
            </button>
            <button onClick={() => s.setShowSettings(true)}
              className="text-[#6a8099] hover:text-[#00c8e8] transition-colors" title="الإعدادات">
              <Settings size={16} />
            </button>
            <button onClick={() => s.setShowFeedback(true)}
              className="text-[#6a8099] hover:text-[#00c8e8] transition-colors" title="ملاحظات">
              <MessageSquare size={16} />
            </button>
            <span className="font-mono text-[10px] text-[#00c8e8] bg-[#00c8e8]/10 border border-[#00c8e8]/20 px-2 py-1 rounded hidden sm:inline-block">
              v3 Sovereign
            </span>
          </div>
        </header>

        {/* ── Alerts ── */}
        {s.errorMsg && (
          <div className="bg-[#e04040]/10 border border-[#e04040] rounded-lg p-3 text-xs text-[#e04040] flex items-start gap-2 max-w-md mx-auto">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /><span>{s.errorMsg}</span>
          </div>
        )}

        {s.lightCalibScore && (
          <div className={cn("border rounded-lg p-3 text-xs flex flex-col gap-2 max-w-md mx-auto",
            s.lightCalibScore.score > 70 ? "bg-[#00e070]/10 border-[#00e070] text-[#00e070]"
            : s.lightCalibScore.score > 40 ? "bg-[#e8a000]/10 border-[#e8a000] text-[#e8a000]"
            : "bg-[#e04040]/10 border-[#e04040] text-[#e04040]"
          )}>
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div><strong>معايرة الإضاءة ({Math.round(s.lightCalibScore.score)}%):</strong>{" "}{s.lightCalibScore.hint}</div>
            </div>
            <div className="w-full bg-[#131a22] rounded-full h-1.5 border border-[#1e2d3d] overflow-hidden">
              <div className={cn("h-1.5 rounded-full transition-all duration-300",
                s.lightCalibScore.score > 70 ? "bg-[#00e070]"
                : s.lightCalibScore.score > 40 ? "bg-[#e8a000]" : "bg-[#e04040]"
              )} style={{ width:`${Math.max(0,Math.min(100,s.lightCalibScore.score))}%` }} />
            </div>
          </div>
        )}

        {s.bpm && (s.bpm > 140 || s.bpm < 50) && s.conf > 60 && (
          <div className="bg-[#e04040]/20 border border-[#e04040] rounded-xl p-4 text-[#e04040] flex items-center gap-3 max-w-md mx-auto animate-pulse">
            <AlertTriangle size={24} className="shrink-0" />
            <div>
              <div className="font-bold text-sm">تحذير طبي</div>
              <div className="text-xs opacity-90">
                معدل نبض القلب {s.bpm > 140 ? "مرتفع" : "منخفض"} جداً ({s.bpm} BPM)
              </div>
            </div>
          </div>
        )}

        {/* ── Main Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── LEFT: Bio + Controls ── */}
          <div className="lg:col-span-7 space-y-6">

            {/* Coherence Section */}
            {s.isCoherenceMode && (
              <section className="bg-[#1a0f14] border border-[#00c8e8]/30 rounded-xl p-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#00c8e8]/50 to-transparent" />
                <h2 className="font-mono text-[10px] tracking-widest text-[#00c8e8] uppercase mb-4 flex items-center gap-2 after:content-[''] after:flex-1 after:h-[1px] after:bg-[#00c8e8]/20">
                  <ShieldAlert size={14} />تحليل الاتساق الفسيولوجي
                </h2>
                {s.coherencePhase === "baseline" ? (
                  <div className="text-center py-6">
                    <div className="animate-pulse text-[#00c8e8] text-sm mb-2">جاري أخذ القراءة الأساسية...</div>
                    <div className="text-xs text-[#6a8099] mb-4">يرجى الثبات والتنفس بهدوء (10-20 ثانية)</div>
                    <div className="w-full bg-[#131a22] rounded-full h-1.5 border border-[#1e2d3d] overflow-hidden">
                      <div className="h-1.5 bg-[#00c8e8] rounded-full animate-[progress_20s_linear_forwards]" />
                    </div>
                  </div>
                ) : s.coherencePhase === "active" ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                      <MetricCard label="توتر الصوت"   value={Math.round(s.voiceStress)} unit="%" color="cyan" />
                      <MetricCard label="تعبيرات لاإرادية" value={Math.round(s.microExpr)} unit="%" color="cyan" />
                      <MetricCard label="مؤشر الاتساق" value={s.coherenceIdx} unit="%"
                        color={s.coherenceIdx && s.coherenceIdx > 60 ? "green" : s.coherenceIdx && s.coherenceIdx > 30 ? "amber" : "red"} />
                    </div>
                    {/* Deception Probability */}
                    {s.deceptionProb != null && (
                      <div className="bg-[#0d1318] border border-[#1e2d3d] rounded-lg p-3">
                        <div className="text-xs text-[#6a8099] mb-2">احتمالية عدم الاتساق الداخلي (Congruence Detector)</div>
                        <div className="flex items-center gap-3">
                          <div className={cn("font-mono text-2xl font-bold",
                            s.deceptionProb < 30 ? "text-[#00e070]" : s.deceptionProb < 60 ? "text-[#e8a000]" : "text-[#e04040]"
                          )}>{s.deceptionProb}%</div>
                          <div className="flex-1 bg-[#131a22] rounded-full h-2 border border-[#1e2d3d] overflow-hidden">
                            <div className={cn("h-2 rounded-full transition-all",
                              s.deceptionProb < 30 ? "bg-[#00e070]" : s.deceptionProb < 60 ? "bg-[#e8a000]" : "bg-[#e04040]"
                            )} style={{ width:`${s.deceptionProb}%` }} />
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="w-full bg-[#131a22] rounded-full h-2.5 border border-[#1e2d3d] overflow-hidden">
                      <div className={cn("h-2.5 rounded-full transition-all duration-500",
                        s.coherenceIdx && s.coherenceIdx > 60 ? "bg-[#00e070]"
                        : s.coherenceIdx && s.coherenceIdx > 30 ? "bg-[#e8a000]" : "bg-[#e04040]"
                      )} style={{ width:`${s.coherenceIdx || 0}%` }} />
                    </div>
                  </div>
                ) : null}
                <button onClick={s.stopCoherenceAnalysis}
                  className="w-full mt-4 p-2 rounded-lg border border-[#00c8e8]/30 text-[#00c8e8] text-xs hover:bg-[#00c8e8]/10 transition-all">
                  إيقاف التحليل
                </button>
              </section>
            )}

            {/* Bio Section */}
            <section className="bg-[#0d1318] border border-[#1e2d3d] rounded-xl p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#263545] to-transparent" />
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-mono text-[10px] tracking-widest text-[#3d5570] uppercase flex items-center gap-2 after:content-[''] after:flex-1 after:h-[1px] after:bg-[#1e2d3d] flex-1">
                  القياسات الحيوية المدمجة (Bayesian Fusion)
                </h2>
                <button onClick={() => s.setIsCoherenceUI(!s.isCoherenceUI)}
                  className={cn("mr-2 px-2 py-1 rounded text-[10px] font-mono border transition-all",
                    s.isCoherenceUI
                      ? "bg-[#00c8e8]/20 border-[#00c8e8] text-[#00c8e8]"
                      : "border-[#1e2d3d] text-[#3d5570] hover:border-[#00c8e8]/40"
                  )} title="تبديل طريقة العرض">
                  {s.isCoherenceUI ? "عرض كامل" : "عرض مضغوط"}
                </button>
              </div>

              {/* ── Compact view (BioScanner) ── */}
              {s.isCoherenceUI ? (
                <BioScanner
                  videoRef={s.videoRef}
                  overlayCanvasRef={s.overlayCanvasRef}
                  waveCanvasRef={s.waveCanvasRef}
                  isContactPPG={s.isContactPPG}
                  isRemotePPG={s.isRemotePPG}
                  isSonarActive={s.isSonarActive}
                  toggleContactPPG={s.toggleContactPPG}
                  toggleRemotePPG={s.toggleRemotePPG}
                  toggleSonar={s.toggleSonar}
                  bpm={s.bpm} hrv={s.hrv} conf={s.conf}
                  breathRate={s.breathRate} breathRegularity={s.breathRegularity}
                  breathDepth={s.breathDepth} stressIdx={s.stressIdx}
                  vitalityIdx={s.vitalityIdx} focusIdx={s.focusIdx}
                  coherenceIdx={s.coherenceIdx} hasSignal={s.hasSignal}
                  signalStatus={s.signalStatus} lightCalibScore={s.lightCalibScore}
                  voiceStress={s.voiceStress}
                />
              ) : (
              <>
              {/* Row 1: Core vitals */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <MetricCard label="نبض القلب" value={s.bpm} unit="BPM" color="green" status={s.signalStatus} />
                <MetricCard label="HRV-RMSSD" value={s.hrv} unit="ms" color="cyan" />
                <MetricCard label="التنفس" value={s.breathRate} unit="br/min" color="amber" />
                <MetricCard label="عمق التنفس" value={s.breathDepth} unit="%" color="amber" />
              </div>

              {/* Row 2: Indices */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
                <MetricCard label="مؤشر التوتر"     value={s.stressIdx}   unit="%" color="cyan" />
                <MetricCard label="مؤشر الحيوية"    value={s.vitalityIdx} unit="%" color="green" />
                <MetricCard label="التركيز"          value={s.focusIdx}    unit="%" color="amber" />
                <MetricCard label="التوافق القلبي"   value={s.coherenceIdx} unit="%" color="cyan" />
                <MetricCard label="التعابير الدقيقة" value={s.microExpr ? Math.round(s.microExpr) : null} unit="%" color="cyan" />
              </div>

              {/* Row 3: HRV Extended */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <MetricCard label="SDNN" value={s.sdnn} unit="ms" color="cyan" />
                <MetricCard label="pNN50" value={s.pnn50} unit="%" color="amber" />
                <MetricCard label="تماسك القلب" value={s.heartCoherence} unit="%" color="green" />
                <div className="bg-[#131a22] border border-[#1e2d3d] rounded-lg p-3 text-center">
                  <div className={cn("font-mono text-sm font-medium leading-none mb-1",
                    s.sqiQuality === "excellent" ? "text-[#00e070]"
                    : s.sqiQuality === "good"    ? "text-[#00c8e8]"
                    : s.sqiQuality === "poor"    ? "text-[#e8a000]"
                    : "text-[#3d5570]"
                  )}>
                    {s.sqiQuality === "excellent" ? "ممتاز" : s.sqiQuality === "good" ? "جيد"
                     : s.sqiQuality === "poor" ? "ضعيف" : "--"}
                  </div>
                  <div className="text-[10px] text-[#6a8099] uppercase tracking-wider">SQI جودة الإشارة</div>
                </div>
              </div>

              {/* Waveform */}
              <div className="relative h-16 bg-[#131a22] border border-[#1e2d3d] rounded-lg overflow-hidden mb-4">
                <canvas ref={s.waveCanvasRef} className="absolute inset-0 w-full h-full" width={400} height={64} />
                <span className={cn(
                  "absolute top-1.5 right-2 font-mono text-[9px] z-10 px-2 py-0.5 rounded transition-colors",
                  s.isShaking ? "bg-[#e04040]/20 text-[#e04040]"
                  : s.signalStatus === "no-skin"  ? "bg-[#e8a000]/20 text-[#e8a000]"
                  : s.signalStatus === "unstable" ? "bg-[#e04040]/20 text-[#e04040]"
                  : s.signalStatus === "stable"   ? "bg-[#00e070]/10 text-[#00e070]"
                  : s.hasSignal ? "bg-[#00e070]/10 text-[#00e070]" : "bg-[#3d5570]/10 text-[#3d5570]"
                )}>
                  {s.isShaking ? "⚠️ حركة زائدة"
                  : s.signalStatus === "no-skin"  ? "⚠️ لم يُكتشف بشرة"
                  : s.signalStatus === "unstable" ? "⚠️ إشارة غير مستقرة"
                  : s.signalStatus === "stable"   ? "✓ إشارة مستقرة"
                  : s.hasSignal ? "✓ إشارة ملتقطة" : "جاري البحث عن إشارة..."}
                </span>
                {s.hasSignal && s.bpm !== null && (
                  <span className="absolute bottom-1.5 left-2 font-mono text-[10px] z-10 px-2 py-0.5 rounded bg-[#0d1318]/80 text-[#00e070] border border-[#00e070]/30">
                    ♥ {s.bpm} BPM · conf {Math.round(s.conf)}%
                  </span>
                )}
              </div>

              {/* Camera feed (remote PPG) */}
              <div className={cn("relative rounded-lg overflow-hidden border border-[#1e2d3d] mb-4 bg-black transition-all",
                s.isRemotePPG ? "h-64 sm:h-80" : "h-0 border-none mb-0"
              )}>
                <video ref={s.videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
                <canvas ref={s.overlayCanvasRef} className="absolute inset-0 w-full h-full object-cover" width={640} height={480} />
                <div className="absolute bottom-2 left-2 right-2 text-center text-[10px] text-white bg-black/50 p-1 rounded">
                  يرجى الثبات أمام الكاميرا لضبط النقاط
                </div>
              </div>

              {/* Sensor controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {!s.isCoherenceMode && (
                  <button onClick={s.startCoherenceAnalysis}
                    className="w-full sm:col-span-2 p-3 rounded-lg border border-[#00c8e8]/50 bg-[#00c8e8]/5 text-[#00c8e8] flex items-center justify-center gap-2 text-sm font-bold hover:bg-[#00c8e8]/10 transition-all mb-1">
                    <ShieldAlert size={16} />بدء تحليل الاتساق الداخلي
                  </button>
                )}
                <SensorButton onClick={s.toggleRemotePPG} active={s.isRemotePPG}
                  icon={<Activity size={16}/>} labelOff="تتبع الوجه عن بعد" labelOn="إيقاف تتبع الوجه" />
                <SensorButton onClick={s.toggleContactPPG} active={s.isContactPPG}
                  icon={<Camera size={16}/>} labelOff="قياس نبض الإصبع" labelOn="إيقاف قياس الإصبع" />
                <button onClick={s.toggleSonar}
                  className={cn("w-full sm:col-span-2 p-3 rounded-lg border flex items-center justify-center gap-2 text-sm transition-all",
                    s.isSonarActive ? "bg-[#e04040]/10 border-[#e04040] text-[#e04040]"
                    : "border-[#263545] hover:border-[#00c8e8] hover:text-[#00c8e8]")}>
                  <Stethoscope size={16} />
                  {s.isSonarActive ? "إيقاف التحليل الصوتي" : "تحليل النمط التنفسي (Acoustic)"}
                </button>

                {/* Radar button */}
                <button onClick={s.toggleRadar}
                  className={cn("w-full sm:col-span-2 p-3 rounded-lg border flex items-center justify-center gap-2 text-sm transition-all",
                    s.isRadarActive
                      ? s.radarCalibrated ? "bg-[#9b59b6]/10 border-[#9b59b6] text-[#9b59b6]"
                                          : "bg-[#e8a000]/10 border-[#e8a000] text-[#e8a000] animate-pulse"
                      : "border-[#263545] hover:border-[#9b59b6] hover:text-[#9b59b6]")}>
                  <span>{s.isRadarActive ? "🦇" : "🛡️"}</span>
                  {s.isRadarActive
                    ? s.radarCalibrated
                      ? s.radarMotion != null
                        ? `رادار نشط — ${s.radarMotionType === "hand" ? "[يد] يد قريبة" : s.radarMotionType === "body" ? "[جسم]" : "حركة"} (${s.radarMotion}x)`
                        : "رادار نشط — لا حركة [ok]"
                      : "رادار يعمل — جارٍ المعايرة..."
                    : "حارس ليلي (رادار مكاني Doppler 19kHz)"}
                </button>
              </div>
            </>
            )}

            <BioHistoryChart history={s.history} />
          </section>
          </div>

          {/* ── RIGHT: Audio Engine ── */}
          <div className="lg:col-span-5 space-y-6">
            <section className="bg-[#0d1318] border border-[#1e2d3d] rounded-xl p-4 relative overflow-hidden h-full flex flex-col">
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#263545] to-transparent" />
              <h2 className="font-mono text-[10px] tracking-widest text-[#3d5570] uppercase mb-4 flex items-center gap-2 after:content-[''] after:flex-1 after:h-[1px] after:bg-[#1e2d3d]">
                المحرك الصوتي (Brainwave Entrainment)
              </h2>

              <div className="flex gap-2 mb-4">
                {(["iso","bin","pure"] as const).map(mode => (
                  <button key={mode} onClick={() => s.setAudioMode(mode)}
                    className={cn("flex-1 py-2 rounded border font-mono text-[10px] tracking-widest uppercase transition-all",
                      s.audioMode === mode ? "bg-[#00c8e8]/10 border-[#00c8e8] text-[#00c8e8]"
                      : "bg-[#131a22] border-[#1e2d3d] text-[#6a8099]")}>
                    {mode}
                  </button>
                ))}
              </div>

              <div className="space-y-2 mb-4 flex-1 overflow-y-auto pr-2">
                {s.protocols.map(p => (
                  <div key={p.id} onClick={() => s.setSelectedProto(p)}
                    className={cn("p-3 rounded-lg border cursor-pointer transition-all flex items-center gap-3",
                      s.selectedProto.id === p.id ? "bg-[#00c8e8]/5 border-[#005870]"
                      : "bg-[#131a22] border-[#1e2d3d] hover:border-[#263545]")}>
                    <div className="text-xl">
                      {p.id==="gamma40"?"🧠":p.id==="alpha10"?"🌊":p.id==="theta6"?"💤":p.id==="schumann"?"🌍":"🌑"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold mb-0.5">{p.name}</div>
                      <div className="text-[11px] text-[#6a8099]">{p.sub}</div>
                      <div className="text-[10px] text-[#3d5570] italic mt-1 truncate">{p.evidence}</div>
                    </div>
                    <div className="font-mono text-[10px] text-[#00c8e8] bg-[#00c8e8]/10 border border-[#00c8e8]/20 px-2 py-1 rounded whitespace-nowrap">
                      {p.beat}Hz
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4 mt-auto">
                <div>
                  <label className="block font-mono text-[9px] tracking-widest text-[#3d5570] uppercase mb-1">مستوى الصوت</label>
                  <div className="flex items-center gap-2">
                    <input type="range" min="0" max="100" value={s.volume}
                      onChange={e => s.setVolume(Number(e.target.value))}
                      className="flex-1 h-1 bg-[#263545] rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#00c8e8] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#080c10]" />
                    <span className="font-mono text-[10px] text-[#00c8e8] min-w-[32px]">{s.volume}%</span>
                  </div>
                </div>
                <div>
                  <label className="block font-mono text-[9px] tracking-widest text-[#3d5570] uppercase mb-1">مدة الجلسة</label>
                  <div className="flex items-center gap-2">
                    <input type="range" min="5" max="60" step="5" value={s.duration}
                      onChange={e => s.setDuration(Number(e.target.value))}
                      className="flex-1 h-1 bg-[#263545] rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#00c8e8] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#080c10]" />
                    <span className="font-mono text-[10px] text-[#00c8e8] min-w-[32px]">{s.duration}د</span>
                  </div>
                </div>
              </div>

              <button onClick={s.toggleAudio}
                className={cn("w-full p-4 rounded-lg border font-semibold text-[15px] tracking-wide flex items-center justify-center gap-2 transition-all",
                  s.isAudioPlaying
                    ? "bg-[#e04040]/10 border-[#e04040] text-[#e04040]"
                    : "bg-gradient-to-br from-[#00c8e8]/10 to-[#00c8e8]/5 border-[#00c8e8] text-[#00c8e8] hover:bg-[#00c8e8]/15 hover:shadow-[0_0_20px_rgba(0,200,232,0.15)]")}>
                {s.isAudioPlaying ? <Square size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}
                {s.isAudioPlaying ? "إيقاف الجلسة" : "تشغيل الجلسة"}
              </button>

              <div className="flex items-center justify-between p-3 bg-[#131a22] border border-[#1e2d3d] rounded-lg mt-3">
                <div className={cn("font-mono text-2xl", s.isAudioPlaying ? "text-[#00e070]" : "text-[#c8d8e8]")}>
                  {formatTime(s.sessionSec)}
                </div>
                <div className="text-left">
                  <div className="text-[11px] text-[#6a8099]">{s.selectedProto.name}</div>
                  <div className="font-mono text-[10px] text-[#3d5570] uppercase">
                    {s.audioMode} · {s.selectedProto.carrier}Hz + {s.selectedProto.beat}Hz
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        <footer className="text-center text-[10px] text-[#3d5570] pt-4 border-t border-[#1e2d3d] leading-relaxed mt-8">
          الترددات المستخدمة مستوحاة من دراسات علمية منشورة.<br />
          هذا ليس علاجاً طبياً. استشر طبيبك دائماً.
        </footer>
      </div>
    </>
  );
}

// ── Reusable components ────────────────────────────────────────────
function MetricCard({ label, value, unit, color, status }: {
  label: string; value: number | null; unit: string;
  color: "green"|"cyan"|"amber"|"red"; status?: string;
}) {
  const colorMap = { green:"text-[#00e070]", cyan:"text-[#00c8e8]", amber:"text-[#e8a000]", red:"text-[#e04040]" };
  const statusColor = status === "no-skin" ? "text-[#e8a000]"
    : status === "unstable" ? "text-[#e04040]"
    : value != null ? colorMap[color] : "text-[#3d5570]";
  return (
    <div className={cn("bg-[#131a22] border border-[#1e2d3d] rounded-lg p-3 text-center transition-colors",
      status === "no-skin" && "border-[#e8a000]/50",
      status === "unstable" && "border-[#e04040]/50"
    )}>
      <div className={cn("font-mono text-2xl font-medium leading-none mb-1 transition-colors", statusColor)}>
        {value ?? "--"}{value != null && <span className="text-[#6a8099] text-sm mr-1">{unit}</span>}
      </div>
      <div className="text-[10px] text-[#6a8099] uppercase tracking-wider">{label}</div>
    </div>
  );
}

function SensorButton({ onClick, active, icon, labelOff, labelOn }: {
  onClick: () => void; active: boolean; icon: React.ReactNode;
  labelOff: string; labelOn: string;
}) {
  return (
    <button onClick={onClick}
      className={cn("w-full p-3 rounded-lg border flex items-center justify-center gap-2 text-sm transition-all",
        active ? "bg-[#e04040]/10 border-[#e04040] text-[#e04040]"
        : "border-[#263545] hover:border-[#00c8e8] hover:text-[#00c8e8]")}>
      {icon}{active ? labelOn : labelOff}
    </button>
  );
}
