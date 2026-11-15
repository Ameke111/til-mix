import { TIL_CATEGORIES, TIL_STORIES } from './stories.js';

const $ = (selector) => document.querySelector(selector);
const storyDialog = $('#story-dialog');
const progressDialog = $('#progress-dialog');
const sceneArea = $('#scene');
const storageKey = 'til-mix-progress-v1';
const stories = new Map(TIL_STORIES.map((story) => [story.id, story]));
const phrases = new Map();
const route = [
  { title: 'Первые фразы', ids: ['coffee', 'campus'] },
  { title: 'В городе', ids: ['way', 'market'] },
  { title: 'Договоримся', ids: ['meeting', 'club'] }
];

for (const story of TIL_STORIES) {
  for (const scene of Object.values(story.scenes)) {
    for (const [kk, ru] of [scene.line, ...(scene.choices || []).filter((choice) => choice[2])]) {
      if (!phrases.has(kk)) phrases.set(kk, { kk, ru });
    }
  }
}

function storedProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey)) || {};
    const sessions = {};
    for (const [id, value] of Object.entries(saved.sessions || {})) {
      const story = stories.get(id);
      if (!story || !value || !Object.hasOwn(story.scenes, value.scene)) continue;
      const endings = Array.isArray(value.endings) ? value.endings.filter((key) => story.scenes[key]?.end) : [];
      sessions[id] = { scene: value.scene, endings: [...new Set(endings)] };
    }
    return {
      sessions,
      favorites: new Set(Array.isArray(saved.favorites) ? saved.favorites.filter((kk) => phrases.has(kk)) : []),
      bestQuiz: Number.isInteger(saved.bestQuiz) && saved.bestQuiz >= 0 && saved.bestQuiz <= 5 ? saved.bestQuiz : 0,
      translated: saved.translated !== false,
      activeDays: savedDays(saved.activeDays),
      challengeDays: savedDays(saved.challengeDays)
    };
  } catch {
    return { sessions: {}, favorites: new Set(), bestQuiz: 0, translated: true, activeDays: [], challengeDays: [] };
  }
}

function savedDays(values) {
  return Array.isArray(values) ? [...new Set(values.filter((day) => Number.isInteger(day) && day > 0))] : [];
}

const progress = storedProgress();
let storageWarning = false;
let toastTimer;
let currentStory;
let feedback;
let lastStoryButton;
let activeCategory = 'all';
let favoritesOnly = false;
let showAllPhrases = false;
let quiz;
let activeAudio;
let endingReward = 0;

function today() {
  const date = new Date();
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}

function challenge(day = today()) {
  return TIL_STORIES[day % TIL_STORIES.length];
}

function streak() {
  const days = new Set(progress.activeDays);
  let day = today();
  if (!days.has(day)) day--;
  let length = 0;
  while (days.has(day--)) length++;
  return length;
}

function experience() {
  const ends = Object.values(progress.sessions).reduce((sum, item) => sum + item.endings.length, 0);
  return ends * 10 + progress.challengeDays.length * 5 + progress.bestQuiz * 2;
}

function completeEnding(session, key) {
  const day = today();
  endingReward = 0;
  if (!session.endings.includes(key)) {
    session.endings.push(key);
    endingReward += 10;
  }
  if (!progress.activeDays.includes(day)) progress.activeDays.push(day);
  if (currentStory.id === challenge(day).id && !progress.challengeDays.includes(day)) {
    progress.challengeDays.push(day);
    endingReward += 5;
  }
  renderRoute();
}

