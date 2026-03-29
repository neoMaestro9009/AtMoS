// src/components/BioScanner.tsx
// Cinematic biometric scanner UI.
// Wraps camera feed, signal overlay, and live bio readings.
// Receives all data from useOmniState — zero own state.

import React, { RefObject } from "react";

// ── Types ─────────────────────────────────────────────────────────────────
interface BioScannerProps {
  // DOM refs
  videoRef:         RefObject<HTMLVideoElement>;
  overlayCanvasRef: RefObject<HTMLCanvasElement>;
  waveCanvasRef:    RefObject<HTMLCanvasElement>;

  // Sensor modes
  isContactPPG:     boolean;
  isRemotePPG:      boolean;
  isSonarActive:    boolean;
  toggleContactPPG: () => void;
  toggleRemotePPG:  () => void;
  toggleSonar:      () => void;

  // Bio data
  bpm:              number | null;
  hrv:              number | null;
  conf:             number;
  breathRate:       number | null;
  breathRegularity: number | null;
  breathDepth:      number | null;
  stressIdx:        number | null;
  vitalityIdx:      number | null;
  focusIdx:         number | null;
  coherenceIdx:     number | null;
  hasSignal:        boolean;
  signalStatus:     "idle" | "no-skin" | "unstable" | "stable";
  lightCalibScore:  { score: number; hint: string } | null;
  voiceStress:      number;
}

