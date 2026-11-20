import assert from 'node:assert/strict';
import test from 'node:test';
import { readBookmarks, mergeBookmarks, setBookmark, resumableLessons } from './lesson-library.js';
import { TIL_STORIES } from './stories.js';

const known = new Set(TIL_STORIES.map(({ id }) => id));
const now = 1_000_000;

test('old profiles start without bookmarks and malformed records are discarded independently', () => {
  assert.deepEqual(Object.keys(readBookmarks(undefined, known)), []);
  const restored = readBookmarks({
    coffee: { saved: true, updated: now }, 'en-hotel': { saved: false, updated: now - 10 },
    nope: { saved: true, updated: now }, 'tr-cafe': null, 'en-cafe': { saved: 'yes', updated: now },
    bus: { saved: true, updated: now + 120_000 }
  }, known, now);
  assert.deepEqual(Object.keys(restored).sort(), ['coffee', 'en-hotel']);
  assert.equal(restored['en-hotel'].saved, false);
});

test('bookmarks and removals survive a JSON backup and stale merges without restoring old selections', () => {
  const current = readBookmarks({}, known, now);
  setBookmark(current, 'coffee', true, now);
  const old = JSON.parse(JSON.stringify(current));
  setBookmark(current, 'coffee', false, now);
  assert.ok(current.coffee.updated > old.coffee.updated);
  mergeBookmarks(current, old);
  assert.equal(current.coffee.saved, false);
  const restored = readBookmarks(JSON.parse(JSON.stringify(current)), known, now);
  mergeBookmarks(restored, { 'en-hotel': { saved: true, updated: now } });
  mergeBookmarks(restored, { coffee: { saved: true, updated: restored.coffee.updated } });
  assert.equal(restored.coffee.saved, false);
  assert.equal(restored['en-hotel'].saved, true);
  setBookmark(old, 'coffee', true, now + 10);
  mergeBookmarks(restored, old);
  assert.equal(restored.coffee.saved, true);
});

test('resume list uses current course, excludes endings and starts, and prioritizes recent unfinished branches', () => {
  const sessions = {
    'en-cafe': { scene: 'branch0', endings: [], updated: 10 },
    'en-hotel': { scene: 'branch1', endings: ['branch0-end0'], updated: 30 },
    'en-train': { scene: 'branch0-end0', endings: ['branch0-end0'], updated: 40 },
    'en-work': { scene: 'start', endings: [], updated: 50 },
    'en-shop': { scene: 'missing', endings: [], updated: 60 },
    'tr-cafe': { scene: 'branch0', endings: [], updated: 70 }
  };
  assert.deepEqual(resumableLessons(TIL_STORIES, sessions, 'en').map(({ id }) => id), ['en-hotel', 'en-cafe']);
  assert.deepEqual(resumableLessons(TIL_STORIES, sessions, 'tr').map(({ id }) => id), ['tr-cafe']);
  assert.deepEqual(resumableLessons(TIL_STORIES, sessions, 'kk'), []);
});