function renderRoute() {
  $('#nav-xp').textContent = experience() + ' XP';
  $('#streak-text').textContent = 'Серия: ' + streak() + ' дн.';
  const daily = $('#daily-action');
  const dailyStory = challenge();
  const dailyDone = progress.challengeDays.includes(today());
  $('#daily-status').textContent = dailyDone ? 'Вызов дня пройден' : 'Вызов дня · +5 XP';
  daily.dataset.story = dailyStory.id;
  daily.textContent = dailyStory.title + ' ↗';
  const steps = route.map(({ title, ids }) => {
    const completed = ids.filter((id) => progress.sessions[id]?.endings.length);
    const next = ids.find((id) => !completed.includes(id)) || ids[0];
    const item = elem('li');
    const action = elem('button', 'path-step', title + ' · ' + completed.length + '/' + ids.length);
    action.type = 'button';
    action.dataset.story = next;
    action.setAttribute('aria-label', title + '. Открыть урок «' + stories.get(next).title + '»');
    const meter = elem('span', 'path-meter');
    meter.setAttribute('aria-hidden', 'true');
    meter.style.setProperty('--fill', completed.length / ids.length * 100 + '%');
    meter.append(elem('i'));
    action.append(meter);
    item.append(action);
    return item;
  });
  $('#path-steps').replaceChildren(...steps);
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ ...progress, favorites: [...progress.favorites] }));
  } catch {
    if (!storageWarning) {
      storageWarning = true;
      notify('Браузер не дал сохранить прогресс. Он доступен до закрытия вкладки.');
    }
  }
}

