import { useState, useEffect, useCallback } from 'react';

// ── BioRecord ────────────────────────────────────────────────────────────────
// Single physiological snapshot saved after a completed measurement session.
// Optional fields are populated only when the corresponding sensor was active.
export interface BioRecord {
  id:        string;
  timestamp: number;

  // Core vitals (always present when ContactPPG or RemotePPG was active)
  bpm:       number;
  hrv:       number;       // RMSSD in ms

  // Derived indices from BayesianFusion
  stressIdx:    number;    // 0–100 (higher = more stress)
  coherenceIdx: number;    // 0–100 (higher = better HRV coherence)
  vitalityIdx?: number;    // 0–100 (resting HR + HRV fitness score)
  focusIdx?:    number;    // 0–100 (HRV + low micro-expression)

  // Breathing (populated when SonarEngine was active)
  breathRate?:       number;   // breaths per minute
  breathDepth?:      number;   // 0–100 depth score
  breathRegularity?: number;   // 0–100 regularity score

  // Session metadata
  sessionDurationSec?: number;
  protocolId?:         string; // audio protocol used (e.g. 'gamma40')
  notes?:              string;
}

// ── Storage ──────────────────────────────────────────────────────────────────
const STORAGE_KEY  = 'omni_bio_history';
const MAX_RECORDS  = 500;                  // ~500 sessions ≈ ~1.5 years daily
const MAX_DAYS_TTL = 90;                   // auto-prune records older than 90 days

function loadFromStorage(): BioRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as BioRecord[];
  } catch {
    return [];
  }
}

function saveToStorage(records: BioRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (e) {
    // localStorage quota exceeded — prune aggressively and retry
    const pruned = records.slice(-Math.floor(MAX_RECORDS / 2));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
    } catch {
      // Silent fail — don't break the app over storage issues
    }
  }
}

function pruneOldRecords(records: BioRecord[]): BioRecord[] {
  const cutoff = Date.now() - MAX_DAYS_TTL * 24 * 60 * 60 * 1000;
  const pruned = records.filter(r => r.timestamp >= cutoff);
  // Also enforce hard cap
  return pruned.length > MAX_RECORDS ? pruned.slice(-MAX_RECORDS) : pruned;
}

// ── Stats ────────────────────────────────────────────────────────────────────
export interface BioStats {
  totalSessions: number;
  avgBpm:        number | null;
  avgHrv:        number | null;
  avgStress:     number | null;
  avgCoherence:  number | null;
  avgBreathRate: number | null;
  firstRecord:   number | null;  // timestamp
  lastRecord:    number | null;  // timestamp
}

function computeStats(records: BioRecord[]): BioStats {
  if (records.length === 0) {
    return {
      totalSessions: 0,
      avgBpm: null, avgHrv: null, avgStress: null,
      avgCoherence: null, avgBreathRate: null,
      firstRecord: null, lastRecord: null,
    };
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;

  return {
    totalSessions: records.length,
    avgBpm:        avg(records.map(r => r.bpm).filter(Boolean)),
    avgHrv:        avg(records.map(r => r.hrv).filter(Boolean)),
    avgStress:     avg(records.map(r => r.stressIdx)),
    avgCoherence:  avg(records.map(r => r.coherenceIdx)),
    avgBreathRate: avg(records.filter(r => r.breathRate != null).map(r => r.breathRate!)),
    firstRecord:   records[0].timestamp,
    lastRecord:    records[records.length - 1].timestamp,
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export interface WeekStats {
  avgBPM:    number;
  avgStress: number;
  trend:     'improving' | 'stable' | 'declining';
}

export interface UseBioHistoryReturn {
  history:      BioRecord[];
  stats:        BioStats;
  addRecord:    (record: Omit<BioRecord, 'id' | 'timestamp'>) => void;
  removeRecord: (id: string) => void;
  clearHistory: () => void;
  getWeekStats: () => WeekStats;
}

export function useBioHistory(): UseBioHistoryReturn {
  const [history, setHistory] = useState<BioRecord[]>([]);

  // Load + prune on mount
  useEffect(() => {
    const loaded = loadFromStorage();
    const pruned = pruneOldRecords(loaded);
    // If pruning removed anything, re-persist
    if (pruned.length !== loaded.length) saveToStorage(pruned);
    setHistory(pruned);
  }, []);

  const addRecord = useCallback(
    (record: Omit<BioRecord, 'id' | 'timestamp'>) => {
      const newRecord: BioRecord = {
        ...record,
        id:        crypto.randomUUID(),
        timestamp: Date.now(),
      };

      setHistory(prev => {
        const updated = pruneOldRecords([...prev, newRecord]);
        saveToStorage(updated);
        return updated;
      });
    },
    []
  );

  const removeRecord = useCallback((id: string) => {
    setHistory(prev => {
      const updated = prev.filter(r => r.id !== id);
      saveToStorage(updated);
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const getWeekStats = useCallback((): WeekStats => {
    const weekAgo    = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weekRecs   = history.filter((r) => r.timestamp >= weekAgo);
    if (weekRecs.length === 0) return { avgBPM: 0, avgStress: 0, trend: 'stable' };

    const avgBPM    = weekRecs.reduce((s, r) => s + r.bpm,       0) / weekRecs.length;
    const avgStress = weekRecs.reduce((s, r) => s + r.stressIdx, 0) / weekRecs.length;

    const mid         = Math.floor(weekRecs.length / 2);
    const firstHalf   = weekRecs.slice(0, mid);
    const secondHalf  = weekRecs.slice(mid);
    const firstAvg    = firstHalf.length  ? firstHalf.reduce( (s, r) => s + r.stressIdx, 0) / firstHalf.length  : avgStress;
    const secondAvg   = secondHalf.length ? secondHalf.reduce((s, r) => s + r.stressIdx, 0) / secondHalf.length : avgStress;

    let trend: WeekStats['trend'] = 'stable';
    if (secondAvg < firstAvg - 5) trend = 'improving';
    else if (secondAvg > firstAvg + 5) trend = 'declining';

    return { avgBPM: Math.round(avgBPM), avgStress: Math.round(avgStress), trend };
  }, [history]);

  const stats = computeStats(history);

  return { history, stats, addRecord, removeRecord, clearHistory, getWeekStats };
}
