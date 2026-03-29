// src/components/OmniPuppet.tsx
// OmniPuppet — Visual/Audio Reactive Entity for OmniVerse
// Connects to emotion state, coherence, fusion mode
// ─────────────────────────────────────────────────────────

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";

// ── Types ──────────────────────────────────────────────────

export type EmotionState =
  | "idle"
  | "calm"
  | "focused"
  | "stressed"
  | "agitated"
  | "danger";

export type FusionMode = "normal" | "assist" | "emergency";

export type PuppetWorld = "cosmos" | "ocean" | "forest" | "void" | "pharaoh";

export interface OmniPuppetProps {
  /** 0–100: how coherent / balanced the user is */
  coherence?: number;
  /** 0–100: risk / stress level */
  risk?: number;
  /** 0–100: signal stability */
  stability?: number;
  /** fusion engine mode */
  mode?: FusionMode;
  /** edge emotion */
  emotion?: EmotionState;
  /** 0–1 emotion model confidence */
  emotionConfidence?: number;
  /** is voice/mic active */
  listening?: boolean;
  /** amplify/dampen visual intensity (0–2) */
  visualIntensity?: number;
  /** compact small panel mode */
  compactMode?: boolean;
  /** current world/theme */
  world?: PuppetWorld;
  /** optional audio analyser from audioEngine */
  analyser?: AnalyserNode | null;
  className?: string;
}

// ── Palette ────────────────────────────────────────────────

interface Palette {
  accent: string;
  accent2: string;
  glow: string;
  bg: string;
  ring: string;
  core: string;
  pulseMs: number;
}

function getPalette(
  emotion: EmotionState,
  mode: FusionMode,
  world: PuppetWorld,
  conf: number
): Palette {
  const c = Math.max(0, Math.min(1, conf));
  const alpha = (base: string, op: number) =>
    base.replace("rgb", "rgba").replace(")", `, ${op})`);

  // Emergency override
  if (mode === "emergency" || emotion === "danger") {
    return {
      accent: "#e04040",
      accent2: "#ff8a8a",
      glow: `rgba(224,64,64,${0.28 + 0.18 * c})`,
      bg: "#1a0808",
      ring: "#e04040",
      core: "#ff4a4a",
      pulseMs: 620,
    };
  }

  // World overrides for calm states
  const worldMap: Record<PuppetWorld, Partial<Palette>> = {
    cosmos: { accent: "#a78bfa", accent2: "#c4b5fd", core: "#7c3aed", bg: "#0d0a1a", ring: "#a78bfa" },
    ocean: { accent: "#22d3ee", accent2: "#67e8f9", core: "#0891b2", bg: "#041a22", ring: "#22d3ee" },
    forest: { accent: "#4ade80", accent2: "#86efac", core: "#16a34a", bg: "#031a0a", ring: "#4ade80" },
    void: { accent: "#6b7280", accent2: "#9ca3af", core: "#374151", bg: "#050508", ring: "#6b7280" },
    pharaoh: { accent: "#fbbf24", accent2: "#fcd34d", core: "#d97706", bg: "#1a1203", ring: "#fbbf24" },
  };

  const emotionPalettes: Record<EmotionState, Palette> = {
    idle: {
      accent: "#4b7099",
      accent2: "#8ea2b7",
      glow: "rgba(75,112,153,0.14)",
      bg: "#080c12",
      ring: "#4b7099",
      core: "#1e3a56",
      pulseMs: 2200,
    },
    calm: {
      accent: "#00e070",
      accent2: "#78ffb0",
      glow: `rgba(0,224,112,${0.14 + 0.08 * c})`,
      bg: "#041408",
      ring: "#00e070",
      core: "#00b057",
      pulseMs: 1800,
    },
    focused: {
      accent: "#76d7ff",
      accent2: "#c1f0ff",
      glow: `rgba(118,215,255,${0.14 + 0.08 * c})`,
      bg: "#05111a",
      ring: "#76d7ff",
      core: "#0288a8",
      pulseMs: 1400,
    },
    stressed: {
      accent: "#00c8e8",
      accent2: "#8ff3ff",
      glow: `rgba(0,200,232,${0.18 + 0.10 * c})`,
      bg: "#041620",
      ring: "#00c8e8",
      core: "#0090a8",
      pulseMs: 1100,
    },
    agitated: {
      accent: "#e8a000",
      accent2: "#ffd36a",
      glow: `rgba(232,160,0,${0.22 + 0.12 * c})`,
      bg: "#1a1004",
      ring: "#e8a000",
      core: "#b87800",
      pulseMs: 820,
    },
    danger: {
      accent: "#e04040",
      accent2: "#ff8a8a",
      glow: `rgba(224,64,64,${0.28 + 0.18 * c})`,
      bg: "#1a0808",
      ring: "#e04040",
      core: "#c02020",
      pulseMs: 620,
    },
  };

  const base = emotionPalettes[emotion] ?? emotionPalettes.idle;
  const wOverride = worldMap[world] ?? {};

  // World overrides only in calm/idle states
  if (emotion === "idle" || emotion === "calm" || emotion === "focused") {
    return { ...base, ...wOverride };
  }
  return base;
}

