import assert from 'node:assert/strict';
import test from 'node:test';
import { createReviewRound, answerReview, reviewOutcome } from './review-round.js';

function grade(round, value) {
  round.revealed = true;
  return answerReview(round, value);
}

test('missed cards return after other cards exactly once without allowing hidden or duplicate grades', () => {
  const round = createReviewRound(['a', 'b', 'a']);
  assert.equal(answerReview(null, 'known'), null);
  assert.equal(answerReview(round, 'again'), null);
  assert.deepEqual(grade(round, 'again'), { phrase: 'a', firstAttempt: true, retryQueued: true });
  assert.deepEqual(round.queue, ['a', 'b', 'a']);
  assert.equal(answerReview(round, 'known'), null);
  grade(round, 'known');
  assert.deepEqual(grade(round, 'again'), { phrase: 'a', firstAttempt: false, retryQueued: false });
  assert.equal(round.index, round.queue.length);
  assert.equal(grade(round, 'known'), null);
  assert.equal(reviewOutcome(round).pending, 1);
});

test('a difficult round is bounded to sixteen presentations and reports unique phrases', () => {
  const round = createReviewRound(Array.from({ length: 20 }, (_, index) => String(index)));
  let firstAttempts = 0;
  while (round.index < round.queue.length) {
    if (grade(round, 'again').firstAttempt) firstAttempts++;
  }
  assert.equal(round.queue.length, 16);
  assert.equal(firstAttempts, 8);
  assert.equal(reviewOutcome(round).total, 8);
  assert.equal(reviewOutcome(round).difficult.length, 8);
});

test('results distinguish first-try recall, recovery and remaining difficulty and keep review settings', () => {
  const round = createReviewRound(['a', 'b', 'c'], { free: true, direction: 'ru-target' });
  grade(round, 'again');
  grade(round, 'known');
  grade(round, 'hard');
  grade(round, 'known');
  const result = reviewOutcome(round);
  assert.deepEqual([result.total, result.firstTry, result.recovered, result.pending], [3, 1, 1, 1]);
  assert.deepEqual(result.difficult.map(({ phrase, last }) => [phrase, last]), [['a', 'known'], ['c', 'hard']]);
  assert.equal(result.free, true);
  assert.equal(result.direction, 'ru-target');
  assert.equal(result.earned, 0);
  const retry = createReviewRound(result.difficult.map(({ phrase }) => phrase), { free: true, direction: result.direction });
  assert.deepEqual(retry.queue, ['a', 'c']);
  assert.equal(retry.index, 0);
  assert.deepEqual(Object.keys(retry.answers), []);
});
