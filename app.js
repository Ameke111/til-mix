import { TIL_CATEGORIES, TIL_ROUTE, TIL_STORIES } from './stories.js';
import {
  duePhrases, localDay, mergeMistakes, normalizeMistakes, normalizeReview,
  pendingMistakes, quizQuestions, recordMistake, scheduleReview, weekDays
} from './learning.js';
import { setupAccount } from './account.js';
import { countReview, dailyTasks, gameStats, mergeGame, normalizeGame, passDailyQuiz, rankFor, starsFor } from './game.js';
import { masterStudio } from './studio.js';
import { setupStudio } from './studio-ui.js';
import { markPractice } from './activity.js';
import { activityCalendar, renderWeek } from './activity-ui.js';
import { setupCompanion, setupDailyPhrase } from './companion-ui.js';

const $ = (selector) => document.querySelector(selector);
const storyDialog = $('#story-dialog');
const progressDialog = $('#progress-dialog');
const sceneArea = $('#scene');
const storageKey = 'til-mix-progress-v1';
const stories = new Map(TIL_STORIES.map((story) => [story.id, {
  ...story, endingCount: Object.values(story.scenes).filter(({ end }) => end).length
}]));
const phrases = new Map();
const totalEndings = [...stories.values()].reduce((total, story) => total + story.endingCount, 0);
const lessonOrder = TIL_ROUTE.flatMap(({ ids }) => ids);

for (const story of TIL_STORIES) {
  for (const scene of Object.values(story.scenes)) {
    for (const [kk, ru] of [scene.line, ...(scene.choices || []).filter((choice) => choice[2])]) {
      if (!phrases.has(kk)) phrases.set(kk, { kk, ru, categories: [], lessons: new Set() });
      const phrase = phrases.get(kk);
      if (!phrase.categories.includes(story.category)) phrase.categories.push(story.category);
      phrase.lessons.add(story.id);
    }
  }
}

function loadGuest() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || {};
  } catch {
    return {};
  }
}

function readProgress(raw) {
  try {
    const saved = raw || {};
    const sessions = Object.create(null);
    for (const [id, value] of Object.entries(saved.sessions || {})) {
      const story = stories.get(id);
      if (!story || !value || !Object.hasOwn(story.scenes, value.scene)) continue;
      const endings = Array.isArray(value.endings) ? value.endings.filter((key) => Object.hasOwn(story.scenes, key) && story.scenes[key].end) : [];
      const updated = Number.isSafeInteger(value.updated) && value.updated > 0 && value.updated <= Date.now() ? value.updated : 0;
      sessions[id] = { scene: value.scene, endings: [...new Set(endings)], updated };
    }
    return {
      sessions,
      favorites: new Set(Array.isArray(saved.favorites) ? saved.favorites.filter((kk) => phrases.has(kk)) : []),
      bestQuiz: Number.isInteger(saved.bestQuiz) && saved.bestQuiz >= 0 && saved.bestQuiz <= 5 ? saved.bestQuiz : 0,
      translated: saved.translated !== false,
      activeDays: savedDays(saved.activeDays),
      challengeDays: savedDays(saved.challengeDays),
      game: normalizeGame(saved.game, phrases),
      mistakes: normalizeMistakes(saved.mistakes, phrases),
      review: normalizeReview(Object.fromEntries(Object.entries(saved.review || {}).filter(([phrase]) => phrases.has(phrase))))
    };
  } catch {
    return readProgress({});
  }
}

function savedDays(values) {
  return Array.isArray(values) ? [...new Set(values.filter((day) => Number.isInteger(day) && day > 0))] : [];
}

let progress = readProgress(loadGuest());
let storageWarning = false;
let toastTimer;
let currentStory;
let feedback;
let lastStoryButton;
let activeCategory = 'all';
const catalogueBatch = 6;
let visibleStories = catalogueBatch;
let favoritesOnly = false;
let showAllPhrases = false;
let quiz;
let reviewSession;
let activeAudio;
let endingReward = 0;
const quizPlaceholder = $('#quiz').firstElementChild.cloneNode(true);

function challenge(day = localDay()) {
  return TIL_STORIES[day % TIL_STORIES.length];
}

function streak() {
  const days = new Set(progress.activeDays);
  let day = localDay();
  if (!days.has(day)) day--;
  let length = 0;
  while (days.has(day--)) length++;
  return length;
}

function experience() {
  return gameStats(progress, stories).xp;
}

function completeEnding(session, key) {
  const day = localDay();
  const before = experience();
  if (!session.endings.includes(key)) session.endings.push(key);
  recordActivity('story', day);
  if (currentStory.id === challenge(day).id && !progress.challengeDays.includes(day)) {
    progress.challengeDays.push(day);
  }
  endingReward = experience() - before;
  renderRoute();
  reactToPractice();
}

function recordActivity(type, day = localDay()) {
  if (!progress.activeDays.includes(day)) progress.activeDays.push(day);
  markPractice(progress.game.activity, day, type);
}

function renderWeekSummary() {
  const day = localDay();
  const due = duePhrases(progress.review, day).length;
  renderWeek(day, progress.activeDays, account.getGoal(), due);
  renderDailyPhrase(day);
}