// ── Canvas renderer ────────────────────────────────────────

interface RenderState {
  coherence: number;
  risk: number;
  stability: number;
  emotion: EmotionState;
  mode: FusionMode;
  world: PuppetWorld;
  conf: number;
  listening: boolean;
  intensity: number;
  analyser: AnalyserNode | null;
  tick: number;
  compact: boolean;
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  s: RenderState
): void {
  const pal = getPalette(s.emotion, s.mode, s.world, s.conf);
  const cx = w / 2;
  const cy = h * (s.compact ? 0.5 : 0.46);
  const R = Math.min(w, h) * (s.compact ? 0.28 : 0.32);
  const t = s.tick;
  const risk01 = s.risk / 100;
  const coh01 = s.coherence / 100;
  const stab01 = s.stability / 100;
  const intensity = Math.max(0.3, Math.min(2.0, s.intensity));

  // Background
  const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.8);
  bgGrad.addColorStop(0, pal.bg);
  bgGrad.addColorStop(1, "#050508");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Audio FFT bars (if analyser available)
  if (s.analyser) {
    const bins = 64;
    const fftData = new Uint8Array(bins);
    s.analyser.getByteFrequencyData(fftData);
    const barW = (w * 0.7) / bins;
    const barX0 = w * 0.15;
    for (let i = 0; i < bins; i++) {
      const v = fftData[i] / 255;
      const bh = v * h * 0.22 * intensity;
      const hue = 160 + risk01 * 120;
      ctx.fillStyle = `hsla(${hue},80%,55%,${0.3 + v * 0.5})`;
      ctx.fillRect(barX0 + i * barW, cy + R * 1.05, barW - 1, bh);
      ctx.fillRect(barX0 + i * barW, cy - R * 1.05 - bh, barW - 1, bh);
    }
  }

  // Outer glow ring
  const glowR = R * (1.35 + Math.sin(t * 0.0008 * (1 + risk01)) * 0.06 * intensity);
  const glowGrad = ctx.createRadialGradient(cx, cy, glowR * 0.6, cx, cy, glowR * 1.1);
  glowGrad.addColorStop(0, pal.glow);
  glowGrad.addColorStop(1, "transparent");
  ctx.globalAlpha = 0.7 + stab01 * 0.3;
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, glowR * 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Spinning orbit rings (stability markers)
  const orbitCount = Math.round(2 + stab01 * 3);
  for (let i = 0; i < orbitCount; i++) {
    const angle = (t * 0.0003 * (1 + i * 0.4) + (i * Math.PI * 2) / orbitCount);
    const orbitR = R * (1.12 + i * 0.14);
    const dotSize = 2 + stab01 * 3;
    const dx = cx + Math.cos(angle) * orbitR;
    const dy = cy + Math.sin(angle) * orbitR;
    ctx.beginPath();
    ctx.arc(dx, dy, dotSize, 0, Math.PI * 2);
    ctx.fillStyle = pal.accent2;
    ctx.globalAlpha = 0.4 + stab01 * 0.5;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Coherence arc (main ring)
  const arcAngle = coh01 * Math.PI * 2;
  const arcStart = -Math.PI / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R, arcStart, arcStart + arcAngle);
  ctx.strokeStyle = pal.ring;
  ctx.lineWidth = Math.max(2, 6 * stab01);
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.85;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Risk arc (counter-ring, inverted colour)
  if (risk01 > 0.1) {
    const riskAngle = risk01 * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.84, arcStart, arcStart - riskAngle, true);
    const riskColor = risk01 > 0.6 ? "#e04040" : pal.accent;
    ctx.strokeStyle = riskColor;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.6;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Pulsing core
  const pulseFreq = getPalette(s.emotion, s.mode, s.world, s.conf).pulseMs;
  const pulsePhase = (t % pulseFreq) / pulseFreq;
  const pulseMag = Math.sin(pulsePhase * Math.PI * 2);
  const coreR = R * (0.46 + pulseMag * 0.05 * intensity);

  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  coreGrad.addColorStop(0, pal.core);
  coreGrad.addColorStop(0.55, pal.accent + "cc");
  coreGrad.addColorStop(1, "transparent");
  ctx.beginPath();
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
  ctx.fillStyle = coreGrad;
  ctx.fill();

  // "Face" — symbolic eye/lens geometry
  drawFaceGeometry(ctx, cx, cy, R, s, pal, t, intensity);

  // Listening particles
  if (s.listening) {
    drawListeningEffect(ctx, cx, cy, R, pal, t);
  }

  // Mode indicator strip at bottom
  drawModeStrip(ctx, w, h, s.mode, s.emotion, pal, t, s.compact);
}

