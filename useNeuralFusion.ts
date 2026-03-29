// src/hooks/useNeuralFusion.ts
// Neural Fusion Engine — fuses physical, biological, and emotional signals
// to determine critical danger state and auto-trigger emergency mode.

import { useEffect, useRef } from "react";
import { useEmergency } from "../contexts/EmergencyContext";
import type { EmotionState } from "../engines/emotionEngine";
import { logEmergencyEvent } from "../engines/emergencyLogger";

const FUSION_INTERVAL_MS = 2000;
const FALL_IMPACT_THRESHOLD = 25;    // m/s² magnitude
const FALL_RESET_TIMEOUT_MS = 10000;
const DANGER_SCORE_THRESHOLD = 80;

/**
 * Watches physical impact (accelerometer), biological state (BPM),
 * and emotional state (EmotionEngine) simultaneously.
 * If the combined danger score exceeds the threshold, triggers emergency.
 */
export function useNeuralFusion(
  bpm: number | null,
  emotion: EmotionState,
  isAppActive: boolean
) {
  const { activateEmergency, emergencyActive } = useEmergency();
  const fallDetected = useRef(false);

  useEffect(() => {
    if (emergencyActive || !isAppActive) return;

    // ── 1. Physical impact monitor (Accelerometer) ────────────────────────
    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;

      const magnitude = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);

      if (magnitude > FALL_IMPACT_THRESHOLD) {
        fallDetected.current = true;
        logEmergencyEvent(`NeuralFusion: Severe impact detected (mag=${magnitude.toFixed(1)})`);
        console.warn("⚠️ AtMoS: Severe physical impact detected!");

        // Auto-reset fall flag if emergency hasn't triggered
        setTimeout(() => {
          fallDetected.current = false;
        }, FALL_RESET_TIMEOUT_MS);
      }
    };

    window.addEventListener("devicemotion", handleMotion);

    // ── 2. Fusion scoring engine ─────────────────────────────────────────
    const checkFusion = () => {
      let dangerScore = 0;

      // Physical impact contribution
      if (fallDetected.current) {
        dangerScore += 50;
      }

      // Biological state contribution
      if (bpm !== null) {
        if (bpm < 45 || bpm > 140) {
          dangerScore += 40;
        }
      }

      // Emotional state contribution
      switch (emotion) {
        case "danger":      dangerScore += 60; break;
        case "high_stress": dangerScore += 30; break;
        case "agitated":    dangerScore += 15; break;
        default: break;
      }

      if (dangerScore >= DANGER_SCORE_THRESHOLD) {
        logEmergencyEvent(
          `NeuralFusion: Critical threshold reached (score=${dangerScore}, bpm=${bpm}, emotion=${emotion})`
        );
        console.error("🚨 AtMoS NEURAL FUSION: Critical State! Triggering Emergency.");
        activateEmergency();
      }
    };

    const intervalId = setInterval(checkFusion, FUSION_INTERVAL_MS);

    return () => {
      window.removeEventListener("devicemotion", handleMotion);
      clearInterval(intervalId);
    };
  }, [bpm, emotion, activateEmergency, emergencyActive, isAppActive]);
}
