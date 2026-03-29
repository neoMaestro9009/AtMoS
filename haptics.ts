export interface HapticEventConfig {
  enabled: boolean;
  intensity: "light" | "medium" | "heavy";
  pattern: "pulse" | "wave" | "solid";
}

export interface HapticSettings {
  enabled: boolean;
  events: {
    sessionStartStop: HapticEventConfig;
    stableReading: HapticEventConfig;
    alerts: HapticEventConfig;
  };
}

const DEFAULT_EVENT_CONFIG: HapticEventConfig = {
  enabled: true,
  intensity: "medium",
  pattern: "pulse",
};

const DEFAULT_SETTINGS: HapticSettings = {
  enabled: true,
  events: {
    sessionStartStop: { ...DEFAULT_EVENT_CONFIG, pattern: "wave" },
    stableReading: { ...DEFAULT_EVENT_CONFIG, pattern: "pulse" },
    alerts: { ...DEFAULT_EVENT_CONFIG, pattern: "solid", intensity: "heavy" },
  },
};

export function getHapticSettings(): HapticSettings {
  try {
    const saved = localStorage.getItem("omni_haptic_settings");
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migrate old settings if needed
      if (typeof parsed.events?.sessionStartStop === "boolean") {
        return DEFAULT_SETTINGS;
      }
      return parsed;
    }
    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveHapticSettings(settings: HapticSettings) {
  localStorage.setItem("omni_haptic_settings", JSON.stringify(settings));
}

function getPattern(
  patternType: "pulse" | "wave" | "solid",
  intensity: "light" | "medium" | "heavy",
): number[] {
  const isLight = intensity === "light";
  const isHeavy = intensity === "heavy";

  const multiply = (pattern: number[]) =>
    pattern.map((v) => (isLight ? v * 0.5 : isHeavy ? v * 1.5 : v));

  switch (patternType) {
    case "pulse":
      return multiply([30, 50, 30]);
    case "wave":
      return multiply([20, 30, 40, 30, 20]);
    case "solid":
      return multiply([100, 50, 100]);
    default:
      return multiply([30, 50, 30]);
  }
}

export function triggerHaptic(
  type: "start" | "stop" | "success" | "warning" | "tick",
) {
  const settings = getHapticSettings();
  if (!settings.enabled || !navigator.vibrate) return;

  let config: HapticEventConfig | null = null;

  switch (type) {
    case "start":
    case "stop":
      config = settings.events.sessionStartStop;
      break;
    case "success":
      config = settings.events.stableReading;
      break;
    case "warning":
      config = settings.events.alerts;
      break;
    case "tick":
      navigator.vibrate(10); // Simple tick doesn't need full config
      return;
  }

  if (config && config.enabled) {
    navigator.vibrate(getPattern(config.pattern, config.intensity));
  }
}