function drawFaceGeometry(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  s: RenderState,
  pal: Palette,
  t: number,
  intensity: number
) {
  const risk01 = s.risk / 100;
  const coh01 = s.coherence / 100;
  const blink = Math.sin(t * 0.0006) > 0.96; // rare blink

  // Eye separation varies with stress
  const eyeSep = R * (0.26 + risk01 * 0.06);
  const eyeY = cy - R * 0.12;
  const eyeR = R * (blink ? 0.01 : 0.11 + coh01 * 0.04);
  const pupilR = eyeR * 0.48;

  // Left eye
  ctx.beginPath();
  ctx.ellipse(cx - eyeSep, eyeY, eyeR, blink ? eyeR * 0.05 : eyeR, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#0b1116";
  ctx.fill();
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Left pupil
  const pupilShift = Math.sin(t * 0.0005) * eyeR * 0.22;
  ctx.beginPath();
  ctx.arc(cx - eyeSep + pupilShift, eyeY, pupilR, 0, Math.PI * 2);
  ctx.fillStyle = pal.core;
  ctx.fill();

  // Right eye
  ctx.beginPath();
  ctx.ellipse(cx + eyeSep, eyeY, eyeR, blink ? eyeR * 0.05 : eyeR, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#0b1116";
  ctx.fill();
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Right pupil
  ctx.beginPath();
  ctx.arc(cx + eyeSep - pupilShift, eyeY, pupilR, 0, Math.PI * 2);
  ctx.fillStyle = pal.core;
  ctx.fill();

  // Mouth curve — happy when calm, tense when stressed
  const mouthY = cy + R * 0.26;
  const mouthW = R * 0.38;
  const curvature = (0.5 - risk01) * R * 0.14; // positive = smile, negative = frown
  ctx.beginPath();
  ctx.moveTo(cx - mouthW, mouthY);
  ctx.quadraticCurveTo(cx, mouthY + curvature, cx + mouthW, mouthY);
  ctx.strokeStyle = pal.accent + "bb";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.stroke();

  // Nose dot
  ctx.beginPath();
  ctx.arc(cx, cy + R * 0.08, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = pal.accent2 + "88";
  ctx.fill();

  // Sacred geometry overlay — subtle Flower of Life circles (pharaoh world / calm)
  if (s.world === "pharaoh" || (s.emotion === "calm" && coh01 > 0.7)) {
    const petals = 6;
    const pR = R * 0.22;
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 0.8;
    for (let i = 0; i < petals; i++) {
      const angle = (i / petals) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(
        cx + Math.cos(angle) * pR,
        cy + Math.sin(angle) * pR,
        pR,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Danger — warning chevrons
  if (s.emotion === "danger" || s.mode === "emergency") {
    const chevPhase = (t % 600) / 600;
    const chevOpacity = 0.5 + chevPhase * 0.5;
    ctx.globalAlpha = chevOpacity;
    ctx.strokeStyle = "#e04040";
    ctx.lineWidth = 2;
    const chX = cx;
    const chY = cy - R * 1.55;
    ctx.beginPath();
    ctx.moveTo(chX - 10, chY + 8);
    ctx.lineTo(chX, chY - 2);
    ctx.lineTo(chX + 10, chY + 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(chX - 10, chY + 16);
    ctx.lineTo(chX, chY + 6);
    ctx.lineTo(chX + 10, chY + 16);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawListeningEffect(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  pal: Palette,
  t: number
) {
  const waves = 3;
  for (let i = 0; i < waves; i++) {
    const phase = (t * 0.0014 + (i / waves) * Math.PI * 2) % (Math.PI * 2);
    const wR = R * (1.45 + i * 0.18 + Math.sin(phase) * 0.04);
    const opacity = 0.4 - i * 0.12;
    ctx.beginPath();
    ctx.arc(cx, cy, wR, 0, Math.PI * 2);
    ctx.strokeStyle = pal.accent;
    ctx.globalAlpha = opacity;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawModeStrip(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  mode: FusionMode,
  emotion: EmotionState,
  pal: Palette,
  t: number,
  compact: boolean
) {
  if (compact) return;
  const stripH = 3;
  const y = h - stripH;
  const phase = ((t * 0.0008) % 1);

  if (mode === "emergency") {
    const grad = ctx.createLinearGradient(0, y, w, y);
    grad.addColorStop(0, "#e0404000");
    grad.addColorStop(phase, "#e04040ff");
    grad.addColorStop(Math.min(1, phase + 0.3), "#e04040ff");
    grad.addColorStop(1, "#e0404000");
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, w, stripH);
    return;
  }

  ctx.fillStyle = pal.accent + "aa";
  const fillW = w * (t * 0.0001 % 1);
  ctx.fillRect(0, y, fillW, stripH);
}

// ── World selector sub-component ──────────────────────────

const WORLDS: { id: PuppetWorld; label: string; icon: string }[] = [
  { id: "cosmos", label: "كوزموس", icon: "✦" },
  { id: "ocean", label: "محيط", icon: "◈" },
  { id: "forest", label: "غابة", icon: "❧" },
  { id: "pharaoh", label: "فرعوني", icon: "𓃭" },
  { id: "void", label: "فراغ", icon: "○" },
];

// ── Main Component ─────────────────────────────────────────

export function OmniPuppet({
  coherence = 100,
  risk = 0,
  stability = 100,
  mode = "normal",
  emotion = "idle",
  emotionConfidence = 0.5,
  listening = false,
  visualIntensity = 1.0,
  compactMode = false,
  world: worldProp,
  analyser = null,
  className = "",
}: OmniPuppetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(performance.now());
  const stateRef = useRef<RenderState>({
    coherence,
    risk,
    stability,
    emotion,
    mode,
    world: worldProp ?? "cosmos",
    conf: emotionConfidence,
    listening,
    intensity: visualIntensity,
    analyser,
    tick: 0,
    compact: compactMode,
  });

  const [activeWorld, setActiveWorld] = useState<PuppetWorld>(worldProp ?? "cosmos");
  const [showWorldPicker, setShowWorldPicker] = useState(false);

  const palette = useMemo(
    () => getPalette(emotion, mode, activeWorld, emotionConfidence),
    [emotion, mode, activeWorld, emotionConfidence]
  );

  // Sync live props into ref
  useEffect(() => {
    stateRef.current = {
      coherence,
      risk,
      stability,
      emotion,
      mode,
      world: activeWorld,
      conf: emotionConfidence,
      listening,
      intensity: visualIntensity,
      analyser,
      tick: stateRef.current.tick,
      compact: compactMode,
    };
  }, [coherence, risk, stability, emotion, mode, activeWorld, emotionConfidence, listening, visualIntensity, analyser, compactMode]);

  // Animation loop
  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const now = performance.now();
    stateRef.current.tick = now - startRef.current;

    const dpr = window.devicePixelRatio || 1;
    const displayW = canvas.clientWidth;
    const displayH = canvas.clientHeight;
    if (canvas.width !== displayW * dpr || canvas.height !== displayH * dpr) {
      canvas.width = displayW * dpr;
      canvas.height = displayH * dpr;
      ctx.scale(dpr, dpr);
    }

    drawFrame(ctx, displayW, displayH, stateRef.current);
    rafRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  // Text labels
  const emotionLabels: Record<EmotionState, string> = {
    idle: "استعداد",
    calm: "هدوء",
    focused: "تركيز",
    stressed: "ضغط",
    agitated: "توتر",
    danger: "خطر",
  };

  const modeLabels: Record<FusionMode, string> = {
    normal: "طبيعي",
    assist: "مساعدة",
    emergency: "طوارئ",
  };

  const height = compactMode ? "h-[240px]" : "h-[520px] md:h-[600px]";

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-[28px] ${height} ${className}`}
      style={{
        background: palette.bg,
        border: `1px solid ${palette.ring}22`,
        boxShadow: `0 0 ${compactMode ? 24 : 48}px ${palette.glow}`,
      }}
    >
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ display: "block" }}
        aria-label="OmniPuppet visual state"
      />

      {/* Header overlay */}
      {!compactMode && (
        <div className="relative z-10 flex items-center justify-between px-4 pt-3 pb-1">
          <div>
            <span
              className="font-mono text-[9px] uppercase tracking-[0.38em] opacity-60"
              style={{ color: palette.accent }}
            >
              OmniPuppet
            </span>
          </div>

          {/* World picker trigger */}
          <button
            onClick={() => setShowWorldPicker((v) => !v)}
            className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition-all"
            style={{
              borderColor: palette.ring + "44",
              color: palette.accent,
              background: "rgba(0,0,0,0.4)",
            }}
            aria-label="اختر العالم البصري"
          >
            {WORLDS.find((w) => w.id === activeWorld)?.icon ?? "✦"}{" "}
            {WORLDS.find((w) => w.id === activeWorld)?.label ?? "كوزموس"}
          </button>
        </div>
      )}

      {/* World picker dropdown */}
      {showWorldPicker && !compactMode && (
        <div
          className="absolute top-12 right-3 z-20 flex flex-col gap-1 rounded-2xl border p-2 shadow-xl"
          style={{
            background: "#0b1116ee",
            borderColor: palette.ring + "33",
            backdropFilter: "blur(16px)",
          }}
        >
          {WORLDS.map((w) => (
            <button
              key={w.id}
              onClick={() => {
                setActiveWorld(w.id);
                setShowWorldPicker(false);
              }}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition-all hover:bg-white/10"
              style={{
                color: activeWorld === w.id ? palette.accent : "#8ea2b7",
                fontWeight: activeWorld === w.id ? 700 : 400,
              }}
            >
              <span>{w.icon}</span>
              <span>{w.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Bottom status bar */}
      <div
        className="relative z-10 mt-auto flex items-center justify-between px-4 py-3"
        style={{
          background: "linear-gradient(0deg, rgba(0,0,0,0.65) 0%, transparent 100%)",
        }}
      >
        <div className="flex flex-col gap-0.5">
          <span
            className="font-mono text-[11px] uppercase tracking-[0.3em] font-semibold"
            style={{ color: palette.accent }}
          >
            {emotionLabels[emotion] ?? emotion}
          </span>
          <span className="font-mono text-[9px] text-[#6a8099] tracking-wider uppercase">
            {modeLabels[mode] ?? mode}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Coherence pill */}
          <div
            className="flex items-center gap-1.5 rounded-full border px-2.5 py-1"
            style={{
              borderColor: palette.ring + "33",
              background: "rgba(0,0,0,0.35)",
            }}
          >
            <span className="font-mono text-[10px] text-[#6a8099] uppercase tracking-wider">
              COH
            </span>
            <span
              className="font-mono text-[11px] font-semibold"
              style={{ color: palette.accent }}
            >
              {Math.round(coherence)}
            </span>
          </div>

          {/* Risk pill */}
          <div
            className="flex items-center gap-1.5 rounded-full border px-2.5 py-1"
            style={{
              borderColor: risk > 60 ? "#e0404033" : palette.ring + "22",
              background: "rgba(0,0,0,0.35)",
            }}
          >
            <span className="font-mono text-[10px] text-[#6a8099] uppercase tracking-wider">
              RISK
            </span>
            <span
              className="font-mono text-[11px] font-semibold"
              style={{ color: risk > 60 ? "#e04040" : palette.accent2 }}
            >
              {Math.round(risk)}
            </span>
          </div>

          {/* Listening indicator */}
          {listening && (
            <div
              className="flex h-6 w-6 items-center justify-center rounded-full animate-pulse"
              style={{ background: palette.accent + "22", border: `1px solid ${palette.accent}44` }}
              title="يستمع"
            >
              <span className="text-[8px]" style={{ color: palette.accent }}>
                ●
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Emergency overlay */}
      {(mode === "emergency" || emotion === "danger") && (
        <div
          className="pointer-events-none absolute inset-0 z-30 rounded-[28px]"
          style={{
            border: "2px solid #e04040",
            boxShadow: "inset 0 0 30px rgba(224,64,64,0.18)",
            animation: "pulse 0.62s ease-in-out infinite",
          }}
        />
      )}
    </div>
  );
}

// ── Compact variant ────────────────────────────────────────

/** Minimal badge-style puppet for sidebars / small panels */
export function OmniPuppetCompact(props: Omit<OmniPuppetProps, "compactMode">) {
  return <OmniPuppet {...props} compactMode />;
}

export default OmniPuppet;