function renderGame(stats, day) {
  const rank = rankFor(stats.xp);
  $('#nav-xp').textContent = stats.xp + ' XP';
  $('#game-level').textContent = 'УРОВЕНЬ ' + rank.level;
  $('#game-rank').textContent = rank.name;
  $('#game-xp').value = rank.fraction;
  $('#game-xp-label').textContent = rank.next
    ? stats.xp + ' XP · до следующего уровня ещё ' + (rank.next - stats.xp)
    : stats.xp + ' XP · высший уровень';
  const next = $('#game-next');
  let resume;
  for (const id of lessonOrder) {
    const session = progress.sessions[id];
    if (!isStoryInProgress(stories.get(id), session)) continue;
    if (!resume || session.updated > progress.sessions[resume].updated) resume = id;
  }
  next.dataset.story = resume || lessonOrder.find((id) => !stats.completed.has(id))
    || lessonOrder.find((id) => !stats.mastered.has(id)) || challenge(day).id;
  const nextSession = progress.sessions[next.dataset.story];
  $('#game-next-text').textContent = isStoryInProgress(stories.get(next.dataset.story), nextSession)
    ? 'Продолжить: ' + stories.get(next.dataset.story).title
    : stories.get(next.dataset.story).title;

  const tasks = dailyTasks(progress, day);
  const daily = $('#daily-action');
  const dailyStory = challenge(day);
  daily.dataset.story = dailyStory.id;
  daily.textContent = dailyStory.title + ' ↗';
  const marks = [
    ['#quest-story', tasks.story, '+5 XP'],
    ['#quest-quiz', tasks.quiz, '+5 XP'],
    ['#quest-review', tasks.review === tasks.reviewTarget, tasks.review + '/' + tasks.reviewTarget + ' · +5 XP']
  ];
  for (const [selector, done, label] of marks) {
    const row = $(selector);
    row.dataset.done = String(done);
    row.querySelector('.quest-value').textContent = done ? '✓ Готово' : label;
  }
  const count = marks.filter(([, done]) => done).length;
  $('#quest-status').textContent = count + ' ИЗ 3 ВЫПОЛНЕНО';
  $('#quest-bonus').textContent = count === 3 ? '✓ Бонус получен' : '+15 XP за всё';
  $('#quest-bonus').dataset.earned = String(count === 3);
}

function renderRoute() {
  const stats = gameStats(progress, stories);
  renderMistakes();
  renderGame(stats, localDay());
  studio.updateSummary();
  renderWeekSummary();
  $('#streak-text').textContent = 'Серия: ' + streak() + ' дн.';
  const firstUnfinished = TIL_ROUTE.findIndex(({ ids }) => ids.some((id) => !stats.completed.has(id)));
  $('#path-summary').textContent = 'Пройдено ' + stats.completed.size + ' из ' + TIL_STORIES.length + ' уроков';
  const steps = TIL_ROUTE.map((chapter, index) => {
    const { id, title, level, ids } = chapter;
    const completed = ids.filter((id) => stats.completed.has(id));
    const next = ids.find((id) => !completed.includes(id)) || ids[0];
    const item = elem('li', 'chapter-card');
    const action = elem('button', 'path-step');
    action.type = 'button';
    action.dataset.story = next;
    action.dataset.pathStep = index;
    action.setAttribute('aria-label', title + '. Открыть урок «' + stories.get(next).title + '»');
    if (index === firstUnfinished) action.setAttribute('aria-current', 'step');
    const header = elem('span', 'path-step-head');
    header.append(elem('span', 'path-stage', completed.length === ids.length ? '✓' : String(index + 1)),
      elem('span', 'path-level', level + ' · ' + completed.length + '/' + ids.length));
    const description = completed.length === ids.length ? 'Пройдено · сыграть ещё' : stories.get(next).title + ' ↗';
    const meter = elem('span', 'path-meter');
    meter.setAttribute('aria-hidden', 'true');
    meter.style.setProperty('--fill', completed.length / ids.length * 100 + '%');
    meter.append(elem('i'));
    action.append(header, elem('strong', '', title), elem('span', 'path-next', description), meter);
    const controlBar = elem('div', 'chapter-actions');
    const best = progress.game.chapters[id];
    const stars = starsFor(best);
    const rating = chapterRating(stars);
    const checkpoint = button('text-button', best === undefined ? 'Проверка ↗' : best + '/5 · Повторить ↗', () => startChapterQuiz(chapter));
    checkpoint.setAttribute('aria-label', 'Проверка главы «' + title + '»' + (best === undefined ? '' : '. Лучший результат ' + best + ' из 5'));
    controlBar.append(rating, checkpoint);
    item.append(action, controlBar);
    return item;
  });
  $('#path-steps').replaceChildren(...steps);
}

function chapterRating(count) {
  const stars = elem('span', 'chapter-stars');
  stars.setAttribute('role', 'img');
  stars.setAttribute('aria-label', count + ' из 3 звёзд');
  for (let index = 0; index < 3; index++) {
    const star = elem('span', '', index < count ? '★' : '☆');
    star.dataset.earned = String(index < count);
    star.setAttribute('aria-hidden', 'true');
    stars.append(star);
  }
  return stars;
}

