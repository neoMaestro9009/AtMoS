// src/lib/atmosTTS.ts
// Adaptive Text-To-Speech engine for AtMoS
// Supports "calm", "danger", "focused" voice modes.

export type TTSMode = "calm" | "danger" | "focused" | "default";

interface TTSParams {
  rate: number;
  pitch: number;
  volume: number;
}

const MODE_PARAMS: Record<TTSMode, TTSParams> = {
  calm:    { rate: 0.80, pitch: 0.90, volume: 0.85 },
  danger:  { rate: 1.15, pitch: 1.15, volume: 1.00 },
  focused: { rate: 0.95, pitch: 1.00, volume: 0.90 },
  default: { rate: 0.90, pitch: 1.00, volume: 0.85 },
};

/**
 * Speak text through the device's TTS engine.
 * @param text  Arabic text to speak
 * @param mode  Voice mode affecting prosody
 */
export function speak(text: string, mode: TTSMode = "default"): void {
  if (!("speechSynthesis" in window)) return;

  const synth = window.speechSynthesis;
  synth.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ar-EG";

  const params = MODE_PARAMS[mode];
  utter.rate   = params.rate;
  utter.pitch  = params.pitch;
  utter.volume = params.volume;

  // Prefer Arabic voice if available
  const voices = synth.getVoices();
  const arVoice = voices.find((v) => v.lang.startsWith("ar"));
  if (arVoice) utter.voice = arVoice;

  synth.speak(utter);
}

/**
 * Cancel any ongoing speech.
 */
export function stopSpeaking(): void {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Check if TTS is currently speaking.
 */
export function isSpeaking(): boolean {
  return "speechSynthesis" in window && window.speechSynthesis.speaking;
}
