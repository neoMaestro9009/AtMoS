// src/hooks/useOmniState.ts
// ════════════════════════════════════════════════════════════════
// Central state management for OmniVerse Core — v3 Sovereign
// Single source of truth: bio, audio, sensors, HRV suite,
// radar, balance protocol, wake lock, adaptive baseline.
// ════════════════════════════════════════════════════════════════

import { useState, useRef, useEffect, useCallback } from "react";
import { AudioEngine, getProtocols, Protocol }  from "../engines/audioEngine";
import { SonarEngine }                           from "../engines/sonarEngine";
import { VisionEngine }                          from "../engines/visionEngine";
import { BayesianFusion }                        from "../engines/fusion";
import { triggerHaptic }                         from "../engines/haptics";
import { useBioHistory }                         from "./useBioHistory";
import { getDefaultSessionDuration }             from "../components/SettingsModal";
import { SpatialRadar }                          from "../engines/sonarRadar";
import { adaptiveBaseline }                      from "../engines/adaptiveBaseline";
import { evaluatePreTrigger, resetPreTrigger }   from "../engines/preTriggerWhisper";
import type { HRVTimeDomain, BPMResult }         from "../engines/filters";
import type { BalanceMode }                      from "../screens/BalanceProtocolScreen";

// ── Singleton engines ─────────────────────────────────────────
const fusionInstance = new BayesianFusion();
const audioInstance  = new AudioEngine();

