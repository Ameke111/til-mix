import { starterQuestions } from './assistant-data.js';
import { createAssistant, questionLimit } from './assistant.js';

export function setupAssistant({ stories, elem, button, kazakh, audioButton, stopSpeech, openLesson }) {
  const titles = new Map(stories.map(({ id, title }) => [id, title]));
  const dialog = document.querySelector('#assistant-dialog');
  const title = document.querySelector('#assistant-title');
  const log = document.querySelector('#assistant-log');
  const form = document.querySelector('#assistant-form');
  const input = document.querySelector('#assistant-input');
  const clear = document.querySelector('#assistant-clear');
  const notice = document.querySelector('#assistant-notice');
  let helper;
  let context = {};
  let more;
  let moreButton;
  input.maxLength = questionLimit;

  function lessonButton(id, text) {
    return button('assistant-source', text, () => {
      dialog.close();
      openLesson(id);
    });
  }

  function renderWelcome() {
    more = undefined;
    moreButton = undefined;
    input.value = '';
    notice.textContent = '';
    const intro = elem('div', 'assistant-reply');
    intro.append(elem('p', '', context.lesson
      ? `Ты в уроке «${titles.get(context.lesson)}». Разберём реплику?`
      : 'Сәлем! Спроси по-русски или по-казахски. Подберу примеры из наших диалогов.'));
    const choices = elem('div', 'assistant-prompts');
    if (context.phrase) choices.append(button('assistant-chip', 'Переведи реплику', () => ask('Переведи реплику')));
    for (const question of starterQuestions) choices.append(button('assistant-chip', question, () => ask(question)));
    intro.append(choices);
    log.replaceChildren(intro);
    log.scrollTop = 0;
    clear.disabled = true;
  }

  function renderAnswer(result) {
    const reply = elem('div', 'assistant-reply');
    reply.append(elem('p', '', result.text));
    for (const example of result.examples) {
      const card = elem('div', 'assistant-example');
      const header = elem('div', 'assistant-example-head');
      header.append(kazakh('strong', '', example.kk), audioButton(example.kk));
      card.append(header, elem('p', '', example.ru));
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

  function ask(raw) {
    const question = raw.trim();
    if (!question) return;
    input.value = '';
    moreButton?.remove();
    moreButton = undefined;
    const continuation = /^ещ[её] примеры[.!?]*$/i.test(question);
    const result = continuation && more
      ? helper.more(more)
      : helper.answer(question, context);
    const turn = elem('div', 'assistant-turn');
    const reply = renderAnswer(result);
    turn.append(elem('p', 'assistant-question', question), reply);
    log.append(turn);
    if (log.childElementCount > 9) log.firstElementChild.remove();
    more = result.more;
    clear.disabled = false;
    log.scrollTop = Math.max(0, turn.offsetTop - 10);
    if (document.activeElement !== input && !dialog.contains(document.activeElement)) log.focus({ preventScroll: true });
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
