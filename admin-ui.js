export function setupAdmin({ api, status, accountDialog, categories }) {
  const dialog = document.querySelector('#admin-dialog');
  const open = document.querySelector('#open-admin');
  const filter = document.querySelector('#admin-filter');
  const list = document.querySelector('#admin-list');
  const note = document.querySelector('#admin-status');
  const more = document.querySelector('#admin-more');
  let cursor;
  let generation = 0;
  let updating = false;
  const date = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' });

  function renderEntry(entry) {
    const card = document.createElement('article');
    card.className = 'admin-entry';
    const head = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = categories[entry.category] ?? 'Обращение';
    const time = document.createElement('time');
    time.dateTime = new Date(entry.created).toISOString();
    time.textContent = '#' + entry.id + ' · ' + date.format(entry.created);
    head.append(title, time);
    const message = document.createElement('p');
    message.textContent = entry.message;
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'button button-outline';
    action.textContent = entry.state === 'open' ? 'Закрыть обращение' : 'Вернуть в очередь';
    action.setAttribute('aria-label', action.textContent + ' №' + entry.id);
    action.addEventListener('click', async () => {
      if (updating) return;
      const state = entry.state === 'open' ? 'closed' : 'open';
      const view = generation;
      updating = true;
      action.disabled = true;
      status(note, 'Сохраняем…');
      try {
        await api('admin/feedback/' + entry.id, 'PATCH', { state });
        if (view !== generation || !dialog.open) return;
        note.focus();
        await load(false, state === 'closed' ? 'Обращение закрыто.' : 'Обращение вернулось в очередь.');
      } catch (error) {
        if (view === generation && dialog.open) status(note, error.message, true);
      } finally {
        updating = false;
        action.disabled = false;
      }
    });
    card.append(head, message, action);
    return card;
  }

  async function load(append = false, message) {
    const view = ++generation;
    if (!append) {
      list.replaceChildren();
      cursor = undefined;
    }
    more.hidden = true;
    list.setAttribute('aria-busy', 'true');
    status(note, 'Загружаем обращения…');
    try {
      const query = new URLSearchParams({ state: filter.value });
      if (append && cursor) query.set('before', String(cursor));
      const { accounts, counts, entries, next } = await api('admin/feedback?' + query);
      if (view !== generation || !dialog.open) return;
      document.querySelector('#admin-accounts').textContent = accounts;
      document.querySelector('#admin-open-count').textContent = counts.open;
      document.querySelector('#admin-closed-count').textContent = counts.closed;
      const cards = entries.map(renderEntry);
      list.append(...cards);
      cursor = next;
      more.hidden = !next;
      status(note, message || (list.childElementCount ? 'Показано обращений: ' + list.childElementCount : 'Обращений с этим статусом пока нет.'));
      if (append) cards[0]?.querySelector('button').focus();
    } catch (error) {
      if (view === generation && dialog.open) {
        more.hidden = !cursor;
        status(note, error.message || 'Не удалось загрузить очередь.', true);
      }
    } finally {
      if (view === generation) list.removeAttribute('aria-busy');
    }
  }

  open.addEventListener('click', () => {
    accountDialog.close();
    dialog.showModal();
    void load();
  });
  filter.addEventListener('change', () => { void load(); });
  more.addEventListener('click', () => { void load(true); });
  document.querySelector('#admin-refresh').addEventListener('click', () => { void load(); });
  dialog.addEventListener('close', () => {
    generation++;
    list.replaceChildren();
    list.removeAttribute('aria-busy');
    if (!open.hidden) document.querySelector('#open-account').focus();
  });
  return (allowed) => {
    open.hidden = !allowed;
    if (!allowed && dialog.open) dialog.close();
  };
}
