import assert from 'node:assert/strict';
import test from 'node:test';
import { TIL_CATEGORIES, TIL_ROUTE, TIL_STORIES } from './stories.js';

test('stories have unique IDs, valid categories and exactly one chapter each', () => {
  assert.equal(TIL_STORIES.length, 24);
  assert.equal(TIL_ROUTE.length, 8);
  assert.equal(new Set(TIL_STORIES.map(({ id }) => id)).size, TIL_STORIES.length);
  assert.deepEqual(TIL_ROUTE.flatMap(({ ids }) => ids).sort(), TIL_STORIES.map(({ id }) => id).sort());
  for (const story of TIL_STORIES) {
    assert.ok(Object.hasOwn(TIL_CATEGORIES, story.category), story.id);
  }
});

for (const { id, scenes } of TIL_STORIES) {
  test(id + ' has four reachable endings and no broken dialogue links', () => {
    const found = new Set();
    const endings = new Set();
    function walk(key, depth, path) {
      assert.ok(Object.hasOwn(scenes, key), 'Missing scene: ' + key);
      assert.ok(!path.has(key), 'Unexpected choice cycle: ' + key);
      const { line, context, end, choices } = scenes[key];
      assert.ok(line.every((text) => typeof text === 'string' && text.trim().length > 0));
      assert.equal(line.length, 2);
      found.add(key);
      if (end) {
        assert.equal(depth, 3);
        assert.equal(choices, undefined);
        endings.add(key);
        return;
      }
      assert.ok(context && choices.length >= 2);
      const routes = choices.filter((choice) => choice[2]);
      assert.equal(routes.length, 2);
      assert.ok(choices.every(([kk, ru, , tip]) => kk && ru && tip));
      for (const [, , next] of routes) walk(next, depth + 1, new Set([...path, key]));
    }
    walk('start', 1, new Set());
    assert.equal(found.size, Object.keys(scenes).length);
    assert.equal(endings.size, 4);
  });
}
