// src/context/EmotionContext.tsx
// Real-time emotion state derived from microphone analysis.
// Uses extractFeaturesFromAnalyser + classifyEmotion from emotionEngine.ts.
// Runs its own mic tap — separate from SonarEngine to avoid conflicts.

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  classifyEmotion,
  extractFeaturesFromAnalyser,
  EmotionState,
} from "../engines/emotionEngine";

interface EmotionContextValue {
  emotion: EmotionState;
  isAnalyzing: boolean;
  startAnalysis: () => Promise<void>;
  stopAnalysis: () => void;
}

const EmotionContext = createContext<EmotionContextValue | null>(null);

const ANALYSIS_INTERVAL_MS = 500; // update emotion every 500ms

export function EmotionProvider({ children }: { children: React.ReactNode }) {
  const [emotion, setEmotion] = useState<EmotionState>("idle");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const audioCtxRef  = useRef<AudioContext | null>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopAnalysis = useCallback(() => {
    if (intervalRef.current)  { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (streamRef.current)    { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (audioCtxRef.current)  { audioCtxRef.current.close(); audioCtxRef.current = null; }
    analyserRef.current = null;
    setIsAnalyzing(false);
    setEmotion("idle");
  }, []);

  const startAnalysis = useCallback(async () => {
    if (isAnalyzing) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
      streamRef.current = stream;

      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.6;
      analyserRef.current = analyser;

      const src = ctx.createMediaStreamSource(stream);
      src.connect(analyser);

      setIsAnalyzing(true);

      // Poll at ANALYSIS_INTERVAL_MS
      intervalRef.current = setInterval(() => {
        if (!analyserRef.current || !audioCtxRef.current) return;
        const features = extractFeaturesFromAnalyser(
          analyserRef.current,
          audioCtxRef.current.sampleRate
        );
        const newEmotion = classifyEmotion(features);
        setEmotion(newEmotion);
      }, ANALYSIS_INTERVAL_MS);

    } catch (err) {
      console.error("EmotionContext: mic access failed", err);
      setIsAnalyzing(false);
    }
  }, [isAnalyzing]);

  // Auto-cleanup on unmount
  useEffect(() => () => stopAnalysis(), [stopAnalysis]);

  return (
    <EmotionContext.Provider value={{ emotion, isAnalyzing, startAnalysis, stopAnalysis }}>
      {children}
    </EmotionContext.Provider>
  );
}

export function useEmotion(): EmotionContextValue {
  const ctx = useContext(EmotionContext);
  if (!ctx) throw new Error("useEmotion must be used inside <EmotionProvider>");
  return ctx;
}