export function useOmniState() {

  // ── Engine refs ───────────────────────────────────────────────
  const visionEngineRef  = useRef<VisionEngine   | null>(null);
  const sonarEngineRef   = useRef<SonarEngine    | null>(null);
  const radarRef         = useRef<SpatialRadar   | null>(null);
  const wakeLockRef      = useRef<WakeLockSentinel | null>(null);
  const fusion           = fusionInstance;
  const audio            = audioInstance;

  // ── DOM refs ──────────────────────────────────────────────────
  const videoRef         = useRef<HTMLVideoElement  | null>(null);
  const canvasRef        = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveCanvasRef    = useRef<HTMLCanvasElement | null>(null);

  // ── Live mutable refs (avoid stale closures) ──────────────────
  const bpmRef        = useRef<number | null>(null);
  const hrvRef        = useRef<number | null>(null);
  const breathRateRef = useRef<number | null>(null);
  const stressIdxRef  = useRef<number | null>(null);
  const lastWhisperRef= useRef<number>(0);

  // ── Core bio state ────────────────────────────────────────────
  const [bpm,              setBpm]             = useState<number | null>(null);
  const [hrv,              setHrv]             = useState<number | null>(null);
  const [conf,             setConf]            = useState(0);
  const [breathRate,       setBreathRate]      = useState<number | null>(null);
  const [breathRegularity, setBreathRegularity]= useState<number | null>(null);
  const [breathDepth,      setBreathDepth]     = useState<number | null>(null);
  const [stressIdx,        setStressIdx]       = useState<number | null>(null);
  const [vitalityIdx,      setVitalityIdx]     = useState<number | null>(null);
  const [focusIdx,         setFocusIdx]        = useState<number | null>(null);
  const [coherenceIdx,     setCoherenceIdx]    = useState<number | null>(null);
  const [microExpr,        setMicroExpr]       = useState(0);
  const [voiceStress,      setVoiceStress]     = useState(0);
  const [hasSignal,        setHasSignal]       = useState(false);
  const [isShaking,        setIsShaking]       = useState(false);
  const [signalStatus,     setSignalStatus]    = useState<"idle"|"no-skin"|"unstable"|"stable">("idle");
  const [lightCalibScore,  setLightCalibScore] = useState<{score:number;hint:string}|null>(null);

  // ── HRV Extended Suite ────────────────────────────────────────
  const [sdnn,           setSdnn]          = useState<number | null>(null);
  const [pnn50,          setPnn50]         = useState<number | null>(null);
  const [heartCoherence, setHeartCoherence]= useState<number | null>(null);
  const [sqiQuality,     setSqiQuality]    = useState<BPMResult["sqiQuality"]>("invalid");
  const [deceptionProb,  setDeceptionProb] = useState<number | null>(null);

  // ── Sensor activation ─────────────────────────────────────────
  const [isContactPPG,  setIsContactPPG]  = useState(false);
  const [isRemotePPG,   setIsRemotePPG]   = useState(false);
  const [isSonarActive, setIsSonarActive] = useState(false);

  // ── Radar (SpatialRadar) ──────────────────────────────────────
  const [isRadarActive,    setIsRadarActive]    = useState(false);
  const [radarMotion,      setRadarMotion]      = useState<number | null>(null);
  const [radarMotionType,  setRadarMotionType]  = useState<string>("");
  const [radarCalibrated,  setRadarCalibrated]  = useState(false);

  // ── Balance Protocol ──────────────────────────────────────────
  const [showBalance,       setShowBalance]      = useState(false);
  const [balanceDefaultMode,setBalanceDefaultMode]=useState<BalanceMode>("step_back");

  // ── Coherence mode ─────────────────────────────────────────────
  const [isCoherenceMode, setIsCoherenceMode]= useState(false);
  const [coherencePhase,  setCoherencePhase] = useState<"idle"|"baseline"|"active">("idle");

  // ── Wake Lock ─────────────────────────────────────────────────
  const [wakeLockActive, setWakeLockActive] = useState(false);

  // ── Audio state ───────────────────────────────────────────────
  const [protocols,     setProtocols]    = useState<Protocol[]>(() => getProtocols());
  const [selectedProto, setSelectedProto]= useState<Protocol>(() => {
    const saved = localStorage.getItem("omni_selectedProto");
    if (saved) {
      try {
        const p = JSON.parse(saved);
        const found = getProtocols().find(x => x.id === p.id);
        if (found) return found;
      } catch { /* ignore */ }
    }
    return getProtocols()[0];
  });
  const [audioMode, setAudioMode]= useState<"iso"|"bin"|"pure">(
    () => (localStorage.getItem("omni_audioMode") as any) || "iso"
  );
  const [volume,        setVolume]       = useState(() => {
    const s = localStorage.getItem("omni_volume");
    return s ? parseInt(s, 10) : 70;
  });
  const [duration,      setDuration]     = useState(() => getDefaultSessionDuration());
  const [isAudioPlaying,setIsAudioPlaying]= useState(false);
  const [sessionSec,    setSessionSec]   = useState(0);

  // ── Misc ──────────────────────────────────────────────────────
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPuppet,    setShowPuppet]   = useState(false);
  const [showSettings,  setShowSettings] = useState(false);
  const [showFeedback,  setShowFeedback] = useState(false);
  const [showOnboarding,setShowOnboarding]=useState(
    () => localStorage.getItem("omni_hasCompletedOnboarding") !== "true"
  );
  const [isCoherenceUI, setIsCoherenceUI]= useState(false);

  const { history, addRecord } = useBioHistory();

  // ── Persist preferences ───────────────────────────────────────
  useEffect(() => {
    localStorage.setItem("omni_selectedProto", JSON.stringify(selectedProto));
  }, [selectedProto]);
  useEffect(() => { localStorage.setItem("omni_audioMode", audioMode); }, [audioMode]);
  useEffect(() => { localStorage.setItem("omni_volume", volume.toString()); }, [volume]);

  // ── Wake Lock ─────────────────────────────────────────────────
  const requestWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
      setWakeLockActive(true);
      wakeLockRef.current!.addEventListener("release", () => setWakeLockActive(false));
    } catch { /* not critical */ }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  }, []);

  // Auto wake lock when any sensor is active
  useEffect(() => {
    const active = isContactPPG || isRemotePPG || isSonarActive || isAudioPlaying;
    if (active) requestWakeLock();
    else        releaseWakeLock();
  }, [isContactPPG, isRemotePPG, isSonarActive, isAudioPlaying]);

  // Re-acquire on visibility change (lock released on tab switch)
  useEffect(() => {
    const onVisible = () => {
      const active = isContactPPG || isRemotePPG || isSonarActive || isAudioPlaying;
      if (active && !wakeLockRef.current) requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isContactPPG, isRemotePPG, isSonarActive, isAudioPlaying]);

  // ── Engine initialisation ─────────────────────────────────────
  useEffect(() => {
    visionEngineRef.current = new VisionEngine(
      (bpmVal, hrvVal, confVal, microExprScore, rrIntervals, rrTimestamps, hrvTime, sqiQ) => {
        fusion.addReading("vision", bpmVal, confVal);
        setConf(confVal);
        if (rrIntervals && rrTimestamps && rrIntervals.length > 0)
          fusion.addRRIntervals(rrIntervals, rrTimestamps);

        const fused = fusion.getFusedValue();
        if (fused) {
          setBpm(fused.value);
          bpmRef.current = fused.value;
          setHrv(hrvVal);
          hrvRef.current = hrvVal;

          if (hrvVal !== null) {
            const si = fusion.getStressIndex(hrvVal, breathRateRef.current, confVal, 50);
            setStressIdx(si);
            stressIdxRef.current = si;
            setVitalityIdx(fusion.getVitalityIndex(fused.value, hrvVal, confVal, confVal));

            // Deception probability (uses baseline if set)
            const dp = fusion.getDeceptionProbability(
              fused.value, hrvVal,
              voiceStress * 100,
              microExprScore ?? 0
            );
            setDeceptionProb(dp > 0 ? dp : null);
          }

          setCoherenceIdx(fusion.getHRVCoherence());

          if (microExprScore !== undefined) {
            setMicroExpr(microExprScore);
            setFocusIdx(fusion.getFocusIndex(hrvVal, microExprScore, confVal));
          }

          setHasSignal(true);
        }

        // HRV extended suite
        if (hrvTime) {
          if (hrvTime.sdnn != null)      setSdnn(hrvTime.sdnn);
          if (hrvTime.pnn50 != null)     setPnn50(Math.round(hrvTime.pnn50));
          if (hrvTime.coherence != null) setHeartCoherence(Math.round(hrvTime.coherence * 100));
        }
        if (sqiQ) setSqiQuality(sqiQ);
      },
      null,
      overlayCanvasRef,
      (status) => setSignalStatus(status),
      waveCanvasRef
    );

    visionEngineRef.current.onLightCalibration = (score, hint) =>
      setLightCalibScore({ score, hint });

    sonarEngineRef.current = new SonarEngine(
      (bp) => {
        const accelRate = visionEngineRef.current?.getAccelBreathRate?.() ?? null;
        const fused = fusion.getFusedBreathRate(bp.rate, bp.confidence, accelRate, 50);
        if (fused) { setBreathRate(fused.rate); breathRateRef.current = fused.rate; }
        else        { setBreathRate(bp.rate);   breathRateRef.current = bp.rate; }
        setBreathRegularity(bp.regularity);
        setBreathDepth(bp.depthScore);
      },
      (score) => setVoiceStress(score)
    );

    return () => {
      visionEngineRef.current?.stop();
      sonarEngineRef.current?.stop();
      audio.stop();
      radarRef.current?.stop();
      releaseWakeLock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Adaptive baseline + Pre-Trigger Whisper (every 3s) ───────
  useEffect(() => {
    const id = setInterval(() => {
      adaptiveBaseline.update({
        hr: bpmRef.current, hrv: hrvRef.current,
        breathRate: breathRateRef.current, stressIdx: stressIdxRef.current,
      });

      // ── isShaking: read live motionMag from AccelerometerSensor inside VisionEngine ──
      // motionMag > 12 m/s² above gravity = notable shaking that degrades PPG signal
      const motionMag = (visionEngineRef.current as any)?.accel?.getMotionMag?.() ?? 0;
      setIsShaking(motionMag > 12);

      const now = Date.now();
      if (now - lastWhisperRef.current > 2000) {
        lastWhisperRef.current = now;
        evaluatePreTrigger({
          hr: bpmRef.current, stressIdx: stressIdxRef.current,
          isBalanceOpen: showBalance, isEmergencyActive: false,
        });
      }
      // Auto-open Balance Protocol on sustained high stress
      if (!showBalance && stressIdxRef.current != null && stressIdxRef.current > 75
          && bpmRef.current != null && bpmRef.current > 100) {
        setBalanceDefaultMode("step_back");
        setShowBalance(true);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [showBalance]);

  // ── Heart rate alert haptics ──────────────────────────────────
  useEffect(() => {
    if (bpm && (bpm > 140 || bpm < 50)) triggerHaptic("warning");
  }, [bpm]);

  // ── Sensor toggles ─────────────────────────────────────────────
  const toggleContactPPG = useCallback(async () => {
    if (!visionEngineRef.current) return;
    if (isContactPPG) {
      visionEngineRef.current.stop(); setIsContactPPG(false); triggerHaptic("stop");
    } else {
      try {
        setErrorMsg(null);
        if (isRemotePPG) { visionEngineRef.current.stop(); setIsRemotePPG(false); }
        await visionEngineRef.current.start("contact", videoRef.current!);
        setIsContactPPG(true); triggerHaptic("start");
      } catch (e: any) { setErrorMsg(e.message); }
    }
  }, [isContactPPG, isRemotePPG]);

  const toggleRemotePPG = useCallback(async () => {
    if (!visionEngineRef.current) return;
    if (isRemotePPG) {
      visionEngineRef.current.stop(); setIsRemotePPG(false); triggerHaptic("stop");
    } else {
      try {
        setErrorMsg(null);
        if (isContactPPG) { visionEngineRef.current.stop(); setIsContactPPG(false); }
        await visionEngineRef.current.start("remote", videoRef.current!);
        setIsRemotePPG(true); triggerHaptic("start");
      } catch (e: any) { setErrorMsg(e.message); }
    }
  }, [isRemotePPG, isContactPPG]);

  const toggleSonar = useCallback(async () => {
    if (!sonarEngineRef.current) return;
    if (isSonarActive) {
      sonarEngineRef.current.stop(); setIsSonarActive(false); triggerHaptic("stop");
    } else {
      try {
        setErrorMsg(null);
        await sonarEngineRef.current.start();
        setIsSonarActive(true); triggerHaptic("start");
      } catch (e: any) { setErrorMsg(e.message); }
    }
  }, [isSonarActive]);

  // ── Radar toggle ──────────────────────────────────────────────
  const toggleRadar = useCallback(async () => {
    if (isRadarActive) {
      radarRef.current?.stop(); radarRef.current = null;
      setIsRadarActive(false); setRadarMotion(null); setRadarMotionType(""); setRadarCalibrated(false);
    } else {
      try {
        const r = new SpatialRadar(
          (ev) => { setRadarMotion(Math.round(ev.motionIntensity * 10)); setRadarMotionType(ev.motionType); triggerHaptic("warning"); },
          ()   => setRadarCalibrated(true)
        );
        await r.start();
        radarRef.current = r;
        setIsRadarActive(true); setRadarCalibrated(false);
      } catch (e: any) { setErrorMsg(e.message); }
    }
  }, [isRadarActive]);

  // ── Audio toggle ──────────────────────────────────────────────
  const toggleAudio = useCallback(async () => {
    if (isAudioPlaying) {
      audio.stop(); setIsAudioPlaying(false); triggerHaptic("stop"); setErrorMsg(null);
      if (sessionSec > 10 && bpmRef.current && hrvRef.current)
        addRecord({
          bpm:               bpmRef.current,
          hrv:               hrvRef.current,
          stressIdx:         stressIdxRef.current || 0,
          coherenceIdx:      fusion.getHRVCoherence(),
          vitalityIdx:       fusion.getVitalityIndex(bpmRef.current, hrvRef.current, 70, 70),
          focusIdx:          fusion.getFocusIndex(hrvRef.current, 0, 70),
          breathRate:        breathRateRef.current ?? undefined,
          breathDepth:       breathDepth ?? undefined,
          breathRegularity:  breathRegularity ?? undefined,
          sessionDurationSec:sessionSec,
          protocolId:        selectedProto.id,
        });
    } else {
      try {
        await audio.start(selectedProto, audioMode);
        audio.setVolume(volume / 100);
        setIsAudioPlaying(true); setSessionSec(0); triggerHaptic("start");
      } catch (e: any) { setErrorMsg(e.message); }
    }
  }, [isAudioPlaying, selectedProto, audioMode, volume, sessionSec, breathDepth, breathRegularity]);

  // Session timer
  useEffect(() => {
    if (!isAudioPlaying) return;
    const id = setInterval(() => {
      setSessionSec(s => {
        if (s >= duration * 60) { toggleAudio(); return s; }
        return s + 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isAudioPlaying, duration]);

  // ── Coherence analysis ────────────────────────────────────────
  const startCoherenceAnalysis = useCallback(async () => {
    setIsCoherenceMode(true); setCoherencePhase("baseline");
    if (!isRemotePPG) await toggleRemotePPG();
    if (!isSonarActive) await toggleSonar();
    let cd = 35;
    const iv = setInterval(() => {
      cd--;
      if (cd <= 10 && bpmRef.current && hrvRef.current) {
        clearInterval(iv);
        fusion.setBaseline(bpmRef.current, hrvRef.current);
        setCoherencePhase("active");
      } else if (cd <= 0) {
        clearInterval(iv);
        setErrorMsg("فشل في أخذ القراءة الأساسية. تأكد من الثبات والإضاءة.");
        setCoherencePhase("idle"); setIsCoherenceMode(false);
      }
    }, 1000);
  }, [isRemotePPG, isSonarActive, toggleRemotePPG, toggleSonar]);

  const stopCoherenceAnalysis = useCallback(() => {
    setIsCoherenceMode(false); setCoherencePhase("idle");
  }, []);

  // ── Balance protocol helpers ──────────────────────────────────
  const openBalance  = useCallback((mode: BalanceMode = "step_back") => {
    setBalanceDefaultMode(mode); setShowBalance(true);
  }, []);
  const closeBalance = useCallback(() => {
    setShowBalance(false); resetPreTrigger();
  }, []);

  // ── Return complete API ───────────────────────────────────────
  return {
    // DOM refs
    videoRef, canvasRef, overlayCanvasRef, waveCanvasRef,

    // Core bio
    bpm, hrv, conf, breathRate, breathRegularity, breathDepth,
    stressIdx, vitalityIdx, focusIdx, coherenceIdx,
    microExpr, voiceStress, hasSignal, isShaking, signalStatus, lightCalibScore,

    // HRV extended
    sdnn, pnn50, heartCoherence, sqiQuality, deceptionProb,

    // Sensors
    isContactPPG, isRemotePPG, isSonarActive,
    toggleContactPPG, toggleRemotePPG, toggleSonar,

    // Radar
    isRadarActive, radarMotion, radarMotionType, radarCalibrated, toggleRadar,

    // Balance
    showBalance, balanceDefaultMode, openBalance, closeBalance,

    // Audio
    protocols, setProtocols, selectedProto, setSelectedProto,
    audioMode, setAudioMode, volume, setVolume,
    duration, setDuration, isAudioPlaying, sessionSec, toggleAudio,

    // Coherence
    isCoherenceMode, coherencePhase, startCoherenceAnalysis, stopCoherenceAnalysis,
    isCoherenceUI, setIsCoherenceUI,

    // Wake Lock
    wakeLockActive,

    // UI modals
    showPuppet, setShowPuppet,
    showSettings, setShowSettings,
    showFeedback, setShowFeedback,
    showOnboarding, setShowOnboarding,

    // History & error
    history, addRecord, errorMsg, setErrorMsg,

    // Fusion (for export)
    fusion,
  };
}
