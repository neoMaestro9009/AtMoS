// src/hooks/useAtmosVoice.ts
import { useState, useEffect, useRef } from "react";
import { AtmosVoiceEngine, AtmosCommand } from "../engines/atmosVoiceEngine";
import { speak } from "../engines/atmosTTS";
import { useEmergency } from "../contexts/EmergencyContext";

interface AtmosHandlers {
  startFace:    () => void;
  stopFace:     () => void;
  startFinger:  () => void;
  stopFinger:   () => void;
  startSonar:   () => void;
  stopSonar:    () => void;
  startAudio:   () => void;
  stopAudio:    () => void;
  openBalance:  () => void;
  closeBalance: () => void;
  stepBackMode: () => void;
  mirrorMode:   () => void;
}

export function useAtmosVoice(handlers: AtmosHandlers) {
  const [isListening, setIsListening]   = useState(false);
  const [wakeActive,  setWakeActive]    = useState(false);
  const [error,       setError]         = useState<string | null>(null);
  const engineRef = useRef<AtmosVoiceEngine | null>(null);

  const { activateEmergency } = useEmergency();

  useEffect(() => {
    engineRef.current = new AtmosVoiceEngine({

      onCommand: (cmd: AtmosCommand) => {
        switch (cmd) {
          case "start_face":
            handlers.startFace();
            speak("تم تشغيل تتبع الوجه", "focused");
            break;
          case "stop_face":
            handlers.stopFace();
            speak("تم إيقاف تتبع الوجه", "calm");
            break;
          case "start_finger":
            handlers.startFinger();
            speak("تم تشغيل قياس الإصبع", "focused");
            break;
          case "stop_finger":
            handlers.stopFinger();
            speak("تم إيقاف قياس الإصبع", "calm");
            break;
          case "start_sonar":
            handlers.startSonar();
            speak("تم تشغيل التحليل الصوتي", "focused");
            break;
          case "stop_sonar":
            handlers.stopSonar();
            speak("تم إيقاف التحليل الصوتي", "calm");
            break;
          case "start_audio":
            handlers.startAudio();
            speak("تم تشغيل الجلسة الصوتية", "focused");
            break;
          case "stop_audio":
            handlers.stopAudio();
            speak("تم إيقاف الجلسة", "calm");
            break;
          case "activate_emergency":
            speak("تنبيه! تفعيل وضع الطوارئ", "danger");
            activateEmergency();
            break;
          case "open_balance":
            speak("حاضر... خد نفس", "calm");
            handlers.openBalance();
            break;
          case "close_balance":
            speak("تمام", "calm");
            handlers.closeBalance();
            break;
          case "step_back_mode":
            speak("خطوة لوراء", "calm");
            handlers.stepBackMode();
            break;
          case "mirror_mode":
            speak("تمام... واجه نفسك بهدوء", "calm");
            handlers.mirrorMode();
            break;
        }
        setWakeActive(false);
      },

      onListeningState: setIsListening,

      onWakeWord: () => {
        setWakeActive(true);
        speak("نعم، أنا هنا", "calm");
      },

      onWakeExpired: () => {
        setWakeActive(false);
      },

      onError: setError,
    });

    return () => {
      engineRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isListening,
    wakeActive,
    error,
    startListening: () => engineRef.current?.start(),
    stopListening:  () => engineRef.current?.stop(),
  };
}
