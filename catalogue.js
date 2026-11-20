import { storyLanguage } from './languages.js';

const normalize = (text, language) => text.normalize('NFC').toLocaleLowerCase(language).replaceAll('ё', 'е').trim();

export function lessonState(story, session) {
  const completed = Boolean(session?.endings?.length);
  const started = Boolean(session && session.scene !== 'start' && !story.scenes[session.scene]?.end);
  const total = Object.values(story.scenes).filter(({ end }) => end).length;
  return { completed, started, mastered: session?.endings?.length === total, untouched: !completed && !started };
}

// Input order is the course route; stable sorting preserves it for tied results.
export function selectLessons(stories, sessions, { language, query = '', category = 'all', level = 'all', progress = 'all', sort = 'route' }) {
  const terms = normalize(query, language).split(/\s+/).filter(Boolean);
  const matches = stories.filter((story) => {
    if (storyLanguage(story) !== language || (category !== 'all' && story.category !== category)
      || (level !== 'all' && !story.level.includes(level))) return false;
    const state = lessonState(story, sessions[story.id]);
    if (progress === 'new' && !state.untouched || progress === 'started' && !state.started
      || progress === 'done' && !state.completed || progress === 'mastered' && !state.mastered) return false;
    if (!terms.length) return true;
    const lines = Object.values(story.scenes).flatMap((scene) => [scene.line, ...(scene.choices ?? []).filter((choice) => choice[2])])
      .map((line) => line.slice(0, 2).join(' '));
    const text = normalize([story.title, story.word, story.description, ...lines].join(' '), language);
    return terms.every((term) => text.includes(term));
  });
  if (sort === 'recent') matches.sort((a, b) => (sessions[b.id]?.updated || 0) - (sessions[a.id]?.updated || 0));
  if (sort === 'new') matches.sort((a, b) => Number(lessonState(b, sessions[b.id]).untouched) - Number(lessonState(a, sessions[a.id]).untouched));
  if (sort === 'title') matches.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  return matches;
}
