import { starterQuestions } from './assistant-data.js';
import { checkPractice, createAssistant, questionLimit } from './assistant.js';
import { LANGUAGES, storyLanguage } from './languages.js';

export function setupAssistant({ stories, elem, button, kazakh, audioButton, stopSpeech, openLesson, savePhrase, getLanguage = () => 'kk' }) {
  const titles = new Map(stories.map(({ id, title }) => [id, title]));
  const dialog = document.querySelector('#assistant-dialog');
  const title = document.querySelector('#assistant-title');
  const log = document.querySelector('#assistant-log');
  const form = document.querySelector('#assistant-form');
  const input = document.querySelector('#assistant-input');
  const clear = document.querySelector('#assistant-clear');
  const notice = document.querySelector('#assistant-notice');
  const mode = document.querySelector('#assistant-mode');
  const connection = document.querySelector('#assistant-connection');
  const privacy = document.querySelector('#assistant-privacy');
  const stop = document.querySelector('#assistant-stop');
  let history = [];
  let pending;
  let helper;
  let context = {};
  let more;
  let moreButton;
  let conversation = {};
  let practice;
  input.maxLength = questionLimit;

  function lessonButton(id, text) {
    return button('assistant-source', text, () => {
      dialog.close();
      openLesson(id);
    });
  }

  function renderWelcome() {
    helper = createAssistant(stories.filter((story) => storyLanguage(story) === getLanguage()));
    cancelModel();
    history = [];
    conversation = { ...context };
    practice = undefined;
    more = undefined;
    moreButton = undefined;
    input.value = '';
    notice.textContent = '';
    const intro = elem('div', 'assistant-reply');
    intro.append(elem('p', '', context.lesson
      ? `Ты в уроке «${titles.get(context.lesson)}». Разберём реплику?`
      : mode.value === 'model'
        ? 'Давай поговорим. Твой курс — ' + LANGUAGES[getLanguage()].name.toLowerCase() + '. Можешь прислать фразу для разбора или задать вопрос о языке.'
        : 'Подберу примеры из курса «' + LANGUAGES[getLanguage()].name + '». Напиши фразу или назови ситуацию.'));
    const choices = elem('div', 'assistant-prompts');
    if (context.phrase) choices.append(button('assistant-chip', 'Переведи реплику', () => ask('Переведи реплику')));
    const questions = getLanguage() === 'kk' ? starterQuestions : ['Как сказать «Где станция?»', 'Переведи «Мне нужны яблоки»', 'Посоветуй урок про учёбу'];
    for (const question of questions) choices.append(button('assistant-chip', question, () => ask(question)));
    intro.append(choices);
    log.replaceChildren(intro);
    log.scrollTop = 0;
    clear.disabled = true;
    showPracticeControls();
  }

  function renderAnswer(result) {
    const reply = elem('div', 'assistant-reply');
    reply.append(elem('p', '', result.text));
    for (const example of result.examples) {
      const card = elem('div', 'assistant-example');
      const header = elem('div', 'assistant-example-head');
      header.append(kazakh('strong', '', example.kk), audioButton(example.kk));
      card.append(header, elem('p', '', example.ru));
      const actions = elem('div', 'assistant-example-actions');
      actions.append(button('assistant-chip', 'Разобрать', () => {
        conversation = { lesson: example.lesson, phrase: example.kk };
        ask('Разбери фразу');
      }), button('assistant-chip', 'Практика', () => startPractice(example)));
      const save = button('assistant-chip', 'В карточки', () => {
        savePhrase(example.kk);
        save.textContent = '✓ В карточках';
        save.disabled = true;
        notice.textContent = 'Фраза добавлена в повторение.';
      });
      actions.append(save);
      card.append(actions);
      if (result.lesson !== example.lesson) card.append(lessonButton(example.lesson, 'Урок «' + titles.get(example.lesson) + '» ↗'));
      reply.append(card);
    }
    if (result.lesson) reply.append(lessonButton(result.lesson, 'Открыть урок ↗'));
    if (result.more) {
      moreButton = button('assistant-chip', 'Ещё примеры', () => ask('Ещё примеры'));
      reply.append(moreButton);
    }
    return reply;
  }

  function appendTurn(question, reply) {
    const turn = elem('div', 'assistant-turn');
    turn.append(elem('p', 'assistant-question', question), reply);
    log.append(turn);
    if (log.childElementCount > 9) log.firstElementChild.remove();
    clear.disabled = false;
    log.scrollTop = Math.max(0, turn.offsetTop - 10);
  }

  function startPractice(example) {
    if (pending) return;
    stopSpeech();
    practice = example;
    conversation = { lesson: example.lesson, phrase: example.kk };
    more = undefined;
    moreButton?.remove();
    const reply = elem('div', 'assistant-reply');
    reply.append(elem('p', '', 'Напиши реплику на изучаемом языке'), elem('strong', '', example.ru));
    appendTurn('Хочу потренироваться', reply);
    showPracticeControls();
    input.focus({ preventScroll: true });
  }

  function showPracticeControls() {
    document.querySelector('#assistant-practice-tools')?.remove();
    input.placeholder = practice ? 'Твой перевод…' : 'Напиши вопрос…';
    form.querySelector('[type="submit"]').textContent = practice ? 'Проверить' : 'Спросить';
    input.setAttribute('aria-label', practice ? 'Ответ на изучаемом языке' : 'Вопрос о языке');
    if (!practice) return;
    const tools = elem('div', 'assistant-practice-tools');
    tools.id = 'assistant-practice-tools';
    tools.append(button('assistant-chip', 'Подсказка', () => {
      notice.textContent = 'Начни с «' + practice.kk.split(/\s/)[0] + '». ' + (practice.note ?? 'Сверься с репликой выше.');
    }), button('assistant-chip', 'Показать ответ', () => {
      const example = practice;
      practice = undefined;
      showPracticeControls();
      appendTurn('Покажи ответ', renderAnswer({ text: 'Повтори фразу, затем попробуй ещё раз.', examples: [example] }));
    }), button('assistant-chip', 'Завершить практику', () => {
      practice = undefined;
      notice.textContent = 'Можно задать новый вопрос.';
      showPracticeControls();
    }));
    const letters = elem('div', 'assistant-letters');
    letters.setAttribute('role', 'group');
    letters.setAttribute('aria-label', 'Буквы изучаемого языка');
    for (const letter of LANGUAGES[getLanguage()].letters) letters.append(button('assistant-chip', letter, () => {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      if (input.value.length - (end - start) >= input.maxLength) return;
      input.setRangeText(letter, start, end, 'end');
      input.focus({ preventScroll: true });
    }));
    tools.append(letters);
    form.before(tools);
  }

  function submitPractice(question) {
    const result = checkPractice(question, practice.kk, getLanguage());
    const reply = elem('div', 'assistant-reply');
    if (result.correct) {
      reply.append(elem('p', '', 'Верно! Ты вспомнил реплику.'), audioButton(practice.kk));
      practice = undefined;
      showPracticeControls();
    } else {
      reply.append(elem('p', '', 'Сравни порядок слов и написание. Попробуй ещё раз или открой подсказку.'));
      const marks = elem('p', 'assistant-word-marks');
      for (const [index, word] of result.words.entries()) {
        const mark = elem('span', '', word.correct ? word.word + ' ✓' : 'Слово ' + (index + 1) + ' ·');
        mark.dataset.correct = String(word.correct);
        marks.append(mark);
      }
      reply.append(marks);
      if (result.extra) reply.append(elem('p', '', 'Лишних слов — ' + result.extra + '.'));
    }
    appendTurn(question, reply);
  }

  function ask(raw) {
    if (pending) return;
    const question = raw.trim();
    if (!question) return;
    input.value = '';
    notice.textContent = '';
    if (practice) {
      submitPractice(question);
      return;
    }
    if (mode.value === 'model') {
      void askModel(question);
      return;
    }
    moreButton?.remove();
    moreButton = undefined;
    const continuation = /^ещ[её] примеры[.!?]*$/i.test(question);
    const result = continuation && more
      ? helper.more(more)
      : helper.answer(question, conversation);
    const reply = renderAnswer(result);
    if (result.examples.length) {
      conversation = { lesson: result.examples[0].lesson, phrase: result.examples[0].kk };
    }
    appendTurn(question, reply);
    more = result.more;
    if (document.activeElement !== input && !dialog.contains(document.activeElement)) log.focus({ preventScroll: true });
  }

  function cancelModel() {
    pending?.abort();
    pending = undefined;
    stop.hidden = true;
    form.querySelector('[type="submit"]').disabled = false;
    log.removeAttribute('aria-busy');
  }

  function displayModelText(element, content) {
    const parts = content.split(/\*\*([^*]+)\*\*/g);
    element.replaceChildren(...parts.map((part, index) => elem(index % 2 ? 'strong' : 'span', '', part)));
  }

  async function askModel(question) {
    const controller = new AbortController();
    pending = controller;
    const reply = elem('div', 'assistant-reply assistant-generated');
    const text = elem('p', 'assistant-thinking', 'Обдумываю вопрос…');
    reply.append(text);
    appendTurn(question, reply);
    stop.hidden = false;
    form.querySelector('[type="submit"]').disabled = true;
    log.setAttribute('aria-busy', 'true');
    const messages = [...history, { role: 'user', content: question }];
    const timer = setTimeout(() => controller.abort(), 125000);
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ messages, language: getLanguage(), lesson: conversation.lesson, phrase: conversation.phrase })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Нейросеть сейчас недоступна.');
      if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('Получен пустой ответ.');
      if (pending !== controller) return;
      displayModelText(text, data.text);
      history = [...messages, { role: 'assistant', content: data.text }];
      while (history.length > 8 || history.reduce((sum, entry) => sum + entry.content.length, 0) > 7000) history.splice(0, 2);
      if (data.truncated) reply.append(elem('p', 'assistant-connection', 'Ответ достиг ограничения длины. Попроси продолжить.'));
    } catch (error) {
      text.textContent = controller.signal.aborted ? 'Ответ остановлен.' : error.message;
      reply.append(button('assistant-chip', 'Повторить вопрос', () => ask(question)));
    } finally {
      text.classList.remove('assistant-thinking');
      clearTimeout(timer);
      if (pending === controller) cancelModel();
    }
  }

  function updateMode() {
    input.maxLength = mode.value === 'model' ? 2000 : questionLimit;
    privacy.textContent = mode.value === 'model'
      ? 'Переписка отправляется серверу модели. Нейросеть может ошибаться.'
      : 'Ответы из уроков Тіл Mix. Вопросы остаются в браузере.';
    renderWelcome();
  }

  mode.addEventListener('change', updateMode);
  stop.addEventListener('click', cancelModel);
  if (document.querySelector('meta[name="til-server"]')) {
    connection.textContent = 'Проверяю подключение нейросети…';
    fetch('/api/assistant').then((response) => {
      if (!response.ok) throw new Error();
      return response.json();
    }).then((settings) => {
      mode.querySelector('[value="model"]').disabled = !settings.available;
      connection.textContent = settings.available
        ? 'Нейросеть подключена.' + (settings.loginRequired ? ' Для разговора войди в профиль.' : '')
        : 'Для нейросети нужно настроить подключение на сервере.';
      if (settings.available && !log.childElementCount) {
        mode.value = 'model';
        updateMode();
      }
    }).catch(() => { connection.textContent = 'Подключение нейросети сейчас недоступно.'; });
  }

  function open(next = {}) {
    stopSpeech();
    helper ??= createAssistant(stories);
    if (context.lesson !== next.lesson || context.phrase !== next.phrase || !log.childElementCount) {
      context = next;
      renderWelcome();
    }
    dialog.showModal();
    title.focus({ preventScroll: true });
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    ask(input.value);
  });
  clear.addEventListener('click', () => {
    stopSpeech();
    renderWelcome();
    title.focus({ preventScroll: true });
  });
  dialog.addEventListener('close', () => {
    cancelModel();
    notice.textContent = '';
    stopSpeech();
  });
  document.querySelector('#open-assistant').addEventListener('click', () => open());
  return {
    open,
    reset() {
      if (dialog.open) dialog.close();
      context = {};
      renderWelcome();
    }
  };
}
