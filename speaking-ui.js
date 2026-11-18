import { LISTENING_CLIPS } from './listening.js';
import { listeningSources } from './listening-media.js';
import { compareSpeech, measureRecording, recordingAdvice } from './speaking.js';

const recordingLimit = 9_000;

export function setupSpeaking({ elem, kazakh, stopSpeech, onAudible }) {
  const root = document.querySelector('#speaking');
  const find = (selector) => root.querySelector(selector);
  const phrase = find('#speaking-phrase');
  const translation = find('#speaking-translation');
  const counter = find('#speaking-step');
  const lesson = find('#speaking-lesson');
  const hear = find('#speaking-hear');
  const mic = find('#speaking-mic');
  const check = find('#speaking-check');
  const playback = find('#speaking-playback');
  const status = find('#speaking-status');
  const result = find('#speaking-result');
  const example = find('#speaking-example');
  const supported = window.isSecureContext && typeof MediaRecorder === 'function' && Boolean(navigator.mediaDevices?.getUserMedia);
  let index = 0;
  let take;
  let capture;

  function closeCapture(session) {
    clearTimeout(session.timer);
    session.stream?.getTracks().forEach((track) => track.stop());
  }

  function clearTake() {
    playback.pause();
    playback.removeAttribute('src');
    playback.load();
    playback.hidden = true;
    if (take?.url) URL.revokeObjectURL(take.url);
    take = undefined;
    check.hidden = true;
    check.disabled = false;
    result.replaceChildren();
  }

  function updateControls() {
    const recording = capture?.recorder?.state === 'recording';
    root.dataset.recording = String(Boolean(recording));
    mic.disabled = !supported || (Boolean(capture) && !recording);
    mic.textContent = recording ? 'Остановить запись' : take ? 'Записать заново' : 'Записать голос';
    hear.disabled = Boolean(capture);
  }

  function stop() {
    example.pause();
    playback.pause();
    if (!capture) return;
    const session = capture;
    capture = undefined;
    if (session.recorder?.state === 'recording') session.recorder.stop();
    closeCapture(session);
    status.textContent = 'Запись остановлена.';
    updateControls();
  }

  function showPhrase() {
    const clip = LISTENING_CLIPS[index];
    stop();
    clearTake();
    example.src = new URL(listeningSources[clip.id], import.meta.url).href;
    phrase.textContent = clip.kk;
    translation.textContent = clip.ru;
    counter.textContent = 'Фраза ' + (index + 1) + ' из ' + LISTENING_CLIPS.length + ' · ' + clip.level;
    lesson.textContent = 'Урок «' + clip.title + '» ↗';
    lesson.href = '?lesson=' + encodeURIComponent(clip.lesson);
    status.textContent = supported ? '' : 'Микрофон недоступен. Образец можно прослушать.';
    updateControls();
  }

  async function showRecording(blob) {
    if (!blob.size) {
      status.textContent = 'Запись не получилась. Произнеси фразу после начала записи.';
      return;
    }
    const recording = { url: URL.createObjectURL(blob) };
    take = recording;
    playback.src = recording.url;
    playback.hidden = false;
    status.textContent = 'Запись готова. Проверяю громкость…';
    updateControls();
    try {
      const decoder = new OfflineAudioContext(1, 1, 16_000);
      recording.audio = await decoder.decodeAudioData(await blob.arrayBuffer());
      if (take !== recording) return;
      const measured = measureRecording(recording.audio.getChannelData(0), recording.audio.sampleRate);
      status.textContent = recordingAdvice(measured, example.duration);
      if (measured.audible) {
        check.hidden = false;
        onAudible();
      }
    } catch {
      if (take === recording) status.textContent = 'Запись готова. Прослушай её рядом с образцом.';
    }
  }

  async function record() {
    if (capture?.recorder?.state === 'recording') {
      capture.recorder.stop();
      updateControls();
      return;
    }
    if (!supported || capture) return;
    stopSpeech();
    clearTake();
    const session = {};
    capture = session;
    status.textContent = 'Запрашиваю доступ к микрофону…';
    updateControls();
    try {
      session.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });
      if (capture !== session) {
        closeCapture(session);
        return;
      }
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = new MediaRecorder(session.stream, mimeType ? { mimeType } : undefined);
      session.recorder = recorder;
      const chunks = [];
      recorder.addEventListener('dataavailable', ({ data }) => {
        if (data.size) chunks.push(data);
      });
      recorder.addEventListener('error', () => {
        if (capture !== session) return;
        stop();
        status.textContent = 'Не удалось записать звук. Попробуй ещё раз.';
      }, { once: true });
      recorder.addEventListener('stop', () => {
        closeCapture(session);
        if (capture !== session) return;
        capture = undefined;
        updateControls();
        void showRecording(new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type }));
      }, { once: true });
      recorder.start();
      session.timer = setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
        updateControls();
      }, recordingLimit);
      status.textContent = 'Запись идёт. Произнеси фразу.';
      updateControls();
    } catch (error) {
      closeCapture(session);
      if (capture !== session) return;
      capture = undefined;
      updateControls();
      status.textContent = error.name === 'NotAllowedError'
        ? 'Разреши доступ к микрофону в настройках сайта и попробуй снова.'
        : 'Не удалось открыть микрофон. Проверь, что он подключён и свободен.';
    }
  }

  hear.addEventListener('click', () => {
    stopSpeech();
    if (example.readyState > 0) example.currentTime = 0;
    void example.play().catch((error) => {
      if (error.name !== 'AbortError') status.textContent = 'Не удалось воспроизвести образец. Попробуй ещё раз.';
    });
  });
  playback.addEventListener('play', () => example.pause());
  mic.addEventListener('click', () => { void record(); });
  check.addEventListener('click', async () => {
    const recording = take;
    if (!recording?.audio || check.disabled) return;
    const clip = LISTENING_CLIPS[index];
    check.disabled = true;
    result.replaceChildren(elem('p', '', 'Проверяю слова. При первом запуске модель загружается на устройство…'));
    try {
      const { recognizeSpeech } = await import('./speaking-engine.js');
      const transcript = await recognizeSpeech(recording.audio);
      if (take !== recording) return;
      if (!transcript) {
        result.replaceChildren(elem('p', '', 'Распознавание не разобрало слова. Повтори фразу в тихом месте.'));
        return;
      }
      const { alignment, matches, extra } = compareSpeech(clip.kk, transcript);
      const verdict = matches === alignment.length && !extra
        ? 'Распознаны все слова в нужном порядке.'
        : 'Совпало слов: ' + matches + ' из ' + alignment.length + '.';
      const recognized = elem('p');
      recognized.append('Распознано: ', kazakh('span', '', transcript));
      const pills = elem('div', 'speaking-words');
      for (const { word, matched } of alignment) {
        const item = kazakh('span', '', word);
        item.dataset.match = String(matched);
        item.append(elem('span', 'sr-only', matched ? ', совпало' : ', стоит повторить'));
        pills.append(item);
      }
      result.replaceChildren(elem('strong', '', verdict), recognized, pills);
    } catch {
      if (take === recording) result.replaceChildren(elem('p', '', 'Проверка слов сейчас недоступна. Образец и твоя запись готовы к прослушиванию.'));
    } finally {
      if (take === recording) check.disabled = false;
    }
  });
  find('#speaking-next').addEventListener('click', () => {
    index = (index + 1) % LISTENING_CLIPS.length;
    showPhrase();
    phrase.focus({ preventScroll: true });
  });
  window.addEventListener('pagehide', () => { stop(); clearTake(); updateControls(); });
  showPhrase();
  return { stop, reset: showPhrase };
}
