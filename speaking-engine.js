import { Model } from 'vosk-browser';

const modelUrl = new URL('./vosk-model-small-kz-0.42.tar.gz', import.meta.url).href;
let pendingModel;

function openModel() {
  return new Promise((resolve, reject) => {
    const model = new Model(modelUrl, -1);
    const timeout = setTimeout(() => failed(new Error('Model loading timed out')), 150_000);
    function failed(error) {
      clearTimeout(timeout);
      model.terminate();
      reject(error);
    }
    model.addEventListener('error', ({ detail }) => failed(new Error(detail?.error)), { once: true });
    model.addEventListener('load', ({ detail }) => {
      clearTimeout(timeout);
      if (detail?.result) resolve(model);
      else failed(new Error('Could not load model'));
    }, { once: true });
  });
}

export async function recognizeSpeech(audio) {
  pendingModel ??= openModel().catch((error) => {
    pendingModel = undefined;
    throw error;
  });
  const model = await pendingModel;
  const recognizer = new model.KaldiRecognizer(audio.sampleRate);
  return new Promise((resolve, reject) => {
    let flushing = false;
    const words = [];
    const timeout = setTimeout(() => finish(new Error('Word recognition timed out')), 25_000);
    function finish(error) {
      clearTimeout(timeout);
      recognizer.remove();
      if (error) reject(error);
      else resolve(words.join(' '));
    }
    function receive({ result }) {
      if (result?.text) words.push(result.text.trim());
      if (flushing) finish();
      else {
        flushing = true;
        recognizer.retrieveFinalResult();
      }
    }
    recognizer.on('result', receive);
    recognizer.on('partialresult', receive);
    recognizer.addEventListener('error', ({ detail }) => finish(new Error(detail?.error)), { once: true });
    recognizer.acceptWaveform(audio);
  });
}
