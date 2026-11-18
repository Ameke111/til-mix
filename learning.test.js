import assert from 'node:assert/strict';
import test from 'node:test';
import { duePhrases, localDay, normalizeReview, quizQuestions, scheduleReview, weekDays } from './learning.js';

test('local-day calendar starts on Monday across a month boundary', () => {
  const sunday = localDay(new Date(2026, 10, 1, 22));
  assert.deepEqual(weekDays(sunday), [-6, -5, -4, -3, -2, -1, 0].map((offset) => sunday + offset));
  assert.equal(weekDays(sunday + 1)[0], sunday + 1);
});

test('review keeps older learners’ progress and discards corrupt card records', () => {
  const card = { due: 200, step: 1, count: 2 };
  const restored = normalizeReview({ valid: card, malformed: { due: '1' }, tooFar: { ...card, step: 6 } });
  assert.deepEqual(Object.keys(normalizeReview()), []);
  assert.deepEqual(Object.keys(restored), ['valid']);
  assert.deepEqual(restored.valid, card);
});

test('a successful review schedules increasing gaps and caps the final interval', () => {
  let card = { due: 200, step: 0, count: 0 };
  for (const gap of [1, 3, 7, 14, 30, 30]) {
    const day = card.due;
    card = scheduleReview(card, 'known', day);
    assert.equal(card.due - day, gap);
  }
  assert.equal(card.count, 6);
  assert.equal(card.step, 5);
});

test('a difficult or missed card comes back earlier', () => {
  const card = { due: 200, step: 4, count: 10 };
  const hard = scheduleReview(card, 'hard', 200);
  const missed = scheduleReview(card, 'again', 200);
  assert.deepEqual(hard, { due: 201, step: 3, count: 11 });
  assert.deepEqual(missed, { due: 200, step: 0, count: 11 });
  assert.deepEqual(duePhrases({ hard, missed }, 200), ['missed']);
});

test('reverse quizzes filter by theme and never use another valid translation as a distractor', () => {
  const entries = [
    { kk: 'Сәлем!', ru: 'Привет!', categories: ['campus'] },
    { kk: 'Сәлеметсің бе!', ru: 'Привет!', categories: ['daily', 'campus'] },
    { kk: 'Рақмет!', ru: 'Спасибо!', categories: ['campus'] },
    { kk: 'Кездескенше!', ru: 'До встречи!', categories: ['campus'] },
    { kk: 'Аялдама қайда?', ru: 'Где остановка?', categories: ['city'] }
  ];
  const result = quizQuestions(entries, { direction: 'ru-kk', category: 'campus', size: 5 }, (items) => items);
  assert.deepEqual(result.map(({ prompt }) => prompt), ['Привет!', 'Спасибо!', 'До встречи!']);
  assert.deepEqual(result[0].options, ['Сәлем!', 'Рақмет!', 'Кездескенше!']);
  for (const question of result) assert.ok(question.options.includes(question.correct));
});

test('chapter quizzes use only eligible lesson phrases for questions and answer options', () => {
  const entries = [
    { kk: 'Сәлем!', ru: 'Привет!', inChapter: true },
    { kk: 'Сау бол!', ru: 'Пока!', inChapter: true },
    { kk: 'Рақмет!', ru: 'Спасибо!', inChapter: true },
    { kk: 'Аялдама қайда?', ru: 'Где остановка?', inChapter: false }
  ];
  const result = quizQuestions(entries, {
    direction: 'ru-kk', category: 'all', size: 5, eligible: (entry) => entry.inChapter
  }, (items) => items);
  assert.deepEqual(result.map(({ prompt }) => prompt), ['Привет!', 'Пока!', 'Спасибо!']);
  assert.ok(result.every(({ options }) => options.length === 3 && !options.includes('Аялдама қайда?')));
});
