import RecordRTC from 'recordrtc';

let recorder: RecordRTC | null = null;
let stream: MediaStream | null = null;

export const startRecording = async () => {
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recorder = new RecordRTC(stream, {
    type: 'audio',
    mimeType: 'audio/wav',
    recorderType: RecordRTC.StereoAudioRecorder,
    desiredSampRate: 16000,
  });
  recorder.startRecording();
};

export const stopRecording = (): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    if (recorder) {
      recorder.stopRecording(() => {
        const blob = recorder!.getBlob();
        if (stream) stream.getTracks().forEach((track) => track.stop());
        resolve(blob);
      });
    } else {
      reject(new Error('没有正在进行的录音'));
    }
  });
};

/**
 * 等待浏览器语音列表加载完成
 */
const getVoices = (): Promise<SpeechSynthesisVoice[]> => {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }
    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices());
    };
  });
};

/**
 * 文字转语音 — 支持暂停 / 继续 / 重新播放
 * 自动过滤 emoji，修复英文无法朗读问题
 */
export const speakText = async (
  text: string,
  lang: 'zh-CN' | 'en-US' = 'zh-CN'
): Promise<'playing' | 'paused' | 'resumed'> => {
  const synth = window.speechSynthesis;

  // 正在播放 → 暂停
  if (synth.speaking && !synth.paused) {
    synth.pause();
    return 'paused';
  }

  // 已暂停 → 继续
  if (synth.paused) {
    synth.resume();
    return 'resumed';
  }

  // 全新朗读
  synth.cancel();

  // 过滤 emoji，避免朗读出"图释"等奇怪读音
  const cleanText = text.replace(
    /[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u2764\u203C\u2049\u0023-\u0039]\uFE0F?/gu,
    ''
  ).trim();

  // 过滤后没有可读内容直接返回
  if (!cleanText) return 'playing';

  const voices = await getVoices();

  // 精确匹配 → 模糊匹配
  const exactMatch = voices.find((v) => v.lang === lang);
  const fuzzyMatch = voices.find((v) => v.lang.startsWith(lang.split('-')[0]));
  const selectedVoice = exactMatch || fuzzyMatch || null;

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = lang;
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  if (selectedVoice) utterance.voice = selectedVoice;

  synth.speak(utterance);
  return 'playing';
};

/**
 * 停止朗读
 */
export const stopSpeak = () => {
  window.speechSynthesis.cancel();
};

/**
 * 浏览器原生语音识别（免费，无需 OpenAI）
 */
export const startSpeechRecognition = (
  lang: 'zh' | 'en' | 'auto',
  onResult: (text: string) => void,
  onError: (err: string) => void
): (() => void) => {
  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    onError('当前浏览器不支持语音识别，请使用 Chrome');
    return () => {};
  }

  const recognition = new SpeechRecognition();
  recognition.lang = lang === 'en' ? 'en-US' : 'zh-CN';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;

  recognition.onresult = (event: any) => {
    const text = event.results[0][0].transcript;
    onResult(text);
  };

  recognition.onerror = (event: any) => {
    onError('识别失败：' + event.error);
  };

  recognition.start();

  return () => {
    try { recognition.stop(); } catch (e) { /* 忽略 */ }
  };
};