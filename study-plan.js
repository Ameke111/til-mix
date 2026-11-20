import { lessonState } from './catalogue.js';
import { storyLanguage } from './languages.js';

// Recommendations derive from existing progress and never grant awards.
export function studyPlan({ stories, chapters, phrases, progress, language, day }) {
  const route = chapters.filter((chapter) => (chapter.language || 'kk') === language);
  const byId = new Map(stories.map((story) => [story.id, story]));
  const lessons = route.flatMap(({ ids }) => ids).map((id) => byId.get(id)).filter(Boolean);
  const completed = lessons.filter((story) => lessonState(story, progress.sessions[story.id]).completed);
  const resume = lessons.filter((story) => lessonState(story, progress.sessions[story.id]).started)
    .sort((a, b) => (progress.sessions[b.id]?.updated || 0) - (progress.sessions[a.id]?.updated || 0))[0];
  const next = resume || lessons.find((story) => !lessonState(story, progress.sessions[story.id]).completed)
    || lessons.find((story) => !lessonState(story, progress.sessions[story.id]).mastered) || lessons[0];
  const cards = phrases.filter((phrase) => {
    const story = byId.get([...phrase.lessons][0]);
    return story && storyLanguage(story) === language && Object.hasOwn(progress.review, phrase.kk);
  }).map((phrase) => ({ ...phrase, ...progress.review[phrase.kk] }))
    .sort((a, b) => a.due - b.due || a.count - b.count);
  const forecast = Array.from({ length: 7 }, (_, offset) => ({
    day: day + offset,
    cards: cards.filter((card) => offset === 0 ? card.due <= day : card.due === day + offset)
  }));
  const checkpoint = route.filter(({ id, ids }) => (progress.game.chapters[id] ?? -1) < 5
    && ids.every((id) => completed.some((story) => story.id === id)))
    .sort((a, b) => (progress.game.chapters[a.id] ?? -1) - (progress.game.chapters[b.id] ?? -1))[0];
  return {
    next, resume: Boolean(resume), checkpoint, forecast,
    total: lessons.length, completed: completed.length,
    checkpoints: route.filter(({ id }) => progress.game.chapters[id] >= 4).length,
    chapterTotal: route.length, saved: cards.length,
    overdue: cards.filter((card) => card.due < day).length,
    later: cards.filter((card) => card.due > day + 6).length
  };
}
