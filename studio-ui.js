import { TIL_CATEGORIES } from './stories.js';
import { checkStudioAnswer, checkWrittenAnswer, mixStudioWords, pickStudioRound, STUDIO_PROMPTS } from './studio.js';

export function setupStudio({ elem, button, kazakh, audioButton, stopSpeech, shuffle, readSolved, onMiss, onSolve }) {
  const area = document.querySelector('#studio-stage');
  const category = document.querySelector('#studio-category');
  const mode = document.querySelector('#studio-mode');
  const record = document.querySelector('#studio-record');
  const start = document.querySelector('#studio-start');
  const preview = area.firstElementChild.cloneNode(true);
  let round;

  for (const [value, label] of Object.entries(TIL_CATEGORIES)) {
    const option = elem('option', '', label);
    option.value = value;
    category.append(option);
  }

  function updateSummary() {
    record.textContent = 'Без подсказок · Собрано ' + readSolved('tiles').length + '/' + STUDIO_PROMPTS.length
      + ' · Написано ' + readSolved('typing').length + '/' + STUDIO_PROMPTS.length;
  }

  function begin(lesson, selectedMode = mode.value) {
    const queue = pickStudioRound({ lesson, category: category.value, solved: readSolved(selectedMode), shuffle });
    if (!queue.length) return;
    round = { queue, lesson, mode: selectedMode, index: 0, results: [] };
    start.firstElementChild.textContent = 'Новый подход';
    next();
    area.scrollIntoView({ block: 'nearest' });
  }

  function next() {
    stopSpeech();
    const exercise = round.queue[round.index];
    if (!exercise) {
      showSummary();
      return;
    }
    round.attempt = { tiles: mixStudioWords(exercise, shuffle), answer: [], hint: false, missed: false };
    renderExercise(exercise);
  }

  function showSummary() {
    const clean = round.results.filter(({ clean }) => clean).length;
    const built = round.results.filter(({ built }) => built).length;
    const earned = round.results.reduce((total, result) => total + result.reward, 0);
    const panel = elem('div', 'studio-exercise studio-summary');
    const title = elem('h3', '', 'Подход завершён');
    title.tabIndex = -1;
    panel.append(title, elem('p', '', (round.mode === 'typing' ? 'Написано ' : 'Собрано ') + built + ' из ' + round.queue.length + ' · без подсказок ' + clean));
    if (earned) panel.append(elem('p', 'xp-bonus', '+' + earned + ' XP'));
    const actions = elem('div', 'studio-actions');
    actions.append(button('button button-primary', 'Ещё подход ↗', () => begin(round.lesson, round.mode)));
    if (round.results.some(({ missed }) => missed)) {
      const review = elem('a', 'button button-outline', 'К карточкам ↗');
      review.href = '#review';
      actions.append(review);
    }
    panel.append(actions);
    area.replaceChildren(panel);
    title.focus({ preventScroll: true });
  }

  function renderExercise(exercise) {
    const attempt = round.attempt;
    const typing = round.mode === 'typing';
    const panel = elem('div', 'studio-exercise');
    const header = elem('div', 'studio-exercise-head');
    const steps = elem('progress', 'studio-steps');
    steps.max = round.queue.length;
    steps.value = round.index;
    steps.setAttribute('aria-label', 'Выполнено упражнений в подходе');
    header.append(elem('p', '', 'ФРАЗА ' + (round.index + 1) + ' ИЗ ' + round.queue.length), steps);
    const title = elem('h3', '', exercise.ru);
    title.tabIndex = -1;
    const context = elem('p', 'studio-context', 'Из диалога «' + exercise.title + '»');
    const answer = elem('div', 'studio-answer');
    answer.setAttribute('role', 'group');
    answer.setAttribute('aria-label', 'Собранная фраза');
    const bank = elem('div', 'studio-bank');
    bank.setAttribute('role', 'group');
    bank.setAttribute('aria-label', 'Доступные слова');
    const note = elem('p', 'studio-note');
    note.setAttribute('role', 'status');
    const actions = elem('div', 'studio-actions');
    const help = elem('div', 'studio-help');
    const check = button('button button-primary', 'Проверить', checkAnswer);
    const clear = button('button button-outline', 'Очистить', () => {
      if (typing) {
        input.value = '';
        syncInput();
        input.focus();
        return;
      }
      attempt.answer = [];
      renderTiles();
      bank.querySelector('button').focus({ preventScroll: true });
    });
    const hint = button('text-button', 'Подсказать начало', () => {
      attempt.hint = true;
      hint.disabled = true;
      note.dataset.kind = 'hint';
      note.replaceChildren('Первое слово: ', kazakh('strong', '', exercise.solutions[0][0]), '.');
    });
    const reveal = button('text-button', 'Показать ответ', () => {
      markMiss();
      finish(false);
    });
    const input = elem('input', 'studio-input');
    input.type = 'text';
    input.lang = 'kk';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.maxLength = 180;
    input.placeholder = 'Жауабыңды жаз';
    input.setAttribute('aria-label', 'Ответ на казахском');
    input.addEventListener('input', syncInput);
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      if (!check.disabled) checkAnswer();
    });
    actions.append(check, clear);
    help.append(hint, reveal);
    panel.append(header, title, context, answer, bank, note, actions, help);
    area.replaceChildren(panel);
    if (typing) {
      answer.append(input);
      bank.setAttribute('aria-label', 'Казахские буквы');
      for (const letter of 'әғқңөұүһі') {
        const key = button('studio-tile', letter, () => {
          if (input.value.length >= input.maxLength && input.selectionStart === input.selectionEnd) return;
          input.setRangeText(letter, input.selectionStart, input.selectionEnd, 'end');
          syncInput();
          input.focus({ preventScroll: true });
        });
        key.lang = 'kk';
        bank.append(key);
      }
      syncInput();
    } else renderTiles();
    title.focus({ preventScroll: true });

    function syncInput() {
      check.disabled = clear.disabled = !input.value.trim();
    }

    function renderTiles() {
      answer.replaceChildren();
      bank.replaceChildren();
      if (!attempt.answer.length) answer.append(elem('span', 'studio-empty', 'Нажимай на слова, чтобы собрать перевод'));
      for (const id of attempt.answer) {
        const { text } = attempt.tiles.find((tile) => tile.id === id);
        const tile = button('studio-tile studio-picked', text, () => {
          attempt.answer = attempt.answer.filter((selected) => selected !== id);
          renderTiles();
          bank.querySelector('[data-tile="' + id + '"]').focus({ preventScroll: true });
        });
        tile.lang = 'kk';
        tile.setAttribute('aria-label', text + ' · убрать из ответа');
        answer.append(tile);
      }
      for (const { id, text } of attempt.tiles) {
        if (attempt.answer.includes(id)) continue;
        const tile = button('studio-tile', text, () => {
          attempt.answer.push(id);
          renderTiles();
          (bank.querySelector('button') || check).focus({ preventScroll: true });
        });
        tile.lang = 'kk';
        tile.dataset.tile = id;
        bank.append(tile);
      }
      check.disabled = attempt.answer.length !== attempt.tiles.length;
      clear.disabled = attempt.answer.length === 0;
    }

    function markMiss() {
      if (attempt.missed) return;
      attempt.missed = true;
      onMiss(exercise.kk);
    }

    function checkAnswer() {
      if (typing ? checkWrittenAnswer(exercise, input.value) : checkStudioAnswer(exercise, attempt.tiles, attempt.answer)) {
        finish(true);
        return;
      }
      markMiss();
      note.dataset.kind = 'retry';
      note.textContent = typing ? 'Проверь написание и порядок слов. Регистр и знаки препинания не учитываются.'
        : 'Порядок пока отличается от фразы в диалоге. Убери слово из ответа и попробуй переставить его.';
    }

    function finish(built) {
      const clean = built && !attempt.hint && !attempt.missed;
      const reward = built ? onSolve(exercise.id, clean, round.mode) : 0;
      round.results.push({ built, clean, reward, missed: attempt.missed });
      steps.value = round.index + 1;
      answer.replaceChildren(kazakh('strong', 'studio-correct', exercise.kk), audioButton(exercise.kk));
      bank.hidden = true;
      help.hidden = true;
      note.dataset.kind = 'done';
      if (built) panel.dataset.completed = 'true';
      note.textContent = (built ? 'Верно. ' : 'Порядок из диалога. ') + exercise.tip;
      if (reward) note.append(' +' + reward + ' XP.');
      if (attempt.missed) note.append(' Фраза в карточках.');
      const more = button('button button-primary', round.index === round.queue.length - 1 ? 'К результату ↗' : 'Следующая фраза ↗', () => {
        round.index++;
        next();
      });
      actions.replaceChildren(more);
      more.focus({ preventScroll: true });
    }
  }

  start.addEventListener('click', () => begin());
  updateSummary();
  return {
    updateSummary,
    startLesson(lesson) {
      location.hash = '#studio';
      begin(lesson);
    },
    reset() {
      round = undefined;
      area.replaceChildren(preview.cloneNode(true));
      start.firstElementChild.textContent = 'Начать';
      updateSummary();
    }
  };
}