function elem(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function button(className, text, action) {
  const el = elem('button', className, text);
  el.type = 'button';
  el.addEventListener('click', action);
  return el;
}

function kazakh(tag, className, text) {
  const el = elem(tag, className, text);
  el.lang = 'kk';
  return el;
}

function notify(message) {
  const toast = storyDialog.open ? $('#story-notice') : $('#toast');
  clearTimeout(toastTimer);
  $('#toast').textContent = '';
  $('#story-notice').textContent = '';
  toast.textContent = message;
  toastTimer = setTimeout(() => { toast.textContent = ''; }, 4600);
}

function stopSpeech() {
  window.speechSynthesis?.cancel();
  if (activeAudio) {
    activeAudio.textContent = '◖))';
    activeAudio.setAttribute('aria-pressed', 'false');
    activeAudio = undefined;
  }
}

function audioButton(kk) {
  const el = button('icon-button audio-button', '◖))', () => {
    if (activeAudio === el) {
      stopSpeech();
      return;
    }
    const synthesis = window.speechSynthesis;
    const voice = synthesis?.getVoices().find(({ lang }) => /^kk(?:[-_]|$)/i.test(lang));
    if (!voice) {
      notify('Казахский голос недоступен в этом браузере. Установи голос kk-KZ в настройках устройства.');
      return;
    }
    stopSpeech();
    const utterance = new SpeechSynthesisUtterance(kk);
    utterance.lang = 'kk-KZ';
    utterance.voice = voice;
    utterance.rate = 0.85;
    activeAudio = el;
    el.textContent = '■';
    el.setAttribute('aria-pressed', 'true');
    const finish = () => {
      if (activeAudio !== el) return;
      el.textContent = '◖))';
      el.setAttribute('aria-pressed', 'false');
      activeAudio = undefined;
    };
    utterance.onend = finish;
    utterance.onerror = ({ error }) => {
      finish();
      if (error !== 'canceled' && error !== 'interrupted') notify('Озвучка сейчас недоступна.');
    };
    synthesis.speak(utterance);
  });
  el.setAttribute('aria-label', 'Озвучка фразы «' + kk + '»');
  el.setAttribute('aria-pressed', 'false');
  return el;
}

window.speechSynthesis?.getVoices();

function renderStories() {
  const fragment = document.createDocumentFragment();
  for (const [index, story] of TIL_STORIES.entries()) {
    if (activeCategory !== 'all' && story.category !== activeCategory) continue;
    const card = $('#card-template').content.firstElementChild.cloneNode(true);
    const session = progress.sessions[story.id];
    const scene = session && story.scenes[session.scene];
    card.dataset.tone = story.tone;
    card.style.animationDelay = Math.min(index * 35, 150) + 'ms';
    card.querySelector('.card-index').textContent = String(index + 1).padStart(2, '0');
    card.querySelector('.card-tag').textContent = TIL_CATEGORIES[story.category];
    card.querySelector('.card-word').textContent = story.word;
    card.querySelector('.card-meta').textContent = story.level + ' · ' + story.minutes + ' мин' + (session?.endings.length ? ' · ' + session.endings.length + '/4 концовок' : '');
    card.querySelector('h3').textContent = story.title;
    card.querySelector('p').textContent = story.description;
    const link = card.querySelector('button');
    const action = scene?.end ? 'Сыграть ещё' : scene ? 'Продолжить' : 'Начать диалог';
    link.firstElementChild.textContent = action;
    link.dataset.story = story.id;
    link.setAttribute('aria-label', action + '. ' + story.title);
    fragment.append(card);
  }
  $('#story-grid').replaceChildren(fragment);
}

function sessionFor(story) {
  progress.sessions[story.id] ||= { scene: 'start', endings: [] };
  return progress.sessions[story.id];
}

function openStory(id, trigger, fromDemo = false) {
  stopSpeech();
  currentStory = stories.get(id);
  lastStoryButton = trigger;
  feedback = undefined;
  endingReward = 0;
  const session = sessionFor(currentStory);
  if (currentStory.scenes[session.scene].end) session.scene = 'start';
  if (fromDemo && session.scene === 'start') session.scene = 'latte';
  save();
  $('#story-title').textContent = currentStory.title;
  renderScene();
  storyDialog.showModal();
  sceneArea.querySelector('[data-initial-focus]').focus({ preventScroll: true });
}

function restartStory() {
  sessionFor(currentStory).scene = 'start';
  feedback = undefined;
  endingReward = 0;
  stopSpeech();
  save();
  renderScene(true);
}

function renderScene(focus = false, focusIndex) {
  const session = sessionFor(currentStory);
  const data = currentStory.scenes[session.scene];
  const step = data.end ? 3 : session.scene === 'start' ? 1 : 2;
  const panel = elem('div', 'scene-body');
  const context = elem('p', 'scene-context', data.context || 'Ты дошёл до конца этой ветки.');
  context.dataset.initialFocus = '';
  context.tabIndex = -1;
  panel.append(context);
  if (feedback) {
    const note = elem('p', 'feedback', feedback.message);
    note.dataset.kind = feedback.kind;
    note.setAttribute('role', 'status');
    panel.append(note);
  }

  const bubble = elem('div', 'bubble');
  const bubbleText = elem('div');
  bubbleText.append(
    elem('p', 'bubble-speaker', currentStory.speaker),
    kazakh('p', 'phrase-text', data.line[0]),
    elem('p', 'translation', data.line[1])
  );
  bubble.append(bubbleText, audioButton(data.line[0]));
  panel.append(bubble);

  if (data.end) {
    panel.append(elem('h3', '', data.end));
    if (endingReward) panel.append(elem('p', 'xp-bonus', '+' + endingReward + ' XP'));
    const actions = elem('div', 'scene-actions');
    actions.append(button('button button-primary', 'Попробовать другую ветку', restartStory));
    actions.append(button('button button-outline', 'К историям', () => storyDialog.close()));
    panel.append(actions);
  } else {
    panel.append(elem('p', 'scene-context', 'Что ты ответишь?'));
    data.choices.forEach(([kk, ru, next, tip], index) => {
      const choice = button('choice', '', () => {
        stopSpeech();
        feedback = { message: tip, kind: next ? 'success' : 'retry' };
        if (next) {
          session.scene = next;
          if (currentStory.scenes[next].end) completeEnding(session, next);
          save();
        }
        renderScene(true, next ? undefined : index);
      });
      choice.append(kazakh('span', '', kk), elem('small', 'translation', ru));
      panel.append(choice);
    });
  }

  $('#story-stage').textContent = 'ШАГ ' + step + ' ИЗ 3';
  $('#story-line-fill').style.width = step / 3 * 100 + '%';
  sceneArea.replaceChildren(panel);
  updateTranslation();
  if (focus) {
    const target = focusIndex === undefined ? context : panel.querySelectorAll('.choice')[focusIndex];
    target.focus({ preventScroll: true });
    storyDialog.scrollTop = 0;
  }
}

function updateTranslation() {
  sceneArea.dataset.translated = String(progress.translated);
  const toggle = $('#translate-toggle');
  toggle.setAttribute('aria-pressed', String(progress.translated));
  toggle.textContent = progress.translated ? 'Скрыть перевод' : 'Показать перевод';
}

function renderDictionary() {
  const query = $('#phrase-search').value.trim().toLowerCase();
  const entries = [...phrases.values()].filter(({ kk, ru }) =>
    (!favoritesOnly || progress.favorites.has(kk)) &&
    (!query || kk.toLowerCase().includes(query) || ru.toLowerCase().includes(query))
  );
  const expanded = Boolean(query || favoritesOnly || showAllPhrases);
  const visible = expanded ? entries : entries.slice(0, 6);
  const fragment = document.createDocumentFragment();
  for (const { kk, ru } of visible) {
    const card = elem('article', 'phrase-card');
    const text = elem('div');
    text.append(kazakh('p', 'phrase-text', kk), elem('p', 'translation', ru));
    const controls = elem('div', 'phrase-controls');
    const favorite = button('icon-button', '', () => {
      if (progress.favorites.has(kk)) progress.favorites.delete(kk);
      else progress.favorites.add(kk);
      save();
      if (favoritesOnly) {
        renderDictionary();
        $('#favorite-filter').focus({ preventScroll: true });
      } else {
        updateFavoriteButton(favorite, kk);
      }
    });
    updateFavoriteButton(favorite, kk);
    controls.append(audioButton(kk), favorite);
    card.append(text, controls);
    fragment.append(card);
  }
  if (!entries.length) fragment.append(elem('p', 'empty', query ? 'По этому запросу ничего не нашлось.' : 'Сохрани фразу сердечком, и она появится здесь.'));
  $('#phrase-grid').replaceChildren(fragment);
  $('#phrase-count').textContent = 'Фраз найдено: ' + entries.length;
  $('#show-more').hidden = Boolean(query || favoritesOnly || entries.length <= 6);
  $('#show-more').textContent = showAllPhrases ? 'Свернуть словарь' : 'Показать все ' + entries.length + ' фраз';
}

function updateFavoriteButton(el, kk) {
  const saved = progress.favorites.has(kk);
  el.textContent = saved ? '♥' : '♡';
  el.setAttribute('aria-label', 'Избранное: ' + kk);
  el.setAttribute('aria-pressed', String(saved));
}

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}

