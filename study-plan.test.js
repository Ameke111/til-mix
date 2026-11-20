import assert from 'node:assert/strict';
import test from 'node:test';
import { studyPlan } from './study-plan.js';
import { TIL_STORIES, TIL_ROUTE } from './stories.js';

const lesson = (id, language = 'kk') => ({ id, language, scenes: { start: {}, middle: {}, end: { end: true }, other: { end: true } } });
const stories = [lesson('a'), lesson('b'), lesson('c'), lesson('en', 'en')];
const chapters = [{ id: 'one', ids: ['a', 'b'] }, { id: 'two', ids: ['c'] }, { id: 'english', language: 'en', ids: ['en'] }];
const phrases = ['a', 'b', 'c', 'en'].map((id) => ({ kk: id, ru: 'translation', lessons: new Set([id]) }));
const progress = () => ({ sessions: {}, game: { chapters: {} }, review: {} });
const plan = (p, language = 'kk') => studyPlan({ stories, chapters, phrases, progress: p, language, day: 100 });

test('a new learner gets the first course lesson, empty calendar and no premature checkpoint', () => {
  const result = plan(progress());
  assert.equal(result.next.id, 'a');
  assert.equal(result.resume, false);
  assert.equal(result.total, 3);
  assert.equal(result.checkpoint, undefined);
  assert.deepEqual(result.forecast.map(({ cards }) => cards.length), [0, 0, 0, 0, 0, 0, 0]);
});

test('resume uses the most recent unfinished scene in the selected language, even after an earlier ending', () => {
  const p = progress();
  p.sessions = { a: { scene: 'middle', endings: [], updated: 20 }, b: { scene: 'middle', endings: ['end'], updated: 30 }, en: { scene: 'middle', endings: [], updated: 90 } };
  assert.equal(plan(p).next.id, 'b');
  assert.equal(plan(p).resume, true);
  p.sessions.b.scene = 'end';
  assert.equal(plan(p).next.id, 'a');
  assert.equal(plan(p, 'en').next.id, 'en');
});

test('calendar counts overdue once, separates dates at week boundary and excludes foreign or removed cards', () => {
  const p = progress();
  p.review = { a: { due: 98, count: 3 }, b: { due: 106, count: 1 }, c: { due: 107, count: 0 }, en: { due: 100, count: 0 }, missing: { due: 100, count: 0 } };
  const before = JSON.stringify(p);
  const result = plan(p);
  assert.equal(result.saved, 3);
  assert.equal(result.overdue, 1);
  assert.equal(result.later, 1);
  assert.deepEqual(result.forecast.map(({ cards }) => cards.map(({ kk }) => kk)), [['a'], [], [], [], [], [], ['b']]);
  assert.equal(plan(p, 'en').forecast[0].cards[0].kk, 'en');
  assert.equal(JSON.stringify(p), before);
  delete p.review.a;
  assert.equal(plan(p).forecast[0].cards.length, 0);
});

test('a completed chapter unlocks a checkpoint, prioritizing untested then lowest score', () => {
  const p = progress();
  for (const id of ['a', 'b', 'c']) p.sessions[id] = { scene: 'end', endings: ['end'] };
  p.game.chapters.one = 4;
  let result = plan(p);
  assert.equal(result.checkpoint.id, 'two');
  assert.equal(result.completed, 3);
  assert.equal(result.checkpoints, 1);
  p.game.chapters.two = 5;
  assert.equal(plan(p).checkpoint.id, 'one');
  p.game.chapters.one = 5;
  assert.equal(plan(p).checkpoint, undefined);
  assert.equal(plan(p).next.id, 'a');
});

test('a scheduled answer moves a card into tomorrow without mutating its saved record', () => {
  const p = progress();
  p.review.a = { due: 100, count: 0, step: 0 };
  assert.equal(plan(p).forecast[0].cards.length, 1);
  p.review.a = { due: 101, count: 1, step: 1 };
  const result = plan(p);
  assert.equal(result.forecast[0].cards.length, 0);
  assert.equal(result.forecast[1].cards[0].kk, 'a');
});

test('real curriculum yields the full 27/12/12 course routes', () => {
  for (const [language, total] of [['kk', 27], ['en', 12], ['tr', 12]]) {
    const result = studyPlan({ stories: TIL_STORIES, chapters: TIL_ROUTE, phrases: [], progress: progress(), language, day: 100 });
    assert.equal(result.total, total);
    assert.equal(result.completed, 0);
    assert.equal(result.next.language || 'kk', language);
  }
});
