// src/components/NexusEmergencyPanel.tsx
// Full-screen emergency override — Nexus Black Box.
// Renders above everything (z-[9999]) when emergencyActive is true.
// Activates camera + mic recording, announces via AtMoS TTS, logs all events.

import React, { useEffect, useRef, useState } from "react";
import { useEmergency } from "../contexts/EmergencyContext";
import { speak } from "../engines/atmosTTS";
import { logEmergencyEvent } from "../engines/emergencyLogger";

// How long to show the "cancelling…" animation before truly stopping
const CANCEL_FEEDBACK_MS = 800;

export function NexusEmergencyPanel() {
  const { emergencyActive, deactivateEmergency, emergencyTimestamp } = useEmergency();

  const videoRef          = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const chunksRef         = useRef<BlobPart[]>([]);

  const [isRecording,   setIsRecording]   = useState(false);
  const [cancelling,    setCancelling]    = useState(false);
  const [elapsed,       setElapsed]       = useState(0);

  // ── Start camera + recording when emergency activates ──────────────
  useEffect(() => {
    if (!emergencyActive) {
      // Clean up if deactivated externally
      stopRecording();
      setElapsed(0);
      return;
    }

    speak(
      "تنبيه حرج! تم تفعيل وضع الطوارئ. جاري توثيق الأحداث وتفعيل الصندوق الأسود.",
      "danger"
    );
    logEmergencyEvent("NexusPanel: Emergency UI mounted — black box starting");

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: true })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        chunksRef.current = [];
        const recorder = new MediaRecorder(stream, {
          mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
            ? "video/webm;codecs=vp9"
            : "video/webm",
        });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: "video/webm" });
          logEmergencyEvent(
            `NexusPanel: Blackbox recording saved — ${(blob.size / 1024).toFixed(1)} KB`
          );
          // Offer download so user/caretaker can retrieve evidence
          const url = URL.createObjectURL(blob);
          const a   = document.createElement("a");
          a.href     = url;
          a.download = `atmos_emergency_${Date.now()}.webm`;
          a.click();
          URL.revokeObjectURL(url);
        };

        recorder.start(1000); // slice every 1s
        setIsRecording(true);
      })
      .catch((err) => {
        console.error("NexusPanel: camera access denied", err);
        logEmergencyEvent(`NexusPanel: Camera/Mic access denied — ${err.message}`);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emergencyActive]);

  // ── Elapsed timer ──────────────────────────────────────────────────
  useEffect(() => {
    if (!emergencyActive || !emergencyTimestamp) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - emergencyTimestamp) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [emergencyActive, emergencyTimestamp]);

  // ── Cancel handler ─────────────────────────────────────────────────
  const handleCancel = () => {
    if (cancelling) return;
    setCancelling(true);
    speak("تم إلغاء حالة الطوارئ. العودة للأنظمة الطبيعية.", "calm");
    logEmergencyEvent("NexusPanel: User cancelled — False Alarm");
    setTimeout(() => {
      stopRecording();
      deactivateEmergency();
      setCancelling(false);
    }, CANCEL_FEEDBACK_MS);
  };

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setIsRecording(false);
  }

  // ── Render nothing when inactive ───────────────────────────────────
  if (!emergencyActive) return null;

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center p-6">
      {/* Red pulse overlay */}
      <div className="absolute inset-0 bg-red-600/10 animate-pulse pointer-events-none" />

      {/* Scanline effect */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,0,0,0.05) 2px, rgba(255,0,0,0.05) 4px)",
        }}
      />

      <div className="z-10 text-center w-full max-w-md">
        {/* Header */}
        <h1 className="text-red-500 text-5xl font-black mb-1 tracking-widest animate-bounce">
          🚨 طوارئ 🚨
        </h1>
        <h2 className="text-white/60 text-sm font-mono tracking-[0.3em] mb-1">
          NEXUS EMERGENCY OVERRIDE
        </h2>
        <p className="text-red-400 font-mono text-lg tracking-widest mb-6">
          {mm}:{ss}
        </p>

        <p className="text-gray-400 text-sm mb-6 px-4 leading-relaxed">
          تم تجميد جميع الأنظمة الفرعية.
          <br />
          AtMoS يُسجّل المحيط للحماية.
        </p>

        {/* Black box video */}
        <div className="relative w-full aspect-video bg-[#0d1318] rounded-xl overflow-hidden border-2 border-red-500/40 mb-6 shadow-[0_0_60px_rgba(220,38,38,0.25)]">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover opacity-75 grayscale contrast-125"
          />
          {/* REC badge */}
          {isRecording && (
            <div className="absolute top-3 right-3 flex items-center gap-2 bg-black/60 px-3 py-1 rounded-full border border-red-500/40">
              <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
              <span className="text-red-400 text-xs font-mono font-bold tracking-widest">
                REC
              </span>
            </div>
          )}
          {/* No camera fallback */}
          {!isRecording && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-red-500/50 text-xs font-mono">NO SIGNAL</span>
            </div>
          )}
        </div>

        {/* Cancel button */}
        <button
          onClick={handleCancel}
          disabled={cancelling}
          className={`w-full py-4 border-2 border-red-600 rounded-xl font-bold text-lg uppercase tracking-widest transition-all shadow-lg active:scale-95 ${
            cancelling
              ? "bg-red-600/30 text-red-400 cursor-wait"
              : "bg-red-600/20 hover:bg-red-600/40 text-red-500 hover:text-white"
          }`}
        >
          {cancelling ? "جاري الإلغاء…" : "إلغاء الإنذار"}
        </button>

        <p className="text-white/20 text-xs font-mono mt-4 tracking-widest">
          AtMoS SOVEREIGN EDGE v4 — OFFLINE PROTECTED
        </p>
      </div>
    </div>
  );
}
