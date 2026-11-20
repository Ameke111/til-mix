import assert from 'node:assert/strict';
import test from 'node:test';
import { selectLessons } from './catalogue.js';
import { TIL_STORIES } from './stories.js';

test('catalogue combines course, level and topic and finds words inside dialogues', () => {
  const find = (options) => selectLessons(TIL_STORIES, {}, { language: 'en', ...options }).map(({ id }) => id);
  assert.deepEqual(find({ query: 'breakfast' }), ['en-hotel']);
  assert.deepEqual(find({ query: 'пароль' }), ['en-hotel']);
  assert.deepEqual(find({ query: 'breakfast', level: 'A1' }), []);
  assert.deepEqual(find({ query: 'breakfast', category: 'campus' }), []);
  assert.deepEqual(find({ query: 'İSTASYON', language: 'tr' }), ['tr-directions']);
  assert.ok(find({ level: 'A2', category: 'travel' }).every((id) => ['en-hotel', 'en-train'].includes(id)));
  assert.equal(find({ language: 'kk', level: 'A1' }).includes('bike-rental'), true);
});

test('progress filters and sorting preserve the route and distinguish unfinished branches', () => {
  const sessions = {
    'en-cafe': { scene: 'branch0-end0', endings: ['branch0-end0'], updated: 10 },
    'en-hotel': { scene: 'branch0', endings: [], updated: 30 },
    'en-train': { scene: 'start', endings: ['branch0-end0', 'branch0-end1', 'branch1-end0', 'branch1-end1'], updated: 20 }
  };
  const original = TIL_STORIES.map(({ id }) => id);
  const find = (options) => selectLessons(TIL_STORIES, sessions, { language: 'en', ...options }).map(({ id }) => id);
  assert.deepEqual(find({ progress: 'started' }), ['en-hotel']);
  assert.deepEqual(find({ progress: 'done' }), ['en-cafe', 'en-train']);
  assert.deepEqual(find({ progress: 'mastered' }), ['en-train']);
  assert.equal(find({ progress: 'new' }).length, 9);
  assert.deepEqual(find({ sort: 'recent' }).slice(0, 3), ['en-hotel', 'en-train', 'en-cafe']);
  assert.deepEqual(find({ sort: 'new' }).slice(-3), ['en-cafe', 'en-hotel', 'en-train']);
  assert.deepEqual(TIL_STORIES.map(({ id }) => id), original);
});
