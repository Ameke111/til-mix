const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const weekdayFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: 'UTC' });

export function renderStudyPlan(root, plan, { elem, button, language, languageName, openLesson, review, checkpoint, dictionary, audio }) {
  const sameLanguage = root.dataset.language === language;
  const expanded = sameLanguage && root.querySelector('details')?.open;
  const previousDay = sameLanguage ? Number(root.dataset.day) : NaN;
  root.dataset.language = language;
  const header = elem('div', 'study-plan-heading');
  const title = elem('div');
  const heading = elem('h3', '', 'Твой следующий шаг');
  heading.id = 'study-plan-title';
  title.append(elem('p', 'study-kicker', 'ЛИЧНЫЙ ПЛАН · ' + languageName.toUpperCase()), heading);
  header.append(title, elem('span', 'study-plan-tag', 'В твоём темпе'));
  const stats = elem('dl', 'study-plan-stats');
  for (const [value, label] of [
    [plan.completed + ' / ' + plan.total, 'Уроков пройдено'],
    [plan.checkpoints + ' / ' + plan.chapterTotal, 'Проверок на 4–5'],
    [String(plan.saved), 'Фраз в личных карточках']
  ]) {
    const item = elem('div');
    item.append(elem('dt', '', label), elem('dd', '', value));
    stats.append(item);
  }
  const actions = elem('div', 'study-plan-actions');
  function recommendation(kind, title, reason, label, action) {
    const card = elem('article', 'study-action');
    card.dataset.kind = kind;
    const control = button('button button-outline', label, action);
    if (kind === 'lesson') control.id = 'study-open-lesson';
    card.append(elem('p', 'study-kicker', kind === 'memory' ? 'ПАМЯТЬ' : kind === 'check' ? 'ПРОВЕРКА' : 'ДИАЛОГ'),
      elem('h4', '', title), elem('p', 'study-action-reason', reason), control);
    actions.append(card);
  }
  const due = plan.forecast[0].cards.length;
  if (due) recommendation('memory', 'Освежи знакомые фразы', 'На сегодня: ' + due + '. Начни с короткого подхода до 8 разных карточек.', 'Повторить сегодня', review);
  if (plan.next) recommendation('lesson', plan.next.title,
    plan.resume ? 'Диалог уже начат. Продолжишь с сохранённой реплики.'
      : plan.completed === plan.total ? 'Все уроки пройдены. Исследуй другие ответы и концовки.' : 'Следующий непройденный урок твоего маршрута.',
    plan.resume ? 'Продолжить диалог' : plan.completed === plan.total ? 'Исследовать диалог' : 'Открыть урок', (event) => openLesson(plan.next.id, event.currentTarget));
  if (plan.checkpoint) recommendation('check', plan.checkpoint.title,
    'Все диалоги главы пройдены. Проверь перевод без подсказок и улучши свой результат.', 'Проверить главу', () => checkpoint(plan.checkpoint));
  else if (!due) recommendation('memory', plan.saved ? 'Память под контролем' : 'Собери личный словарь',
    plan.saved ? 'Карточек на сегодня нет. Следующие даты доступны в календаре ниже.' : 'Добавь полезные фразы из уроков. Здесь появится расписание повторений.',
    'Открыть словарь', () => dictionary(plan.next?.id));

  const details = elem('details', 'study-forecast');
  details.open = Boolean(expanded);
  details.append(elem('summary', '', 'Календарь повторений · 7 дней'));
  const help = elem('p', 'study-forecast-note', 'По текущему расписанию. После твоих ответов даты изменятся. Сегодня включены и просроченные карточки: ' + plan.overdue + '.');
  const days = elem('div', 'study-forecast-days');
  days.setAttribute('role', 'group');
  days.setAttribute('aria-label', 'Выбрать день повторения');
  const selection = elem('div', 'study-forecast-selection');
  selection.id = 'study-forecast-selection';
  const controls = [];
  function selectDay(index) {
    const bucket = plan.forecast[index];
    root.dataset.day = bucket.day;
    controls.forEach((control, position) => control.setAttribute('aria-pressed', String(position === index)));
    const title = elem('h4', '', dateFormat.format(bucket.day * 86400000) + ' · карточек: ' + bucket.cards.length);
    title.setAttribute('role', 'status');
    const list = elem('ul', 'study-forecast-phrases');
    for (const phrase of bucket.cards.slice(0, 8)) {
      const item = elem('li');
      const copy = elem('div');
      const text = elem('b', '', phrase.kk);
      text.lang = language;
      copy.append(text, elem('span', '', phrase.ru));
      item.append(copy, audio(phrase.kk));
      list.append(item);
    }
    selection.replaceChildren(title);
    if (bucket.cards.length) selection.append(list);
    else selection.append(elem('p', '', 'На этот день карточек пока нет. Можно пройти урок или пополнить словарь.'));
    if (bucket.cards.length > 8) selection.append(elem('p', '', 'Показаны первые 8. Остальные: ' + (bucket.cards.length - 8) + '.'));
    if (index === 0 && bucket.cards.length) selection.append(button('button button-primary', 'Начать повторение', review));
    else if (bucket.cards.length) selection.append(elem('p', '', 'Эти карточки появятся в режиме «По расписанию» в выбранный день.'));
  }
  const max = Math.max(1, ...plan.forecast.map(({ cards }) => cards.length));
  plan.forecast.forEach((bucket, index) => {
    const control = button('study-day', '', () => selectDay(index));
    control.setAttribute('aria-label', (index === 0 ? 'Сегодня, ' : '') + dateFormat.format(bucket.day * 86400000) + ', карточек: ' + bucket.cards.length);
    control.setAttribute('aria-controls', selection.id);
    const bar = elem('span', 'study-day-bar');
    bar.setAttribute('aria-hidden', 'true');
    bar.style.setProperty('--load', (bucket.cards.length / max * 100) + '%');
    bar.append(elem('i'));
    control.append(elem('span', '', index === 0 ? 'Сегодня' : weekdayFormat.format(bucket.day * 86400000)), bar, elem('b', '', String(bucket.cards.length)));
    controls.push(control);
    days.append(control);
  });
  selectDay(Math.max(0, plan.forecast.findIndex(({ day }) => day === previousDay)));
  details.append(help, days, selection, elem('p', 'study-forecast-note', 'Позже этой недели: ' + plan.later + '. Сохранённых карточек в курсе: ' + plan.saved + '.'));
  root.replaceChildren(header, stats, actions, details);
}
