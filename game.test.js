import assert from 'node:assert/strict';
import test from 'node:test';
import { countReview, dailyTasks, gameStats, mergeGame, normalizeGame, passDailyQuiz, rankFor, starsFor } from './game.js';
import { markPractice, recentPractice } from './activity.js';

const day = 20773;
const phrases = new Set(['Сәлем!', 'Рақмет!', 'Кездескенше!', 'Сау бол!']);
const stories = new Map([['coffee', { endingCount: 4 }]]);

function legacyState(raw) {
  return {
    sessions: { coffee: { endings: ['table'] } },
    bestQuiz: 0,
    challengeDays: [day],
    game: normalizeGame(raw, phrases)
  };
}

test('legacy progress retains XP and the daily story without retroactively awarding quiz or card quests', () => {
  const progress = legacyState();
  assert.equal(gameStats(progress, stories).xp, 15);
  assert.deepEqual(dailyTasks(progress, day), { story: true, quiz: false, review: 0, reviewTarget: 3 });
  assert.equal(dailyTasks(progress, day + 1).story, false);
});

test('daily XP is awarded once, only after a pass and reviews of three distinct phrases', () => {
  const progress = legacyState();
  passDailyQuiz(progress.game, day, 2);
  assert.equal(dailyTasks(progress, day).quiz, false);
  passDailyQuiz(progress.game, day, 3);
  passDailyQuiz(progress.game, day, 5);
  for (const phrase of ['Сәлем!', 'Сәлем!', 'Рақмет!']) countReview(progress.game, day, phrase);
  assert.equal(dailyTasks(progress, day).review, 2);
  assert.equal(gameStats(progress, stories).xp, 20);
  countReview(progress.game, day, 'Кездескенше!');
  countReview(progress.game, day, 'Сау бол!');
  assert.deepEqual(dailyTasks(progress, day), { story: true, quiz: true, review: 3, reviewTarget: 3 });
  assert.equal(gameStats(progress, stories).xp, 40);
  assert.equal(gameStats(progress, stories).perfectDays, 1);
  countReview(progress.game, day + 1, 'Сәлем!');
  assert.deepEqual(dailyTasks(progress, day + 1), { story: false, quiz: false, review: 1, reviewTarget: 3 });
  assert.equal(gameStats(progress, stories).xp, 40);
});

test('merging backups joins independent tasks and distinct reviews without duplicating rewards', () => {
  const progress = legacyState();
  passDailyQuiz(progress.game, day, 5);
  countReview(progress.game, day, 'Сәлем!');
  const incoming = normalizeGame({ days: { [day - 1]: 1 }, review: { day, reviewed: ['not a phrase', 'Сәлем!', 'Рақмет!', 'Кездескенше!'] } }, phrases);
  mergeGame(progress.game, incoming);
  mergeGame(progress.game, incoming);
  assert.deepEqual(dailyTasks(progress, day), { story: true, quiz: true, review: 3, reviewTarget: 3 });
  const restored = normalizeGame(JSON.parse(JSON.stringify(progress.game)), phrases);
  assert.equal(gameStats({ ...progress, game: restored }, stories).xp, 45);
  assert.equal(gameStats(progress, stories).perfectDays, 1);

  const otherDevice = normalizeGame({ review: { day: day + 1, reviewed: ['Сәлем!', 'Рақмет!'] } }, phrases);
  countReview(restored, day + 1, 'Кездескенше!');
  mergeGame(restored, otherDevice);
  assert.equal(dailyTasks({ ...progress, game: restored }, day + 1).review, 3);
});

test('opening all endings grants a single mastery bonus and advances the rank at its threshold', () => {
  const progress = legacyState();
  progress.sessions.coffee.endings = ['table', 'takeaway', 'black', 'green'];
  const stats = gameStats(progress, stories);
  assert.deepEqual([...stats.mastered], ['coffee']);
  assert.equal(stats.xp, 60);
  assert.equal(rankFor(49).level, 1);
  assert.equal(rankFor(50).level, 2);
  assert.equal(rankFor(50).fraction, 0);
  assert.deepEqual(rankFor(1200), { level: 7, name: 'Тіл шебері', next: undefined, fraction: 1 });
});

test('chapter stars follow the published thresholds and backup merges retain only better scores', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(starsFor), [0, 0, 1, 1, 2, 3]);
  const progress = legacyState({ chapters: { basics: 4, city: 2, career: 0, travel: 7, bogus: 5 } });
  const incoming = normalizeGame({ chapters: { basics: 2, city: 5, friends: 1 } }, phrases);
  mergeGame(progress.game, incoming);
  mergeGame(progress.game, incoming);
  assert.deepEqual({ ...progress.game.chapters }, { basics: 4, city: 5, career: 0, friends: 1 });
  const stats = gameStats(progress, stories);
  assert.equal(stats.chapterStars, 5);
  assert.equal(stats.xp, 40);
});

test('the practice calendar preserves legacy days and merges modes from the same day', () => {
  const current = normalizeGame({}, phrases);
  const incoming = normalizeGame({ activity: { [day]: 10, [day - 1]: 21, invalid: 3 } }, phrases);
  markPractice(current.activity, day, 'story');
  markPractice(current.activity, day, 'story');
  mergeGame(current, incoming);
  mergeGame(current, incoming);
  const calendar = recentPractice(day, [day - 2], current.activity);
  assert.equal(calendar.length, 28);
  assert.deepEqual(calendar.slice(-3), [
    { date: day - 2, types: [], active: true },
    { date: day - 1, types: [], active: false },
    { date: day, types: ['story', 'quiz', 'studio'], active: true }
  ]);
});