function startQuiz() {
  const pool = [...phrases.values()];
  const questions = shuffle(pool).slice(0, 5).map((phrase) => {
    const other = [...new Set(pool.map(({ ru }) => ru))].filter((ru) => ru !== phrase.ru);
    return { ...phrase, options: shuffle([phrase.ru, ...shuffle(other).slice(0, 2)]) };
  });
  quiz = { questions, index: 0, score: 0 };
  $('#quiz-start').firstChild.textContent = 'Начать заново ';
  renderQuiz();
}

function renderQuiz() {
  const card = elem('div', 'quiz-card');
  const step = elem('p', 'quiz-step', quiz.index < quiz.questions.length ? 'ВОПРОС ' + (quiz.index + 1) + ' ИЗ ' + quiz.questions.length : 'ТРЕНИРОВКА ЗАВЕРШЕНА');
  step.tabIndex = -1;
  card.append(step);
  const question = quiz.questions[quiz.index];
  if (!question) {
    progress.bestQuiz = Math.max(progress.bestQuiz, quiz.score);
    renderRoute();
    save();
    card.append(elem('p', 'phrase-text', 'Твой результат — ' + quiz.score + ' из ' + quiz.questions.length));
    card.append(button('button button-outline', 'Новые вопросы', startQuiz));
  } else {
    card.append(kazakh('p', 'phrase-text', question.kk));
    for (const option of question.options) {
      card.append(button('quiz-answer', option, (event) => {
        const correct = option === question.ru;
        quiz.score += Number(correct);
        for (const choice of card.querySelectorAll('.quiz-answer')) {
          choice.disabled = true;
          if (choice.textContent === question.ru) choice.dataset.result = 'correct';
        }
        if (!correct) event.currentTarget.dataset.result = 'wrong';
        const note = elem('p', 'feedback', correct ? 'Верно!' : 'Верный перевод: «' + question.ru + '»');
        note.setAttribute('role', 'status');
        const next = button('button button-primary', quiz.index === quiz.questions.length - 1 ? 'Показать результат' : 'Следующий вопрос →', () => {
          quiz.index++;
          renderQuiz();
        });
        card.append(note, next);
        next.focus();
      }));
    }
  }
  $('#quiz').replaceChildren(card);
  step.focus({ preventScroll: true });
}

