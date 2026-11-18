import { practiceTypes, recentPractice } from './activity.js';
import { weekDays } from './learning.js';

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function renderWeek(day, activeDays, goal, due) {
  const active = new Set(activeDays);
  const count = weekDays(day).filter((date) => date <= day && active.has(date)).length;
  const progress = document.querySelector('#week-summary-meter');
  progress.max = goal;
  progress.value = Math.min(count, goal);
  document.querySelector('#week-summary-count').textContent = count + ' из ' + goal + ' дн. · ' + (count >= goal ? 'цель выполнена' : 'цель недели');
  const next = document.querySelector('#week-recommendation');
  next.href = due ? '#review' : '#studio';
  next.textContent = due ? 'Карточки на сегодня (' + due + ') ↗' : 'Потренировать фразы ↗';
}

export function activityCalendar(elem, day, activeDays, activity) {
  const items = recentPractice(day, activeDays, activity);
  const dates = items.filter(({ active }) => active).length;
  const section = elem('section', 'activity-calendar');
  const heading = elem('h3', '', 'Последние 28 дней');
  heading.id = 'activity-calendar-title';
  section.setAttribute('aria-labelledby', heading.id);
  const list = elem('ol', 'calendar-days');
  for (const item of items) {
    const cell = elem('li');
    const date = dateFormat.format(item.date * 86400000);
    const types = item.types.map((type) => practiceTypes[type]).join(', ');
    const text = date + ' · ' + (types || (item.active ? 'Занятие' : 'Без занятия'));
    cell.dataset.intensity = String(item.types.length || Number(item.active));
    if (item.date === day) cell.setAttribute('aria-current', 'date');
    cell.title = text;
    cell.append(elem('span', 'sr-only', text));
    list.append(cell);
  }
  const legend = elem('p', 'calendar-legend', 'Дней с практикой: ' + dates + ' из 28. Более тёмный цвет — больше видов занятий.');
  section.append(heading, list, legend);
  return section;
}
