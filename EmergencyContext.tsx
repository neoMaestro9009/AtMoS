// src/context/EmergencyContext.tsx
// Global emergency state — shared across NexusEmergencyPanel, useNeuralFusion, useAtmosVoice.
// Kept intentionally minimal: activate, deactivate, read status.

import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { logEmergencyEvent } from "../engines/emergencyLogger";

interface EmergencyContextValue {
  emergencyActive: boolean;
  activateEmergency: () => void;
  deactivateEmergency: () => void;
  emergencyTimestamp: number | null; // ms since epoch when emergency was triggered
}

const EmergencyContext = createContext<EmergencyContextValue | null>(null);

export function EmergencyProvider({ children }: { children: React.ReactNode }) {
  const [emergencyActive, setEmergencyActive] = useState(false);
  const [emergencyTimestamp, setEmergencyTimestamp] = useState<number | null>(null);

  // Guard: prevent rapid re-triggers (e.g., fusion engine firing every 2s)
  const cooldownRef = useRef(false);
  const COOLDOWN_MS = 15_000; // 15s between auto-activations

  const activateEmergency = useCallback(() => {
    if (emergencyActive || cooldownRef.current) return;

    cooldownRef.current = true;
    const ts = Date.now();
    setEmergencyActive(true);
    setEmergencyTimestamp(ts);
    logEmergencyEvent(`EmergencyContext: Emergency ACTIVATED at ${new Date(ts).toISOString()}`);

    // Allow re-trigger after cooldown (manual cancel resets this anyway)
    setTimeout(() => { cooldownRef.current = false; }, COOLDOWN_MS);
  }, [emergencyActive]);

  const deactivateEmergency = useCallback(() => {
    if (!emergencyActive) return;
    setEmergencyActive(false);
    setEmergencyTimestamp(null);
    cooldownRef.current = false;
    logEmergencyEvent("EmergencyContext: Emergency DEACTIVATED (user cancelled)");
  }, [emergencyActive]);

  return (
    <EmergencyContext.Provider
      value={{ emergencyActive, activateEmergency, deactivateEmergency, emergencyTimestamp }}
    >
      {children}
    </EmergencyContext.Provider>
  );
}

export function useEmergency(): EmergencyContextValue {
  const ctx = useContext(EmergencyContext);
  if (!ctx) throw new Error("useEmergency must be used inside <EmergencyProvider>");
  return ctx;
}
