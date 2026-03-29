import React, { useState, useEffect } from "react";
import {
  X,
  Vibrate,
  Save,
  Clock,
  Settings as SettingsIcon,
  Volume2,
} from "lucide-react";
import {
  getHapticSettings,
  saveHapticSettings,
  HapticSettings,
} from "../engines/haptics";
import { getProtocols, saveProtocols, Protocol } from "../engines/audioEngine";

// ── Session Duration persistence ──────────────────────────────────────────
const SESSION_DURATION_KEY = "omni_defaultSessionDuration";
export function getDefaultSessionDuration(): number {
  const saved = localStorage.getItem(SESSION_DURATION_KEY);
  return saved ? parseInt(saved, 10) : 20;
}
function saveDefaultSessionDuration(minutes: number) {
  localStorage.setItem(SESSION_DURATION_KEY, String(minutes));
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDuration?: number;
  onDefaultDurationChange?: (minutes: number) => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  defaultDuration = 20,
  onDefaultDurationChange,
}: SettingsModalProps) {
  const [settings, setSettings] = useState<HapticSettings>(getHapticSettings());
  const [sessionMin, setSessionMin] = useState<number>(defaultDuration);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [activeTab, setActiveTab] = useState<"general" | "audio">("general");

  useEffect(() => {
    if (isOpen) {
      setSettings(getHapticSettings());
      setSessionMin(getDefaultSessionDuration());
      setProtocols(getProtocols());
      setActiveTab("general");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    saveHapticSettings(settings);
    saveDefaultSessionDuration(sessionMin);
    saveProtocols(protocols);
    onDefaultDurationChange?.(sessionMin);
    onClose();
  };

  const updateProtocol = (id: string, updates: Partial<Protocol>) => {
    setProtocols((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0d1318] border border-[#1e2d3d] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-[#1e2d3d] shrink-0">
          <h2 className="font-mono text-sm tracking-widest text-[#c8d8e8] uppercase flex items-center gap-2">
            <SettingsIcon size={16} className="text-[#00c8e8]" />
            الإعدادات
          </h2>
          <button
            onClick={onClose}
            className="text-[#6a8099] hover:text-[#e04040] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex border-b border-[#1e2d3d] shrink-0">
          <button
            onClick={() => setActiveTab("general")}
            className={`flex-1 py-3 text-xs font-mono uppercase tracking-wider transition-colors ${
              activeTab === "general"
                ? "text-[#00c8e8] border-b-2 border-[#00c8e8]"
                : "text-[#6a8099] hover:text-[#c8d8e8]"
            }`}
          >
            عام
          </button>
          <button
            onClick={() => setActiveTab("audio")}
            className={`flex-1 py-3 text-xs font-mono uppercase tracking-wider transition-colors ${
              activeTab === "audio"
                ? "text-[#00c8e8] border-b-2 border-[#00c8e8]"
                : "text-[#6a8099] hover:text-[#c8d8e8]"
            }`}
          >
            الصوت
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {activeTab === "general" && (
            <>
              {/* ── Session Duration ─────────────────────────────────── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Clock size={14} className="text-[#00c8e8]" />
                  <div className="text-sm font-medium text-[#c8d8e8]">
                    مدة الجلسة الافتراضية
                  </div>
                </div>
                <div className="text-xs text-[#6a8099] mb-3">
                  يُطبَّق هذا الإعداد عند بدء جلسة صوتية جديدة. القيمة
                  الافتراضية: 20 دقيقة.
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={5}
                    max={90}
                    step={5}
                    value={sessionMin}
                    onChange={(e) => setSessionMin(Number(e.target.value))}
                    className="flex-1 h-1.5 bg-[#263545] rounded-full appearance-none
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                      [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                      [&::-webkit-slider-thumb]:bg-[#00c8e8] [&::-webkit-slider-thumb]:border-2
                      [&::-webkit-slider-thumb]:border-[#080c10]"
                  />
                  <span className="font-mono text-[#00c8e8] text-sm min-w-[52px] text-left">
                    {sessionMin} دقيقة
                  </span>
                </div>
                {/* Quick presets */}
                <div className="flex gap-2 mt-2">
                  {[5, 10, 20, 30, 45, 60].map((m) => (
                    <button
                      key={m}
                      onClick={() => setSessionMin(m)}
                      className={`flex-1 py-1 rounded text-[10px] font-mono transition-all border ${
                        sessionMin === m
                          ? "bg-[#00c8e8]/10 border-[#00c8e8] text-[#00c8e8]"
                          : "bg-[#131a22] border-[#1e2d3d] text-[#6a8099] hover:border-[#263545]"
                      }`}
                    >
                      {m}د
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Haptic Global Toggle ──────────────────────────────── */}
              <div className="border-t border-[#1e2d3d] pt-5">
                <div className="flex items-center gap-2 mb-4">
                  <Vibrate size={14} className="text-[#00c8e8]" />
                  <div className="text-sm font-medium text-[#c8d8e8]">
                    التفاعل اللمسي
                  </div>
                </div>

                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm text-[#c8d8e8]">تفعيل الاهتزاز</div>
                    <div className="text-xs text-[#6a8099]">
                      تشغيل أو إيقاف التفاعل اللمسي بالكامل
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={settings.enabled}
                      onChange={(e) =>
                        setSettings({ ...settings, enabled: e.target.checked })
                      }
                    />
                    <div className="w-11 h-6 bg-[#131a22] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#6a8099] peer-checked:after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00c8e8] border border-[#1e2d3d]"></div>
                  </label>
                </div>

                {/* Events */}
                <div
                  className={`space-y-4 mt-4 ${!settings.enabled ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <div className="text-sm font-medium text-[#c8d8e8] border-b border-[#1e2d3d] pb-2">
                    تخصيص الأحداث
                  </div>

                  {[
                    { key: "sessionStartStop", label: "بدء/إيقاف الجلسة" },
                    {
                      key: "stableReading",
                      label: "التقاط إشارة حيوية مستقرة",
                    },
                    { key: "alerts", label: "تنبيهات النبض (مرتفع/منخفض)" },
                  ].map(({ key, label }) => {
                    const eventConfig =
                      settings.events[key as keyof typeof settings.events];
                    return (
                      <div
                        key={key}
                        className="bg-[#131a22] border border-[#1e2d3d] rounded-lg p-3 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#c8d8e8]">
                            {label}
                          </span>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={eventConfig?.enabled ?? true}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  events: {
                                    ...settings.events,
                                    [key]: {
                                      ...eventConfig,
                                      enabled: e.target.checked,
                                    },
                                  },
                                })
                              }
                              className="sr-only peer"
                            />
                            <div className="w-8 h-4 bg-[#0d1318] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#6a8099] peer-checked:after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#00c8e8] border border-[#1e2d3d]"></div>
                          </label>
                        </div>

                        {(eventConfig?.enabled ?? true) && (
                          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#1e2d3d]">
                            <div>
                              <label className="block text-[10px] text-[#6a8099] mb-1">
                                النمط
                              </label>
                              <select
                                value={eventConfig?.pattern ?? "pulse"}
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    events: {
                                      ...settings.events,
                                      [key]: {
                                        ...eventConfig,
                                        pattern: e.target.value as any,
                                      },
                                    },
                                  })
                                }
                                className="w-full bg-[#0d1318] border border-[#1e2d3d] rounded px-2 py-1 text-xs text-[#c8d8e8] focus:border-[#00c8e8] outline-none"
                              >
                                <option value="pulse">نبض</option>
                                <option value="wave">موجة</option>
                                <option value="solid">مستمر</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] text-[#6a8099] mb-1">
                                القوة
                              </label>
                              <select
                                value={eventConfig?.intensity ?? "medium"}
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    events: {
                                      ...settings.events,
                                      [key]: {
                                        ...eventConfig,
                                        intensity: e.target.value as any,
                                      },
                                    },
                                  })
                                }
                                className="w-full bg-[#0d1318] border border-[#1e2d3d] rounded px-2 py-1 text-xs text-[#c8d8e8] focus:border-[#00c8e8] outline-none"
                              >
                                <option value="light">خفيف</option>
                                <option value="medium">متوسط</option>
                                <option value="heavy">قوي</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {activeTab === "audio" && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-2">
                <Volume2 size={14} className="text-[#00c8e8]" />
                <div className="text-sm font-medium text-[#c8d8e8]">
                  إعدادات الصوت المتقدمة
                </div>
              </div>
              <div className="text-xs text-[#6a8099] mb-4">
                تخصيص الترددات وشكل الموجة لكل بروتوكول صوتي.
              </div>

              <div className="space-y-4">
                {protocols.map((p) => (
                  <div
                    key={p.id}
                    className="bg-[#131a22] border border-[#1e2d3d] rounded-lg p-4 space-y-3"
                  >
                    <div className="text-sm font-bold text-[#c8d8e8]">
                      {p.name}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] text-[#6a8099] mb-1">
                          التردد الحامل (Hz)
                        </label>
                        <input
                          type="number"
                          value={p.carrier}
                          onChange={(e) =>
                            updateProtocol(p.id, {
                              carrier: Number(e.target.value),
                            })
                          }
                          className="w-full bg-[#0d1318] border border-[#1e2d3d] rounded px-2 py-1 text-xs text-[#c8d8e8] focus:border-[#00c8e8] outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#6a8099] mb-1">
                          تردد النبض (Hz)
                        </label>
                        <input
                          type="number"
                          value={p.beat}
                          step="0.1"
                          onChange={(e) =>
                            updateProtocol(p.id, {
                              beat: Number(e.target.value),
                            })
                          }
                          className="w-full bg-[#0d1318] border border-[#1e2d3d] rounded px-2 py-1 text-xs text-[#c8d8e8] focus:border-[#00c8e8] outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] text-[#6a8099] mb-1">
                        شكل الموجة
                      </label>
                      <select
                        value={p.waveformShape || "sine"}
                        onChange={(e) =>
                          updateProtocol(p.id, {
                            waveformShape: e.target.value as any,
                          })
                        }
                        className="w-full bg-[#0d1318] border border-[#1e2d3d] rounded px-2 py-1 text-xs text-[#c8d8e8] focus:border-[#00c8e8] outline-none"
                      >
                        <option value="sine">Sine (جيبية)</option>
                        <option value="square">Square (مربعة)</option>
                        <option value="sawtooth">Sawtooth (منشارية)</option>
                        <option value="triangle">Triangle (مثلثية)</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[#1e2d3d] bg-[#131a22] shrink-0">
          <button
            onClick={handleSave}
            className="w-full py-3 rounded-lg bg-[#00c8e8] text-[#080c10] font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#00e070] transition-colors"
          >
            <Save size={16} />
            حفظ الإعدادات
          </button>
        </div>
      </div>
    </div>
  );
}
