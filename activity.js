export const practiceTypes = { story: 'Диалог', quiz: 'Тест', review: 'Карточки', studio: 'Фразы', listening: 'Аудирование' };
const flags = { story: 1, quiz: 2, review: 4, studio: 8, listening: 16 };

export function readActivity(raw) {
  const activity = Object.create(null);
  for (const [key, mask] of Object.entries(raw ?? {})) {
    const day = Number(key);
    if (Number.isSafeInteger(day) && day > 0 && Number.isInteger(mask) && mask >= 1 && mask <= 31) activity[day] = mask;
  }
  return activity;
}

export function markPractice(activity, day, type) {
  activity[day] = (activity[day] ?? 0) | flags[type];
}

export function recentPractice(day, activeDays, activity) {
  const days = new Set(activeDays);
  return Array.from({ length: 28 }, (_, index) => {
    const date = day - 27 + index;
    const types = Object.keys(flags).filter((type) => activity[date] & flags[type]);
    return { date, types, active: types.length > 0 || days.has(date) };
  });
}
