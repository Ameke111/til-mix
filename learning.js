const intervals = [1, 3, 7, 14, 30];

export function localDay(date = new Date()) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}

export function weekDays(day) {
  const monday = day - ((day + 3) % 7 + 7) % 7;
  return Array.from({ length: 7 }, (_, index) => monday + index);
}

export function normalizeReview(value) {
  const cards = Object.create(null);
  if (!value || typeof value !== 'object') return cards;
  for (const [phrase, card] of Object.entries(value)) {
    if (!card || !Number.isInteger(card.due) || card.due < 0) continue;
    if (!Number.isInteger(card.step) || card.step < 0 || card.step > intervals.length) continue;
    if (!Number.isInteger(card.count) || card.count < 0) continue;
    cards[phrase] = { due: card.due, step: card.step, count: card.count };
  }
  return cards;
}

export function duePhrases(cards, day) {
  return Object.keys(cards)
    .filter((phrase) => cards[phrase].due <= day)
    .sort((a, b) => cards[a].due - cards[b].due || cards[a].count - cards[b].count);
}

export function scheduleReview(card, grade, day) {
  const count = card.count + 1;
  if (grade === 'again') return { due: day, step: 0, count };
  if (grade === 'hard') return { due: day + 1, step: Math.max(0, card.step - 1), count };
  if (grade !== 'known') throw new RangeError('Unknown review grade');
  return {
    due: day + intervals[Math.min(card.step, intervals.length - 1)],
    step: Math.min(card.step + 1, intervals.length),
    count
  };
}

export function quizQuestions(entries, { direction, category, size }, shuffle) {
  const prompt = direction === 'ru-kk' ? 'ru' : 'kk';
  const answer = direction === 'ru-kk' ? 'kk' : 'ru';
  const pool = entries.filter((phrase) => category === 'all' || phrase.categories.includes(category));
  const questions = new Map();
  const validAnswers = new Map();
  for (const phrase of entries) {
    if (!validAnswers.has(phrase[prompt])) validAnswers.set(phrase[prompt], new Set());
    validAnswers.get(phrase[prompt]).add(phrase[answer]);
  }
  for (const phrase of shuffle(pool)) {
    const key = phrase[prompt];
    if (questions.has(key)) continue;
    const excluded = validAnswers.get(key);
    const distractors = [...new Set(pool.map((item) => item[answer]).filter((text) => !excluded.has(text)))];
    if (distractors.length < 2) continue;
    questions.set(key, {
      kk: phrase.kk,
      ru: phrase.ru,
      prompt: key,
      correct: phrase[answer],
      options: shuffle([phrase[answer], ...shuffle(distractors).slice(0, 2)])
    });
    if (questions.size >= size) break;
  }
  return [...questions.values()];
}