function save() {
  const value = snapshot();
  if (account.store(value)) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    if (!storageWarning) {
      storageWarning = true;
      notify('Браузер не дал сохранить прогресс. Он доступен до закрытия вкладки.');
    }
  }
}

function snapshot() {
  return JSON.parse(JSON.stringify({ ...progress, favorites: [...progress.favorites] }));
}

function swapProgress(raw) {
  if (storyDialog.open) storyDialog.close();
  stopSpeech();
  progress = readProgress(raw);
  quiz = undefined;
  reviewSession = undefined;
  $('#quiz').replaceChildren(quizPlaceholder.cloneNode(true));
  $('#quiz-start').firstChild.textContent = 'Начать тренировку ';
  studio.reset();
  renderStories();
  renderDictionary();
  renderRoute();
  renderReviewSummary();
}

function mergeProgress(raw) {
  const other = readProgress(raw);
  for (const [id, session] of Object.entries(other.sessions)) {
    const current = progress.sessions[id];
    if (current) {
      const latest = session.updated > current.updated ? session : current;
      progress.sessions[id] = { ...latest, endings: [...new Set([...current.endings, ...session.endings])] };
    } else progress.sessions[id] = session;
  }
  for (const phrase of other.favorites) progress.favorites.add(phrase);
  progress.bestQuiz = Math.max(progress.bestQuiz, other.bestQuiz);
  progress.activeDays = [...new Set([...progress.activeDays, ...other.activeDays])];
  progress.challengeDays = [...new Set([...progress.challengeDays, ...other.challengeDays])];
  mergeGame(progress.game, other.game);
  mergeMistakes(progress.mistakes, other.mistakes);
  for (const [phrase, incoming] of Object.entries(other.review)) {
    const current = progress.review[phrase];
    if (!current || incoming.count > current.count || (incoming.count === current.count && incoming.due < current.due)) {
      progress.review[phrase] = incoming;
    }
  }
  renderStories();
  renderDictionary();
  renderRoute();
  renderReviewSummary();
  save();
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

function addToReview(kk, refreshDue = false) {
  const card = progress.review[kk];
  const day = localDay();
  if (!card) progress.review[kk] = { due: day, step: 0, count: 0 };
  else if (refreshDue) progress.review[kk] = { ...card, due: day, step: 0 };
  for (const control of document.querySelectorAll('.review-add')) {
    if (control.dataset.phrase === kk) updateReviewButton(control, kk);
  }
  renderReviewSummary();
  return !card;
}

function stopSpeech() {
  window.speechSynthesis?.cancel();
  if (activeAudio) {
    activeAudio.textContent = activeAudio.dataset.idleText || '◖))';
    activeAudio.setAttribute('aria-pressed', 'false');
    activeAudio = undefined;
  }
}

function audioButton(kk, slow = false) {
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
    utterance.rate = slow ? 0.65 : 0.95;
    activeAudio = el;
    el.textContent = '■';
    el.setAttribute('aria-pressed', 'true');
    const finish = () => {
      if (activeAudio !== el) return;
      el.textContent = el.dataset.idleText || '◖))';
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
  el.setAttribute('aria-label', (slow ? 'Медленная озвучка' : 'Озвучка') + ' фразы «' + kk + '»');
  el.setAttribute('aria-pressed', 'false');
  return el;
}

window.speechSynthesis?.getVoices();

function isStoryInProgress(story, session) {
  return Boolean(session && session.scene !== 'start' && !story.scenes[session.scene].end);
}

function renderStories() {
  const fragment = document.createDocumentFragment();
  const query = $('#story-search').value.trim().toLowerCase();
  const filter = $('#story-progress-filter').value;
  const meetsProgress = (story) => {
    const session = progress.sessions[story.id];
    if (filter === 'started') return isStoryInProgress(story, session);
    if (filter === 'new') return !session?.endings.length && !isStoryInProgress(story, session);
    if (filter === 'done') return Boolean(session?.endings.length);
    if (filter === 'mastered') return session?.endings.length === story.endingCount;
    return true;
  };
  const matches = lessonOrder.map((id) => stories.get(id)).filter((story) =>
    (activeCategory === 'all' || story.category === activeCategory)
    && (story.title + ' ' + story.word + ' ' + story.description).toLowerCase().includes(query)
    && meetsProgress(story)
  );
  const page = matches.slice(0, visibleStories);
  for (const [index, story] of page.entries()) {
    const card = $('#card-template').content.firstElementChild.cloneNode(true);
    const session = progress.sessions[story.id];
    const scene = session && story.scenes[session.scene];
    card.dataset.tone = story.tone;
    card.style.animationDelay = Math.min(index * 35, 150) + 'ms';
    card.querySelector('.card-tag').textContent = TIL_CATEGORIES[story.category];
    card.querySelector('.card-word').textContent = story.word;
    card.querySelector('.card-meta').textContent = story.level + ' · ' + story.minutes + ' мин';
    if (session?.endings.length) {
      const mastered = session.endings.length === story.endingCount;
      card.querySelector('.card-meta').append(elem('span', 'card-score', (mastered ? '✓ ' : '') + session.endings.length + '/' + story.endingCount + ' концовок'));
    }
    card.querySelector('h3').textContent = story.title;
    card.querySelector('p').textContent = story.description;
    const link = card.querySelector('button');
    const action = scene?.end ? 'Сыграть ещё' : scene && session.scene !== 'start' ? 'Продолжить' : 'Начать диалог';
    link.firstElementChild.textContent = action;
    link.dataset.story = story.id;
    link.setAttribute('aria-label', action + '. ' + story.title);
    fragment.append(card);
  }
  $('#story-grid').replaceChildren(fragment);
  $('#story-results').textContent = matches.length ? 'Показано уроков: ' + page.length + ' из ' + matches.length : 'По этому запросу уроков нет.';
  $('#more-stories').hidden = page.length >= matches.length;
}

function sessionFor(story) {
  progress.sessions[story.id] ||= { scene: 'start', endings: [], updated: 0 };
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
  if (fromDemo && session.scene === 'start') {
    session.scene = 'latte';
    session.updated = Date.now();
  }
  save();
  $('#story-title').textContent = currentStory.title;
  $('#story-share-link').hidden = true;
  renderScene();
  if (!storyDialog.open) storyDialog.showModal();
  storyDialog.scrollTop = 0;
  sceneArea.querySelector('[data-initial-focus]').focus({ preventScroll: true });
}

function restartStory() {
  const session = sessionFor(currentStory);
  session.scene = 'start';
  session.updated = Date.now();
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
  const bubbleControls = elem('div', 'phrase-controls');
  const audioSlow = audioButton(data.line[0], true);
  audioSlow.textContent = '½×';
  audioSlow.dataset.idleText = '½×';
  bubbleControls.append(audioButton(data.line[0]), audioSlow);
  bubble.append(bubbleText, bubbleControls);
  panel.append(bubble);

  if (data.end) {
    panel.append(elem('h3', '', data.end));
    if (endingReward) panel.append(elem('p', 'xp-bonus', '+' + endingReward + ' XP'));
    const collection = elem('div', 'ending-collection');
    const done = session.endings.length === currentStory.endingCount;
    collection.append(elem('p', '', done ? '✓ Все концовки. Бонус за урок получен'
      : 'Открыто концовок: ' + session.endings.length + '/' + currentStory.endingCount + ' · +15 XP за все'));
    const list = elem('ul', 'ending-list');
    for (const [key, scene] of Object.entries(currentStory.scenes)) {
      if (!scene.end) continue;
      const earned = session.endings.includes(key);
      const item = elem('li', '', earned ? '✓ ' + scene.end : '○ Закрыта');
      item.dataset.earned = String(earned);
      list.append(item);
    }
    collection.append(list);
    panel.append(collection);
    const actions = elem('div', 'scene-actions');
    const next = lessonOrder.slice(lessonOrder.indexOf(currentStory.id) + 1).find((id) => !progress.sessions[id]?.endings.length)
      || lessonOrder.find((id) => !progress.sessions[id]?.endings.length);
    if (next) actions.append(button('button button-primary', 'Следующий урок ↗', () => openStory(next, lastStoryButton)));
    actions.append(button('button button-outline', 'Фразы из урока ↗', () => {
      const lesson = currentStory.id;
      storyDialog.addEventListener('close', () => studio.startLesson(lesson), { once: true });
      storyDialog.close();
    }));
    actions.append(button('button button-outline', 'Словарь урока ↗', () => {
      const lesson = currentStory.id;
      storyDialog.addEventListener('close', () => openLessonDictionary(lesson), { once: true });
      storyDialog.close();
    }));
    actions.append(button('button ' + (next ? 'button-outline' : 'button-primary'), 'Другая ветка ↺', restartStory));
    panel.append(actions);
  } else {
    panel.append(elem('p', 'scene-context', 'Что ты ответишь?'));
    data.choices.forEach(([kk, ru, next, tip], index) => {
      const choice = button('choice', '', () => {
        stopSpeech();
        feedback = { message: tip, kind: next ? 'success' : 'retry' };
        if (next) {
          addToReview(kk);
          session.scene = next;
          session.updated = Date.now();
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

function openLessonDictionary(lesson) {
  $('#phrase-lesson').value = lesson;
  $('#phrase-search').value = '';
  favoritesOnly = false;
  $('#favorite-filter').setAttribute('aria-pressed', 'false');
  showAllPhrases = false;
  renderDictionary();
  location.hash = '#dictionary';
  $('#phrase-lesson').focus({ preventScroll: true });
}

function renderDictionary() {
  const query = $('#phrase-search').value.trim().toLowerCase();
  const lesson = $('#phrase-lesson').value;
  const entries = [...phrases.values()].filter(({ kk, ru, lessons }) =>
    (!lesson || lessons.has(lesson)) &&
    (!favoritesOnly || progress.favorites.has(kk)) &&
    (!query || kk.toLowerCase().includes(query) || ru.toLowerCase().includes(query))
  );
  const expanded = Boolean(lesson || query || favoritesOnly || showAllPhrases);
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
    const review = button('icon-button review-add', '', () => {
      if (!addToReview(kk)) {
        delete progress.review[kk];
        renderReviewSummary();
      }
      updateReviewButton(review, kk);
      save();
    });
    updateReviewButton(review, kk);
    review.dataset.phrase = kk;
    controls.append(audioButton(kk), favorite, review);
    card.append(text, controls);
    fragment.append(card);
  }
  if (!entries.length) fragment.append(elem('p', 'empty', favoritesOnly && !query && !lesson
    ? 'Сохрани фразу сердечком, и она появится здесь.'
    : 'По этому запросу ничего не нашлось.'));
  $('#phrase-grid').replaceChildren(fragment);
  $('#phrase-count').textContent = 'Фраз найдено: ' + entries.length;
  $('#show-more').hidden = Boolean(lesson || query || favoritesOnly || entries.length <= 6);
  $('#lesson-quiz').hidden = !lesson;
  $('#show-more').textContent = showAllPhrases ? 'Свернуть словарь' : 'Показать все ' + entries.length + ' фраз';
}

function updateFavoriteButton(el, kk) {
  const saved = progress.favorites.has(kk);
  el.textContent = saved ? '♥' : '♡';
  el.setAttribute('aria-label', 'Избранное: ' + kk);
  el.setAttribute('aria-pressed', String(saved));
}

function updateReviewButton(el, kk) {
  const active = Object.hasOwn(progress.review, kk);
  el.textContent = active ? '✓' : '+';
  el.title = active ? 'Убрать из карточек' : 'В карточки';
  el.setAttribute('aria-label', 'Карточки: ' + kk);
  el.setAttribute('aria-pressed', String(active));
}

function renderReviewSummary(message = '') {
  const count = duePhrases(progress.review, localDay()).length;
  renderWeekSummary();
  const start = $('#review-start');
  start.disabled = count === 0 && !reviewSession;
  start.firstChild.textContent = reviewSession ? 'Начать заново ' : 'Начать повторение ';
  if (reviewSession) return;
  const intro = elem('p', 'review-count', count ? 'На сегодня: ' + count : 'Пока всё спокойно');
  const caption = elem('p', '', message || (count
    ? 'За один подход — до восьми карточек.'
    : 'Фразы появятся после диалогов, ошибок в тесте или вручную из словаря.'));
  const dictionaryLink = elem('a', 'text-button review-link', 'Добавить фразы из словаря ↓');
  dictionaryLink.href = '#dictionary';
  $('#review-content').replaceChildren(intro, caption, dictionaryLink);
}

function startReview() {
  const queue = duePhrases(progress.review, localDay()).slice(0, 8);
  if (!queue.length) return;
  reviewSession = { queue, index: 0, revealed: false, graded: 0, earned: 0 };
  renderReviewSummary();
  renderReviewCard();
  $('#review-content').scrollIntoView({ block: 'nearest' });
}

function renderReviewCard() {
  stopSpeech();
  while (reviewSession.index < reviewSession.queue.length && !progress.review[reviewSession.queue[reviewSession.index]]) {
    reviewSession.index++;
  }
  const kk = reviewSession.queue[reviewSession.index];
  const content = $('#review-content');
  if (!kk) {
    const { graded: total, earned } = reviewSession;
    reviewSession = undefined;
    renderRoute();
    save();
    renderReviewSummary(total ? 'Повторено за подход: ' + total + (earned ? ' · +' + earned + ' XP' : '') + '. Расписание обновлено.' : '');
    const first = content.firstElementChild;
    first.tabIndex = -1;
    first.focus({ preventScroll: true });
    return;
  }
  const bar = elem('div', 'review-card-head');
  bar.append(elem('p', 'quiz-step', 'КАРТОЧКА ' + (reviewSession.index + 1) + ' ИЗ ' + reviewSession.queue.length), audioButton(kk));
  const prompt = kazakh('p', 'review-phrase', kk);
  prompt.tabIndex = -1;
  const body = elem('div', 'review-face');
  body.append(bar, prompt);
  if (!reviewSession.revealed) {
    body.append(button('button button-outline', 'Показать перевод', () => {
      reviewSession.revealed = true;
      renderReviewCard();
    }));
  } else {
    const translation = elem('p', 'translation', phrases.get(kk).ru);
    translation.setAttribute('role', 'status');
    body.append(translation);
    const actions = elem('div', 'review-grades');
    for (const [grade, label] of [['again', 'Ещё раз'], ['hard', 'Сложно'], ['known', 'Знаю']]) {
      const gradeButton = button('button button-outline', label, () => {
        const day = localDay();
        const before = experience();
        progress.review[kk] = scheduleReview(progress.review[kk], grade, day);
        countReview(progress.game, day, kk);
        reviewSession.earned += experience() - before;
        reviewSession.index++;
        reviewSession.graded++;
        reviewSession.revealed = false;
        recordActivity('review', day);
        save();
        renderRoute();
        renderReviewCard();
      });
      gradeButton.dataset.grade = grade;
      actions.append(gradeButton);
    }
    body.append(actions);
  }
  content.replaceChildren(body);
  prompt.focus({ preventScroll: true });
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
  const direction = $('#quiz-direction').value;
  const category = $('#quiz-category').value;
  launchQuiz({ direction, category });
}

function renderMistakes() {
  const count = pendingMistakes(progress.mistakes).length;
  $('#mistake-count').textContent = count ? 'Фраз к повторению: ' + count : 'Пока нет ошибок';
  $('#mistake-start').disabled = count === 0;
}

function rememberMiss(phrase) {
  recordMistake(progress.mistakes, phrase, false);
  addToReview(phrase, true);
  renderMistakes();
  save();
}

function startMistakeQuiz() {
  const pending = new Set(pendingMistakes(progress.mistakes));
  if (!pending.size) return;
  launchQuiz({
    direction: 'kk-ru', category: 'all', mistakesOnly: true,
    eligible: ({ kk }) => pending.has(kk)
  });
}

function startChapterQuiz(chapter) {
  location.hash = '#practice';
  launchQuiz({
    direction: 'ru-kk', category: 'all', chapter,
    eligible: (phrase) => chapter.ids.some((id) => phrase.lessons.has(id))
  });
}

function startLessonQuiz(lesson) {
  location.hash = '#practice';
  launchQuiz({
    direction: $('#quiz-direction').value, category: 'all', lesson,
    eligible: (phrase) => phrase.lessons.has(lesson)
  });
}

function launchQuiz({ direction, category, eligible, chapter, lesson, mistakesOnly = false }) {
  stopSpeech();
  const questions = quizQuestions([...phrases.values()], {
    direction, category, eligible, size: 5, allDistractors: mistakesOnly
  }, shuffle);
  quiz = { questions, direction, chapter, lesson, mistakesOnly, index: 0, score: 0, mistakes: 0 };
  $('#quiz-start').firstChild.textContent = chapter || lesson || mistakesOnly ? 'Начать обычный тест ' : 'Начать заново ';
  renderQuiz();
  $('#quiz').scrollIntoView({ block: 'nearest' });
}

function renderQuiz() {
  const card = elem('div', 'quiz-card');
  const step = elem('p', 'quiz-step', quiz.index < quiz.questions.length ? 'ВОПРОС ' + (quiz.index + 1) + ' ИЗ ' + quiz.questions.length : 'ТРЕНИРОВКА ЗАВЕРШЕНА');
  step.tabIndex = -1;
  card.append(step);
  if (quiz.chapter) card.append(elem('p', 'chapter-quiz-name', 'Проверка главы «' + quiz.chapter.title + '»'));
  if (quiz.lesson) card.append(elem('p', 'chapter-quiz-name', 'Тест по уроку «' + stories.get(quiz.lesson).title + '»'));
  if (quiz.mistakesOnly) card.append(elem('p', 'chapter-quiz-name', 'Работа над ошибками'));
  const question = quiz.questions[quiz.index];
  if (!question) {
    const before = experience();
    if (!quiz.mistakesOnly && !quiz.lesson && quiz.questions.length === 5) {
      progress.bestQuiz = Math.max(progress.bestQuiz, quiz.score);
      passDailyQuiz(progress.game, localDay(), quiz.score);
      if (quiz.chapter) {
        const { id } = quiz.chapter;
        progress.game.chapters[id] = Math.max(progress.game.chapters[id] ?? 0, quiz.score);
      }
    }
    if (quiz.questions.length) recordActivity('quiz');
    renderRoute();
    if (quiz.questions.length) reactToPractice(quiz.score / quiz.questions.length >= 0.6 ? 'cheer' : 'think');
    save();
    card.append(elem('p', 'phrase-text', 'Твой результат — ' + quiz.score + ' из ' + quiz.questions.length));
    if (quiz.chapter) {
      const score = progress.game.chapters[quiz.chapter.id] ?? 0;
      const result = elem('p', 'chapter-quiz-result', 'Рекорд главы: ' + score + '/5');
      result.prepend(chapterRating(starsFor(score)));
      card.append(result);
    }
    const earned = experience() - before;
    if (earned) card.append(elem('p', 'xp-bonus', '+' + earned + ' XP'));
    const pending = pendingMistakes(progress.mistakes).length;
    if (pending && (quiz.mistakes || quiz.mistakesOnly)) {
      card.append(button('button button-primary', 'Повторить ошибки · ' + pending, startMistakeQuiz));
    } else if (quiz.mistakesOnly) {
      card.append(elem('p', 'feedback', 'Все ошибки разобраны!'));
    }
    const { chapter, lesson } = quiz;
    card.append(button('button button-outline', chapter ? 'Повторить проверку' : quiz.mistakesOnly ? 'К обычному тесту' : 'Новые вопросы',
      chapter ? () => startChapterQuiz(chapter) : lesson ? () => startLessonQuiz(lesson) : startQuiz));
  } else {
    const prompt = quiz.direction === 'ru-kk' ? elem('p', 'phrase-text', question.prompt) : kazakh('p', 'phrase-text', question.prompt);
    card.append(prompt);
    for (const option of question.options) {
      const answer = button('quiz-answer', option, (event) => {
        const correct = option === question.correct;
        quiz.score += Number(correct);
        for (const choice of card.querySelectorAll('.quiz-answer')) {
          choice.disabled = true;
          if (choice.textContent === question.correct) choice.dataset.result = 'correct';
        }
        if (!correct) {
          event.currentTarget.dataset.result = 'wrong';
          rememberMiss(question.kk);
          quiz.mistakes++;
        } else if (quiz.mistakesOnly) {
          recordMistake(progress.mistakes, question.kk, true);
          renderMistakes();
          save();
        }
        const note = elem('p', 'feedback', correct ? 'Верно!' : 'Верный перевод: «' + question.correct + '»');
        note.setAttribute('role', 'status');
        const next = button('button button-primary', quiz.index === quiz.questions.length - 1 ? 'Показать результат' : 'Следующий вопрос →', () => {
          quiz.index++;
          renderQuiz();
        });
        card.append(note, next);
        next.focus();
      });
      if (quiz.direction === 'ru-kk') answer.lang = 'kk';
      card.append(answer);
    }
  }
  $('#quiz').replaceChildren(card);
  step.focus({ preventScroll: true });
}

function openProgress() {
  renderRoute();
  const content = $('#progress-content');
  const stats = gameStats(progress, stories);
  const reviewedCards = Object.values(progress.review).reduce((total, card) => total + card.count, 0);
  const metrics = elem('div', 'progress-metrics');
  for (const [number, title] of [
    [stats.completed.size + '/' + TIL_STORIES.length, 'Истории'],
    [stats.endings + '/' + totalEndings, 'Концовки'],
    [stats.chapterStars + '/' + (TIL_ROUTE.length * 3), 'Звёзды глав'],
    [stats.xp + ' XP', 'Опыт']
  ]) {
    const metric = elem('div');
    metric.append(elem('b', '', number), elem('span', '', title));
    metrics.append(metric);
  }
  const activity = elem('section', 'activity');
  activity.setAttribute('aria-label', 'Активность за эту неделю');
  const day = localDay();
  const days = weekDays(day);
  const activeCount = days.filter((date) => progress.activeDays.includes(date)).length;
  const weeklyGoal = account.getGoal();
  activity.append(elem('h3', '', (activeCount >= weeklyGoal ? '✓ ' : '') + 'Цель недели · ' + activeCount + ' из ' + weeklyGoal + ' дн.'));
  const calendar = elem('ol', 'activity-days');
  for (const [index, date] of days.entries()) {
    const active = progress.activeDays.includes(date);
    const item = elem('li', '', ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][index]);
    item.dataset.active = String(active);
    item.setAttribute('aria-label', item.textContent + (active ? ': была практика' : ': нет практики'));
    if (date === day) item.setAttribute('aria-current', 'date');
    calendar.append(item);
  }
  activity.append(calendar);
  activity.append(activityCalendar(elem, day, progress.activeDays, progress.game.activity));
  const badgeSection = elem('section', 'badge-section');
  const badges = elem('ul', 'badge-grid');
  const badgeGoals = [
    ['✦', 'Первый разговор', 'Заверши один диалог', stats.completed.size > 0],
    ['◆', 'Коллекционер', 'Открой все концовки любого урока', stats.mastered.size > 0],
    ['↗', 'Искатель', 'Заверши 6 разных уроков', stats.completed.size >= 6],
    ['⧉', 'Память в форме', 'Повтори карточки 20 раз', reviewedCards >= 20],
    ['ϟ', 'Без ошибок', 'Набери 5 из 5 в тесте', progress.bestQuiz === 5],
    ['Ә', 'Слово за словом', 'Собери 12 разных фраз без подсказок', progress.game.studio.length >= 12],
    ['Қ', 'Пишу по-казахски', 'Напечатай 12 фраз без подсказок', progress.game.writing.length >= 12],
    ['★', 'Маршрут на отлично', 'Собери три звезды в каждой главе', stats.chapterStars === TIL_ROUTE.length * 3],
    ['☀', 'Ударный день', 'Выполни все три задания дня', stats.perfectDays > 0],
    ['✳', 'Полный маршрут', 'Заверши все уроки', stats.completed.size === TIL_STORIES.length]
  ];
  badgeSection.append(elem('h3', '', 'Награды · ' + badgeGoals.filter(([, , , earned]) => earned).length + '/' + badgeGoals.length));
  for (const [icon, name, requirement, achieved] of badgeGoals) {
    const badge = elem('li');
    badge.dataset.earned = String(achieved);
    const mark = elem('span', 'badge-mark', achieved ? icon : '○');
    mark.setAttribute('aria-hidden', 'true');
    const label = elem('span');
    label.append(elem('strong', '', name), elem('small', '', achieved ? 'Получено' : requirement));
    badge.append(mark, label);
    badges.append(badge);
  }
  badgeSection.append(badges);
  const list = elem('ul', 'progress-list');
  for (const id of lessonOrder) {
    const story = stories.get(id);
    const row = elem('li');
    const session = progress.sessions[story.id];
    const label = session?.endings.length ? session.endings.length + ' из ' + story.endingCount : 'Начать';
    const play = button('text-button', label + ' ↗', () => {
      progressDialog.close();
      openStory(story.id, $('[data-open-progress]'));
    });
    play.setAttribute('aria-label', story.title + '. ' + label);
    row.append(elem('span', '', story.title), play);
    list.append(row);
  }
  const allLessons = elem('details', 'progress-lessons');
  allLessons.append(elem('summary', '', 'Все уроки и концовки'), list);
  content.replaceChildren(metrics, activity, badgeSection, allLessons, elem('p', 'progress-note', 'Серия: ' + streak() + ' дн. · Лучший тест: ' + progress.bestQuiz + '/5 · В избранном: ' + progress.favorites.size + '.'));
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
    visibleStories = catalogueBatch;
    for (const item of document.querySelectorAll('[data-filter]')) item.setAttribute('aria-pressed', String(item === filter));
    renderStories();
  }
});

storyDialog.addEventListener('close', () => {
  renderRoute();
  stopSpeech();
  $('#story-notice').textContent = '';
  renderStories();
  const pathStep = lastStoryButton?.dataset.pathStep;
  const previous = lastStoryButton?.dataset.story || currentStory.id;
  const selector = pathStep === undefined ? '.card-action[data-story="' + previous + '"]' : '[data-path-step="' + pathStep + '"]';
  const target = lastStoryButton?.isConnected ? lastStoryButton : document.querySelector(selector);
  target?.focus({ preventScroll: true });
});
for (const control of document.querySelectorAll('[data-open-progress]')) control.addEventListener('click', openProgress);
$('#translate-toggle').addEventListener('click', () => {
  progress.translated = !progress.translated;
  updateTranslation();
  save();
});
$('#story-restart').addEventListener('click', restartStory);
$('#story-share').addEventListener('click', async () => {
  const target = new URL(location.href);
  target.searchParams.set('lesson', currentStory.id);
  target.hash = '#stories';
  try {
    await navigator.clipboard.writeText(target.href);
    notify('Ссылка на историю скопирована.');
  } catch {
    const field = $('#story-share-link');
    field.hidden = false;
    field.value = target.href;
    field.select();
  }
});
$('#phrase-search').addEventListener('input', () => {
  stopSpeech();
  renderDictionary();
});
$('#phrase-lesson').addEventListener('change', () => {
  stopSpeech();
  showAllPhrases = false;
  renderDictionary();
});
$('#lesson-quiz').addEventListener('click', () => startLessonQuiz($('#phrase-lesson').value));
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
$('#mistake-start').addEventListener('click', startMistakeQuiz);
$('#review-start').addEventListener('click', startReview);
$('#story-search').addEventListener('input', () => {
  visibleStories = catalogueBatch;
  renderStories();
});
$('#story-progress-filter').addEventListener('change', () => {
  visibleStories = catalogueBatch;
  renderStories();
});
$('#more-stories').addEventListener('click', () => {
  const firstNew = $('#story-grid').childElementCount;
  visibleStories += catalogueBatch;
  renderStories();
  $('#story-grid').children[firstNew]?.querySelector('button').focus();
});

function updateNavigation() {
  const section = location.hash || '#path';
  for (const link of document.querySelectorAll('.nav a')) {
    if (link.hash === section) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}

const reactToPractice = setupCompanion();
const renderDailyPhrase = setupDailyPhrase({
  phrases: [...phrases.values()], audioButton,
  hasCard: (phrase) => Object.hasOwn(progress.review, phrase),
  addCard(phrase) {
    addToReview(phrase);
    save();
  }
});
const studio = setupStudio({
  elem, button, kazakh, audioButton, stopSpeech, shuffle,
  readSolved: (mode) => mode === 'typing' ? progress.game.writing : progress.game.studio,
  onMiss(phrase) {
    rememberMiss(phrase);
    reactToPractice('think');
  },
  onSolve(id, clean, mode) {
    const solved = mode === 'typing' ? progress.game.writing : progress.game.studio;
    const reward = masterStudio(solved, id, clean, mode);
    recordActivity('studio');
    renderRoute();
    reactToPractice();
    save();
    return reward;
  }
});
const account = setupAccount({ snapshot, loadGuest, swapProgress, mergeProgress, notify, onGoalChange: renderWeekSummary });
for (const [id, label] of [['all', 'Все'], ...Object.entries(TIL_CATEGORIES)]) {
  const filter = elem('button', '', label);
  filter.type = 'button';
  filter.dataset.filter = id;
  filter.setAttribute('aria-pressed', String(id === activeCategory));
  $('#story-filters').append(filter);
  if (id === 'all') continue;
  const option = elem('option', '', label);
  option.value = id;
  $('#quiz-category').append(option);
}
$('#story-total').textContent = TIL_STORIES.length + ' уроков A1–A2';
$('#ending-total').textContent = totalEndings + ' концовки';
for (const id of lessonOrder) {
  const option = elem('option', '', stories.get(id).title);
  option.value = id;
  $('#phrase-lesson').append(option);
}
window.addEventListener('hashchange', updateNavigation);
updateNavigation();
renderStories();
renderDictionary();
renderRoute();
renderReviewSummary();
const sharedLesson = new URL(location.href).searchParams.get('lesson');
if (stories.has(sharedLesson)) {
  void account.ready.then(() => {
    if (!document.querySelector('dialog[open]')) {
      openStory(sharedLesson, $('#story-grid').querySelector('[data-story="' + sharedLesson + '"]'));
    }
  });
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !storyDialog.open) {
    renderRoute();
    renderReviewSummary();
  }
});