// ── Helpers ──────────────────────────────────────────────────────────────
function SignalBadge({ status }: { status: BioScannerProps["signalStatus"] }) {
  const map = {
    idle:     { label: "في الانتظار", color: "text-white/40 border-white/20",  dot: "bg-white/30"  },
    "no-skin":{ label: "لا توجد بشرة", color: "text-yellow-400 border-yellow-400/40", dot: "bg-yellow-400" },
    unstable: { label: "إشارة غير مستقرة", color: "text-orange-400 border-orange-400/40", dot: "bg-orange-400 animate-pulse" },
    stable:   { label: "إشارة مستقرة",  color: "text-emerald-400 border-emerald-500/40", dot: "bg-emerald-400"  },
  };
  const { label, color, dot } = map[status];
  return (
    <span className={`flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded-full border ${color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function MetricCard({
  label, value, unit, color = "text-white",
}: {
  label: string; value: string | number | null; unit?: string; color?: string;
}) {
  return (
    <div className="flex flex-col items-center bg-white/5 rounded-xl px-3 py-2 min-w-[72px]">
      <span className={`text-xl font-black font-mono ${color}`}>
        {value ?? "—"}
      </span>
      {unit && <span className="text-white/40 text-[10px] font-mono">{unit}</span>}
      <span className="text-white/50 text-[10px] mt-0.5 text-center leading-tight">{label}</span>
    </div>
  );
}

function SensorButton({
  label, active, onClick, icon,
}: {
  label: string; active: boolean; onClick: () => void; icon: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all active:scale-95 ${
        active
          ? "bg-cyan-500/20 border-cyan-500/60 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.25)]"
          : "bg-white/5 border-white/15 text-white/50 hover:bg-white/10"
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
      {active && (
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse ml-1" />
      )}
    </button>
  );
}

function BarMeter({ value, color = "#22d3ee" }: { value: number | null; color?: string }) {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────
export function BioScanner({
  videoRef, overlayCanvasRef, waveCanvasRef,
  isContactPPG, isRemotePPG, isSonarActive,
  toggleContactPPG, toggleRemotePPG, toggleSonar,
  bpm, hrv, conf, breathRate, breathRegularity, breathDepth,
  stressIdx, vitalityIdx, focusIdx, coherenceIdx,
  hasSignal, signalStatus, lightCalibScore, voiceStress,
}: BioScannerProps) {

  const anyActive = isContactPPG || isRemotePPG || isSonarActive;

  return (
    <div className="flex flex-col gap-4 w-full">

      {/* ── Camera viewport ─────────────────────────────────── */}
      <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-[#070d14] border border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.6)]">

        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: isContactPPG ? "none" : "scaleX(-1)" }}
        />

        {/* Overlay canvas for face/finger landmarks */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {/* Corner brackets (cinematic HUD) */}
        {anyActive && (
          <>
            <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-cyan-400/60 rounded-tl-sm" />
            <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-cyan-400/60 rounded-tr-sm" />
            <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-cyan-400/60 rounded-bl-sm" />
            <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-cyan-400/60 rounded-br-sm" />
          </>
        )}

        {/* Signal status badge */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2">
          <SignalBadge status={signalStatus} />
        </div>

        {/* Confidence bar */}
        {hasSignal && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5">
            <div
              className="h-full bg-cyan-400/70 transition-all duration-500"
              style={{ width: `${conf}%` }}
            />
          </div>
        )}

        {/* Idle overlay */}
        {!anyActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
            <span className="text-4xl mb-2">🔬</span>
            <span className="text-white/50 text-sm font-mono">فعّل مستشعراً للبدء</span>
          </div>
        )}

        {/* Light hint */}
        {lightCalibScore && lightCalibScore.score < 60 && (
          <div className="absolute bottom-3 left-3 right-3 bg-yellow-500/20 border border-yellow-500/40 rounded-lg px-3 py-1.5 text-center">
            <span className="text-yellow-300 text-xs">{lightCalibScore.hint}</span>
          </div>
        )}
      </div>

      {/* ── Waveform canvas ─────────────────────────────────── */}
      {hasSignal && (
        <div className="w-full h-14 rounded-xl overflow-hidden bg-white/5 border border-white/8">
          <canvas ref={waveCanvasRef} className="w-full h-full" />
        </div>
      )}

      {/* ── Sensor toggles ──────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <SensorButton label="إصبع" active={isContactPPG} onClick={toggleContactPPG} icon="👆" />
        <SensorButton label="وجه"  active={isRemotePPG}  onClick={toggleRemotePPG}  icon="🫦" />
        <SensorButton label="سونار" active={isSonarActive} onClick={toggleSonar}   icon="🎙️" />
      </div>

      {/* ── Primary vitals ──────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        <MetricCard
          label="نبض"
          value={bpm}
          unit="bpm"
          color={
            bpm == null ? "text-white/30"
            : bpm > 140 || bpm < 50 ? "text-red-400"
            : "text-emerald-400"
          }
        />
        <MetricCard
          label="HRV"
          value={hrv}
          unit="ms"
          color={hrv == null ? "text-white/30" : "text-cyan-300"}
        />
        <MetricCard
          label="تنفس"
          value={breathRate}
          unit="br/m"
          color={breathRate == null ? "text-white/30" : "text-sky-300"}
        />
        <MetricCard
          label="ثقة"
          value={conf > 0 ? conf : null}
          unit="%"
          color="text-white/70"
        />
      </div>

      {/* ── Index meters ────────────────────────────────────── */}
      <div className="flex flex-col gap-2 bg-white/5 border border-white/8 rounded-2xl p-4">
        <IndexRow label="التوتر"     value={stressIdx}    color="#f87171" icon="⚡" />
        <IndexRow label="الحيوية"    value={vitalityIdx}  color="#34d399" icon="💚" />
        <IndexRow label="التركيز"    value={focusIdx}     color="#60a5fa" icon="🎯" />
        <IndexRow label="التوافق"    value={coherenceIdx} color="#a78bfa" icon="🌊" />
        {isSonarActive && (
          <>
            <IndexRow label="انتظام التنفس" value={breathRegularity} color="#38bdf8" icon="🫁" />
            <IndexRow label="التوتر الصوتي" value={voiceStress}      color="#fb923c" icon="🗣️" />
          </>
        )}
      </div>
    </div>
  );
}

function IndexRow({
  label, value, color, icon,
}: {
  label: string; value: number | null; color: string; icon: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm w-4">{icon}</span>
      <span className="text-white/60 text-xs w-24 shrink-0">{label}</span>
      <div className="flex-1">
        <BarMeter value={value} color={color} />
      </div>
      <span className="text-xs font-mono w-8 text-right" style={{ color }}>
        {value != null ? value : "—"}
      </span>
    </div>
  );
}
