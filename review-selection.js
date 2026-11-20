import { duePhrases } from './learning.js';

export function reviewSelection(entries, cards, { day, category = 'all', lesson = '' }) {
  const eligible = new Set(entries.filter((phrase) => Object.hasOwn(cards, phrase.kk)
    && (category === 'all' || phrase.categories.includes(category))
    && (!lesson || phrase.lessons.has(lesson))).map(({ kk }) => kk));
  const due = duePhrases(cards, day).filter((phrase) => eligible.has(phrase));
  const later = [...eligible].filter((phrase) => cards[phrase].due > day)
    .sort((a, b) => cards[a].due - cards[b].due);
  return { due, all: [...due, ...later], nextDue: later.length ? cards[later[0]].due : null };
}
