// src/lib/emergencyLogger.ts

const LOG_KEY = "omni_emergency_logs";

export interface EmergencyLog {
  timestamp: string;
  event: string;
}

export function logEmergencyEvent(event: string): void {
  const timestamp = new Date().toISOString();
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const logs: EmergencyLog[] = raw ? JSON.parse(raw) : [];
    logs.push({ timestamp, event });
    // Keep last 200 entries only
    if (logs.length > 200) logs.splice(0, logs.length - 200);
    localStorage.setItem(LOG_KEY, JSON.stringify(logs));
  } catch {
    // Storage might be unavailable
    console.warn("emergencyLogger: could not persist log", event);
  }
}

export function getEmergencyLogs(): EmergencyLog[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearEmergencyLogs(): void {
  localStorage.removeItem(LOG_KEY);
}
