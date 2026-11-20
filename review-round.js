export function createReviewRound(phrases, { free = false, direction = 'target-ru' } = {}) {
  return { queue: [...new Set(phrases)].slice(0, 8), index: 0, revealed: false, earned: 0,
    free, direction, answers: Object.create(null) };
}

export function answerReview(round, grade) {
  if (!round) return null;
  const phrase = round.queue[round.index];
  if (!phrase || !round.revealed || !['again', 'hard', 'known'].includes(grade)) return null;
  const previous = round.answers[phrase];
  const firstAttempt = !previous;
  round.answers[phrase] = { first: previous?.first ?? grade, last: grade, attempts: (previous?.attempts ?? 0) + 1 };
  // One extra encounter per phrase keeps each round bounded to at most 16 cards.
  const retryQueued = firstAttempt && grade === 'again';
  if (retryQueued) round.queue.push(phrase);
  round.index++;
  round.revealed = false;
  return { phrase, firstAttempt, retryQueued };
}

export function reviewOutcome(round) {
  const entries = Object.entries(round.answers);
  return {
    total: entries.length,
    firstTry: entries.filter(([, answer]) => answer.first === 'known').length,
    recovered: entries.filter(([, answer]) => answer.first !== 'known' && answer.last === 'known').length,
    pending: entries.filter(([, answer]) => answer.last !== 'known').length,
    difficult: entries.filter(([, answer]) => answer.first !== 'known').map(([phrase, answer]) => ({ phrase, ...answer })),
    free: round.free, direction: round.direction, earned: round.earned
  };
}
