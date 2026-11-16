const ranks = [
  ['Новичок', 0], ['Собеседник', 50], ['Искатель', 120], ['Знаток города', 230],
  ['Путешественник', 380], ['Мастер диалогов', 560], ['Тіл шебері', 800]
];
const reviewTarget = 3;
const quizFlag = 1;
const reviewFlag = 2;

function validDay(day) {
  return Number.isSafeInteger(day) && day > 0;
}

export function normalizeGame(raw, phrases) {
  const days = Object.create(null);
  for (const [date, flags] of Object.entries(raw?.days ?? {})) {
    if (validDay(Number(date)) && Number.isInteger(flags) && flags >= 1 && flags <= 3) {
      days[Number(date)] = flags;
    }
  }
  const { day, reviewed } = raw?.review ?? {};
  const pending = validDay(day) && Array.isArray(reviewed)
    ? { day, reviewed: [...new Set(reviewed.filter((phrase) => phrases.has(phrase)))].slice(0, reviewTarget) }
    : { day: 0, reviewed: [] };
  if (pending.reviewed.length === reviewTarget) days[day] = (days[day] ?? 0) | reviewFlag;
  return { days, review: pending };
}

export function mergeGame(current, incoming) {
  for (const [day, flags] of Object.entries(incoming.days)) {
    current.days[day] = (current.days[day] ?? 0) | flags;
  }
  const { day, reviewed } = incoming.review;
  if (day < current.review.day) return;
  for (const phrase of reviewed) countReview(current, day, phrase);
}

export function countReview(game, day, phrase) {
  if ((game.days[day] & reviewFlag) || day < game.review.day) return;
  if (game.review.day !== day) game.review = { day, reviewed: [] };
  if (game.review.reviewed.includes(phrase)) return;
  game.review.reviewed.push(phrase);
  if (game.review.reviewed.length === reviewTarget) game.days[day] = (game.days[day] ?? 0) | reviewFlag;
}

export function passDailyQuiz(game, day, score) {
  if (score >= 3) game.days[day] = (game.days[day] ?? 0) | quizFlag;
}

export function dailyTasks(progress, day) {
  const flags = progress.game.days[day] ?? 0;
  return {
    story: progress.challengeDays.includes(day),
    quiz: Boolean(flags & quizFlag),
    review: flags & reviewFlag ? reviewTarget : progress.game.review.day === day ? progress.game.review.reviewed.length : 0,
    reviewTarget
  };
}

export function gameStats(progress, stories) {
  const completed = new Set();
  const mastered = new Set();
  let endings = 0;
  for (const [id, session] of Object.entries(progress.sessions)) {
    if (!session.endings.length) continue;
    completed.add(id);
    endings += session.endings.length;
    if (session.endings.length === stories.get(id).endingCount) mastered.add(id);
  }
  const challengeDays = new Set(progress.challengeDays);
  let xp = 10 * endings + 15 * mastered.size + 5 * challengeDays.size + 2 * progress.bestQuiz;
  let perfectDays = 0;
  for (const [date, flags] of Object.entries(progress.game.days)) {
    xp += 5 * (Boolean(flags & quizFlag) + Boolean(flags & reviewFlag));
    if (flags === (quizFlag | reviewFlag) && challengeDays.has(Number(date))) {
      xp += 15;
      perfectDays++;
    }
  }
  return { completed, mastered, endings, xp, perfectDays };
}

export function rankFor(xp) {
  const index = ranks.findLastIndex(([, threshold]) => xp >= threshold);
  const [name, start] = ranks[index];
  const next = ranks[index + 1]?.[1];
  return { level: index + 1, name, next, fraction: next ? (xp - start) / (next - start) : 1 };
}
