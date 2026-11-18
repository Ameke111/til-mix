import { readStudio, studioXp } from './studio.js';
import { TIL_ROUTE } from './stories.js';
import { readActivity } from './activity.js';
import { readListening } from './listening.js';

const ranks = [
  ['Новичок', 0], ['Собеседник', 50], ['Искатель', 120], ['Знаток города', 230],
  ['Путешественник', 380], ['Мастер диалогов', 560], ['Тіл шебері', 800]
];
const reviewTarget = 3;
const quizFlag = 1;
const reviewFlag = 2;
const starThresholds = [2, 4, 5];
const listeningPoints = 2;

export function starsFor(score) {
  return starThresholds.filter((threshold) => score >= threshold).length;
}

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
  const chapters = Object.create(null);
  for (const { id } of TIL_ROUTE) {
    const score = raw?.chapters?.[id];
    if (Number.isInteger(score) && score >= 0 && score <= 5) chapters[id] = score;
  }
  return {
    days, review: pending, chapters, studio: readStudio(raw?.studio), writing: readStudio(raw?.writing),
    listening: readListening(raw?.listening), activity: readActivity(raw?.activity)
  };
}

export function mergeGame(current, incoming) {
  current.studio = [...new Set([...current.studio, ...incoming.studio])];
  current.writing = [...new Set([...current.writing, ...incoming.writing])];
  current.listening = [...new Set([...current.listening, ...incoming.listening])];
  for (const [day, flags] of Object.entries(incoming.activity)) current.activity[day] = (current.activity[day] ?? 0) | flags;
  for (const [id, score] of Object.entries(incoming.chapters)) {
    current.chapters[id] = Math.max(current.chapters[id] ?? 0, score);
  }
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

export function masterRecording(game, id) {
  if (game.listening.includes(id)) return 0;
  game.listening.push(id);
  return listeningPoints;
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
  const chapterStars = Object.values(progress.game.chapters).reduce((total, score) => total + starsFor(score), 0);
  let xp = 10 * endings + 15 * mastered.size + 5 * challengeDays.size + 2 * progress.bestQuiz
    + studioXp(progress.game.studio, progress.game.writing) + 5 * chapterStars + listeningPoints * progress.game.listening.length;
  let perfectDays = 0;
  for (const [date, flags] of Object.entries(progress.game.days)) {
    xp += 5 * (Boolean(flags & quizFlag) + Boolean(flags & reviewFlag));
    if (flags === (quizFlag | reviewFlag) && challengeDays.has(Number(date))) {
      xp += 15;
      perfectDays++;
    }
  }
  return { completed, mastered, endings, xp, perfectDays, chapterStars };
}

export function rankFor(xp) {
  const index = ranks.findLastIndex(([, threshold]) => xp >= threshold);
  const [name, start] = ranks[index];
  const next = ranks[index + 1]?.[1];
  return { level: index + 1, name, next, fraction: next ? (xp - start) / (next - start) : 1 };
}
