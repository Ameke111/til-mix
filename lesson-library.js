import { storyLanguage } from './languages.js';
import { lessonState } from './catalogue.js';

export function readBookmarks(raw, lessons, now = Date.now()) {
  const result = Object.create(null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const [id, record] of Object.entries(raw)) {
    if (!lessons.has(id) || typeof record?.saved !== 'boolean' || !Number.isSafeInteger(record.updated)
      || record.updated <= 0 || record.updated > now + 60_000) continue;
    result[id] = { saved: record.saved, updated: record.updated };
  }
  return result;
}

export function setBookmark(records, id, saved, now = Date.now()) {
  records[id] = { saved, updated: Math.max(now, (records[id]?.updated ?? 0) + 1) };
}

// Keep removals so importing an older backup cannot restore deleted bookmarks.
export function mergeBookmarks(current, incoming) {
  for (const [id, record] of Object.entries(incoming)) {
    const previous = current[id];
    if (!previous || record.updated > previous.updated || record.updated === previous.updated && !record.saved) {
      current[id] = { ...record };
    }
  }
}

export function resumableLessons(stories, sessions, language) {
  return stories.filter((story) => storyLanguage(story) === language && lessonState(story, sessions[story.id]).started)
    .sort((a, b) => (sessions[b.id]?.updated ?? 0) - (sessions[a.id]?.updated ?? 0));
}
