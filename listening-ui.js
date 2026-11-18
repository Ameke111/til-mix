import { LISTENING_CLIPS, listeningRound } from './listening.js';
import { listeningSources } from './listening-media.js';

export function setupListening({ elem, button, kazakh, shuffle, stopSpeech, readSolved, onAnswer }) {
  const stage = document.querySelector('#listening-stage');
  const start = document.querySelector('#listening-start');
  const level = document.querySelector('#listening-level');
  const record = document.querySelector('#listening-record');
  const preview = stage.firstElementChild.cloneNode(true);
  let media;
  let round;

  function stop() {
    media?.pause();
  }

  function updateSummary() {
    record.textContent = 'Отработано записей: ' + readSolved().length + ' из ' + LISTENING_CLIPS.length;
  }

  function startRound() {
    stopSpeech();
    round = { questions: listeningRound({ level: level.value, solved: readSolved(), shuffle }), index: 0, score: 0, skipped: 0 };
    start.textContent = 'Начать заново';
    render();
  }

  function advance() {
    round.index++;
    render();
  }

  function render() {
    stop();
    media = undefined;
    const clip = round.questions[round.index];
    if (!clip) {
      const summary = elem('div', 'listening-card');
      const heading = elem('h3', 'listening-result', 'Результат — ' + round.score + ' из ' + round.questions.length);
      heading.tabIndex = -1;
      summary.append(heading);
      if (round.skipped) summary.append(elem('p', 'listening-status', 'Пропущено записей: ' + round.skipped));
      summary.append(button('button button-primary', 'Ещё пять фраз ↗', startRound));
      stage.replaceChildren(summary);
      heading.focus({ preventScroll: true });
      return;
    }

    const card = elem('div', 'listening-card');
    const meta = elem('p', 'listening-step', 'Запись ' + (round.index + 1) + ' из ' + round.questions.length + ' · ' + clip.level);
    const heading = elem('h3', '', 'Что ты услышал?');
    const controls = elem('div', 'listening-controls');
    const wave = elem('span', 'listening-mini-wave');
    wave.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 5; index++) wave.append(elem('i'));
    const status = elem('p', 'listening-status');
    status.setAttribute('role', 'status');
    const choices = elem('div', 'listening-choices');
    const player = elem('audio');
    player.preload = 'none';
    player.src = new URL(listeningSources[clip.id], import.meta.url).href;
    media = player;
    let heard = false;
    let answered = false;

    const skip = button('text-button', 'Пропустить запись ↗', () => {
      round.skipped++;
      advance();
    });
    skip.hidden = true;
    function failed() {
      if (media !== player || answered) return;
      status.textContent = 'Запись не загрузилась. Попробуй ещё раз или пропусти её.';
      skip.hidden = false;
    }
    function play(speed) {
      stopSpeech();
      if (player.error) player.load();
      if (player.readyState > 0) player.currentTime = 0;
      player.defaultPlaybackRate = speed;
      player.playbackRate = speed;
      status.textContent = 'Загружаю запись…';
      void player.play().catch((error) => {
        if (error.name !== 'AbortError') failed();
      });
    }

    const normal = button('button button-primary', 'Прослушать', () => play(1));
    const slow = button('button button-outline', 'Медленнее', () => play(.75));
    controls.append(normal, slow, wave);
    for (const option of clip.options) {
      const choice = button('quiz-answer', option, () => {
        if (answered) return;
        answered = true;
        skip.hidden = true;
        stop();
        const correct = option === clip.ru;
        round.score += Number(correct);
        for (const item of choices.children) {
          item.disabled = true;
          if (item.textContent === clip.ru) item.dataset.result = 'correct';
        }
        if (!correct) choice.dataset.result = 'wrong';
        const reward = onAnswer(clip, correct);
        status.textContent = correct ? 'Верно!' + (reward ? ' +' + reward + ' XP' : '') : 'Фраза добавлена в работу над ошибками.';
        const transcript = elem('div', 'listening-transcript');
        transcript.append(kazakh('p', 'phrase-text', clip.kk), elem('p', '', clip.ru));
        const lesson = elem('a', 'text-button', 'Урок «' + clip.title + '» ↗');
        lesson.href = '?lesson=' + encodeURIComponent(clip.lesson);
        transcript.append(lesson);
        const next = button('button button-primary', round.index + 1 === round.questions.length ? 'Показать результат' : 'Следующая запись →', advance);
        card.append(transcript, next);
        next.focus({ preventScroll: true });
        next.scrollIntoView({ block: 'nearest' });
      });
      choice.disabled = true;
      choices.append(choice);
    }

    player.addEventListener('playing', () => {
      if (media !== player) return;
      if (!heard) {
        heard = true;
        for (const choice of choices.children) choice.disabled = false;
      }
      if (!answered) status.textContent = 'Запись воспроизводится.';
      skip.hidden = true;
      wave.dataset.playing = 'true';
      normal.textContent = 'Прослушать ещё';
    });
    function stopped() {
      wave.dataset.playing = 'false';
    }
    player.addEventListener('pause', () => {
      stopped();
      if (!answered && status.textContent === 'Запись воспроизводится.') {
        status.textContent = 'Выбери перевод или послушай ещё раз.';
      }
    });
    player.addEventListener('ended', () => {
      stopped();
      if (!answered) status.textContent = 'Выбери перевод или послушай ещё раз.';
    });
    player.addEventListener('error', failed);
    card.append(meta, heading, controls, status, choices, skip, player);
    stage.replaceChildren(card);
    normal.focus({ preventScroll: true });
    normal.scrollIntoView({ block: 'nearest' });
  }

  start.addEventListener('click', startRound);
  return {
    stop,
    updateSummary,
    reset() {
      stop();
      media = undefined;
      round = undefined;
      start.textContent = 'Начать аудирование';
      stage.replaceChildren(preview.cloneNode(true));
    }
  };
}
