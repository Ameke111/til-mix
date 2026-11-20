import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewSelection } from './review-selection.js';

const entries = [
  { kk: 'one', categories: ['daily'], lessons: new Set(['cafe']) },
  { kk: 'two', categories: ['daily', 'travel'], lessons: new Set(['cafe', 'hotel']) },
  { kk: 'three', categories: ['travel'], lessons: new Set(['hotel']) },
  { kk: 'unsaved', categories: ['daily'], lessons: new Set(['cafe']) }
];
const cards = { one: { due: 10, count: 1 }, two: { due: 9, count: 0 }, three: { due: 15, count: 3 }, foreign: { due: 1, count: 0 } };

test('review selection intersects topic and lesson, keeps overdue order and excludes other courses and unsaved phrases', () => {
  assert.deepEqual(reviewSelection(entries, cards, { day: 10, category: 'daily', lesson: 'cafe' }),
    { due: ['two', 'one'], all: ['two', 'one'], nextDue: null });
  assert.deepEqual(reviewSelection(entries, cards, { day: 10, category: 'travel', lesson: 'cafe' }).due, ['two']);
  assert.deepEqual(reviewSelection(entries, cards, { day: 10, lesson: 'missing' }), { due: [], all: [], nextDue: null });
});

test('free practice includes future cards while the scheduled queue and saved progress remain unchanged', () => {
  const before = JSON.stringify(cards);
  const selection = reviewSelection(entries, cards, { day: 10, lesson: 'hotel' });
  assert.deepEqual(selection, { due: ['two'], all: ['two', 'three'], nextDue: 15 });
  assert.equal(JSON.stringify(cards), before);
  assert.deepEqual(reviewSelection(entries, cards, { day: 16, lesson: 'hotel' }).due, ['two', 'three']);
});
