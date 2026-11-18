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

export function normalizeMistakes(value, phrases) {
  const mistakes = Object.create(null);
  if (!value || typeof value !== 'object') return mistakes;
  for (const [phrase, record] of Object.entries(value)) {
    if (!phrases.has(phrase) || !record) continue;
    const { missed, learned } = record;
    if (!Number.isSafeInteger(missed) || missed <= 0 || !Number.isSafeInteger(learned) || learned < 0) continue;
    mistakes[phrase] = { missed, learned };
  }
  return mistakes;
}

export function mergeMistakes(mistakes, incoming) {
  for (const [phrase, record] of Object.entries(incoming)) {
    const current = mistakes[phrase];
    mistakes[phrase] = {
      missed: Math.max(current?.missed ?? 0, record.missed),
      learned: Math.max(current?.learned ?? 0, record.learned)
    };
  }
}

export function recordMistake(mistakes, phrase, correct, now = Date.now()) {
  const record = mistakes[phrase] ?? { missed: 0, learned: 0 };
  if (correct && record.missed <= record.learned) return;
  const time = Math.max(now, record.missed + 1, record.learned + 1);
  record[correct ? 'learned' : 'missed'] = time;
  mistakes[phrase] = record;
}

export function pendingMistakes(mistakes) {
  return Object.keys(mistakes).filter((phrase) => mistakes[phrase].missed > mistakes[phrase].learned);
}

export function quizQuestions(entries, { direction, category, size, eligible = () => true, allDistractors = false }, shuffle) {
  const prompt = direction === 'ru-kk' ? 'ru' : 'kk';
  const answer = direction === 'ru-kk' ? 'kk' : 'ru';
  const pool = entries.filter((phrase) => eligible(phrase) && (category === 'all' || phrase.categories.includes(category)));
  const options = (allDistractors ? entries : pool).map((item) => item[answer]);
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
    const distractors = [...new Set(options.filter((text) => !excluded.has(text)))];
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
