// Minimal Web Speech API type declarations voor iOS Safari / Chrome
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API

interface SpeechRecognitionAlternativeExtra {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultExtra {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternativeExtra;
  [index: number]: SpeechRecognitionAlternativeExtra;
}

interface SpeechRecognitionResultListExtra {
  readonly length: number;
  item(index: number): SpeechRecognitionResultExtra;
  [index: number]: SpeechRecognitionResultExtra;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListExtra;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => unknown) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => unknown) | null;
  onerror: ((this: SpeechRecognitionInstance, ev: Event) => unknown) | null;
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => unknown) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

interface Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}