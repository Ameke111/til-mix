import assert from 'node:assert/strict';
import test from 'node:test';
import { TIL_CATEGORIES, TIL_STORIES } from './stories.js';
import { checkStudioAnswer, checkWrittenAnswer, masterStudio, mixStudioWords, phraseWords, pickStudioRound, readStudio, STUDIO_PROMPTS } from './studio.js';
import { gameStats, mergeGame, normalizeGame } from './game.js';

const unchanged = (values) => values.slice();

test('the studio has exercises for each lesson and four per topic', () => {
  assert.equal(STUDIO_PROMPTS.length, 24);
  assert.equal(new Set(STUDIO_PROMPTS.map(({ id }) => id)).size, 24);
  assert.deepEqual([...new Set(STUDIO_PROMPTS.map(({ lesson }) => lesson))].sort(), TIL_STORIES.map(({ id }) => id).sort());
  for (const category of Object.keys(TIL_CATEGORIES)) {
    const exercises = pickStudioRound({ category, solved: [], shuffle: unchanged });
    assert.equal(exercises.length, 4);
    assert.ok(exercises.every((exercise) => exercise.category === category && exercise.ru && exercise.tip));
  }
});

test('the studio accepts valid variants and never reuses a chip or starts in the right order', () => {
  assert.deepEqual(phraseWords('Сәлем! Көк шай, өтінемін.'), ['сәлем', 'көк', 'шай', 'өтінемін']);
  for (const exercise of STUDIO_PROMPTS) {
    const tiles = mixStudioWords(exercise, unchanged);
    assert.equal(checkStudioAnswer(exercise, tiles, tiles.map(({ id }) => id)), false);
    for (const solution of exercise.solutions) {
      const unused = [...tiles];
      const answer = solution.map((word) => {
        const index = unused.findIndex(({ text }) => text === word);
        assert.notEqual(index, -1, exercise.id + ': ' + word);
        return unused.splice(index, 1)[0].id;
      });
      assert.equal(checkStudioAnswer(exercise, tiles, answer), true);
      assert.equal(checkStudioAnswer(exercise, tiles, answer.slice(1)), false);
      const repeat = [answer[1], ...answer.slice(1)];
      assert.equal(checkStudioAnswer(exercise, tiles, repeat), false);
    }
  }
});

test('new phrases come before mastered phrases and a lesson round stays in that lesson', () => {
  const solved = STUDIO_PROMPTS.filter(({ category }) => category === 'travel').slice(0, 2).map(({ id }) => id);
  const round = pickStudioRound({ category: 'travel', solved, shuffle: unchanged, size: 2 });
  assert.equal(round.length, 2);
  assert.ok(round.every(({ id }) => !solved.includes(id)));
  const hotel = pickStudioRound({ lesson: 'hotel', category: 'city', solved, shuffle: unchanged });
  assert.deepEqual(hotel.map(({ id }) => id), ['hotel-breakfast']);
});

test('studio XP survives loading and merging without credit for assisted or duplicate answers', () => {
  const first = normalizeGame({}, new Set());
  const second = normalizeGame({ studio: ['coffee-order', 'made-up', 'coffee-order', 'hotel-breakfast'] }, new Set());
  assert.deepEqual(first.studio, []);
  assert.equal(masterStudio(first.studio, 'coffee-order', false), 0);
  assert.equal(masterStudio(first.studio, 'coffee-order', true), 3);
  assert.equal(masterStudio(first.studio, 'coffee-order', true), 0);
  mergeGame(first, second);
  mergeGame(first, second);
  assert.deepEqual(readStudio(JSON.parse(JSON.stringify(first.studio))), ['coffee-order', 'hotel-breakfast']);
  const progress = { sessions: {}, challengeDays: [], bestQuiz: 0, game: first };
  assert.equal(gameStats(progress, new Map()).xp, 6);
});

test('writing accepts case and punctuation and keeps bonus progress separate from tiles', () => {
  const coffee = STUDIO_PROMPTS.find(({ id }) => id === 'coffee-order');
  assert.equal(checkWrittenAnswer(coffee, 'ӨТІНЕМІН,   маған бір латте!'), true);
  assert.equal(checkWrittenAnswer(coffee, 'Маган бір латте өтінемін'), false);
  assert.equal(checkWrittenAnswer(coffee, 'Маған бір латте'), false);
  const game = normalizeGame({ studio: [coffee.id] }, new Set());
  assert.equal(masterStudio(game.writing, coffee.id, false, 'typing'), 0);
  assert.equal(masterStudio(game.writing, coffee.id, true, 'typing'), 5);
  assert.equal(masterStudio(game.writing, coffee.id, true, 'typing'), 0);
  const other = normalizeGame({ writing: [coffee.id, 'bad-id', 'library-quiet'] }, new Set());
  mergeGame(game, other);
  assert.equal(gameStats({ sessions: {}, challengeDays: [], bestQuiz: 0, game }, new Map()).xp, 13);
});
