/**
 * Safe wrapper for expo-speech-recognition.
 * Falls back to no-ops when running in Expo Go (native module unavailable).
 */

let _module: any = null;
let _useSpeechRecognitionEvent: any = null;
let _isAvailable = false;

try {
  const speechRecognition = require("expo-speech-recognition");
  _module = speechRecognition.ExpoSpeechRecognitionModule;
  _useSpeechRecognitionEvent = speechRecognition.useSpeechRecognitionEvent;
  _isAvailable = true;
} catch {
  _isAvailable = false;
}

/** Whether the native speech recognition module is available. */
export const isSpeechRecognitionAvailable = _isAvailable;

/** Safe proxy for ExpoSpeechRecognitionModule — all methods no-op if unavailable. */
export const SafeSpeechRecognitionModule = {
  start: async (options?: any) => {
    if (_module) return _module.start(options);
  },
  stop: async () => {
    if (_module) return _module.stop();
  },
  requestPermissionsAsync: async (): Promise<{ granted: boolean }> => {
    if (_module) return _module.requestPermissionsAsync();
    return { granted: false };
  },
};

/** Safe hook wrapper — no-ops if the module is unavailable. */
export function useSafeSpeechRecognitionEvent(
  event: string,
  handler: (event: any) => void
) {
  if (_useSpeechRecognitionEvent) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    _useSpeechRecognitionEvent(event, handler);
  }
}