function openProgress() {
  renderRoute();
  const content = $('#progress-content');
  const values = Object.values(progress.sessions);
  const totalEndings = TIL_STORIES.reduce((total, story) => total + Object.values(story.scenes).filter(({ end }) => end).length, 0);
  const metrics = elem('div', 'progress-metrics');
  for (const [number, title] of [
    [values.filter(({ endings }) => endings.length > 0).length + '/' + TIL_STORIES.length, 'Истории'],
    [values.reduce((sum, { endings }) => sum + endings.length, 0) + '/' + totalEndings, 'Концовки'],
    [experience() + ' XP', 'Опыт']
  ]) {
    const metric = elem('div');
    metric.append(elem('b', '', number), elem('span', '', title));
    metrics.append(metric);
  }
  const list = elem('ul', 'progress-list');
  for (const story of TIL_STORIES) {
    const row = elem('li');
    const session = progress.sessions[story.id];
    const label = session ? session.endings.length + ' из 4' : 'Начать';
    const play = button('text-button', label + ' ↗', () => {
      progressDialog.close();
      openStory(story.id, $('[data-open-progress]'));
    });
    play.setAttribute('aria-label', story.title + '. ' + label);
    row.append(elem('span', '', story.title), play);
    list.append(row);
  }
  content.replaceChildren(metrics, list, elem('p', 'progress-note', 'Серия: ' + streak() + ' дн. · Лучший тест: ' + progress.bestQuiz + '/5 · В избранном: ' + progress.favorites.size + '.'));
  progressDialog.showModal();
}

document.addEventListener('click', (event) => {
  const play = event.target.closest('button[data-story]');
  const filter = event.target.closest('button[data-filter]');
  const close = event.target.closest('button[data-close]');
  if (play) openStory(play.dataset.story, play, play.classList.contains('demo-action'));
  if (close) close.closest('dialog').close();
  if (filter) {
    activeCategory = filter.dataset.filter;
    for (const item of document.querySelectorAll('[data-filter]')) item.setAttribute('aria-pressed', String(item === filter));
    renderStories();
  }
});

storyDialog.addEventListener('close', () => {
  stopSpeech();
  $('#story-notice').textContent = '';
  renderStories();
  const target = lastStoryButton?.isConnected ? lastStoryButton : document.querySelector('.card-action[data-story="' + currentStory.id + '"]');
  target?.focus({ preventScroll: true });
});
$('[data-open-progress]').addEventListener('click', openProgress);
$('#translate-toggle').addEventListener('click', () => {
  progress.translated = !progress.translated;
  updateTranslation();
  save();
});
$('#story-restart').addEventListener('click', restartStory);
$('#phrase-search').addEventListener('input', () => {
  stopSpeech();
  renderDictionary();
});
$('#favorite-filter').addEventListener('click', (event) => {
  stopSpeech();
  favoritesOnly = !favoritesOnly;
  event.currentTarget.setAttribute('aria-pressed', String(favoritesOnly));
  renderDictionary();
});
$('#show-more').addEventListener('click', () => {
  stopSpeech();
  showAllPhrases = !showAllPhrases;
  renderDictionary();
  if (!showAllPhrases) $('#phrase-search').focus({ preventScroll: false });
});
$('#quiz-start').addEventListener('click', startQuiz);

function updateNavigation() {
  const section = location.hash || '#stories';
  for (const link of document.querySelectorAll('.nav a')) {
    if (link.hash === section) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}

window.addEventListener('hashchange', updateNavigation);
updateNavigation();
renderStories();
renderDictionary();
renderRoute();
document.addEventListener('visibilitychange', () => { if (!document.hidden && !storyDialog.open) renderRoute(); });
