const settingsKey = 'til-mix-guest-settings';
const categories = { lesson: 'Ошибка в уроке', interface: 'Работа сайта', idea: 'Идея для улучшения' };
const $ = (selector) => document.querySelector(selector);

async function api(path, method = 'GET', data) {
  const options = { method, credentials: 'same-origin', cache: 'no-store' };
  if (data !== undefined) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(data);
  }
  const response = await fetch('/api/' + path, options);
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.message || 'Не удалось выполнить запрос.');
    error.code = result.code;
    throw error;
  }
  return result;
}

function readSettings() {
  const fallback = { name: 'Гость', weeklyGoal: 3 };
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey));
    if (!saved || typeof saved.name !== 'string' || !saved.name.trim() || saved.name.length > 36) return fallback;
    if (!Number.isInteger(saved.weeklyGoal) || saved.weeklyGoal < 1 || saved.weeklyGoal > 7) return fallback;
    return saved;
  } catch {
    return fallback;
  }
}

function download(name, contents, type) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([contents], { type }));
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function status(element, text = '', isError = false) {
  element.textContent = text;
  element.dataset.error = String(isError);
}

async function submit(form, run, errorHandler) {
  const button = form.querySelector('[type="submit"]');
  if (button.disabled) return;
  const values = new FormData(form);
  button.disabled = true;
  form.setAttribute('aria-busy', 'true');
  try {
    await run(values);
  } catch (error) {
    errorHandler(error);
  } finally {
    button.disabled = false;
    form.removeAttribute('aria-busy');
  }
}

export function setupAccount({ snapshot, loadGuest, swapProgress, mergeProgress, notify }) {
  const hasServer = Boolean($('meta[name="til-server"][content="accounts"]'));
  const dialog = $('#account-dialog');
  const feedbackDialog = $('#feedback-dialog');
  const accountStatus = $('#account-status');
  const feedbackStatus = $('#feedback-status');
  const auth = $('#auth-form');
  const settings = $('#profile-form');
  const feedback = $('#feedback-form');
  const secret = $('#auth-password');
  let guest = readSettings();
  let current;
  let revision = 0;
  let authMode = 'login';
  let guestSettings = false;
  let queued;
  let syncing;
  let blocked = false;

  function report(error) {
    const text = error instanceof TypeError ? 'Сервер недоступен. Проверь подключение.' : error.message;
    status(accountStatus, text, true);
  }

  function passwordVisibility(reveal) {
    secret.type = reveal ? 'text' : 'password';
    const toggle = $('#show-auth-password');
    toggle.textContent = reveal ? 'Скрыть' : 'Показать';
    toggle.setAttribute('aria-pressed', String(reveal));
  }

  function updateProfile() {
    const info = current || guest;
    const displayAuth = hasServer && !current && !guestSettings;
    const registering = authMode === 'register';
    $('#profile-trigger-text').textContent = hasServer && !current ? 'Войти' : 'Профиль';
    $('#profile-mode').textContent = current ? '@' + current.login : displayAuth ? 'ЛИЧНЫЙ КАБИНЕТ' : 'ГОСТЕВОЙ РЕЖИМ';
    $('#account-title').textContent = displayAuth ? registering ? 'Создать аккаунт' : 'Снова в Тіл Mix' : 'Мой профиль';
    $('#auth-tabs').hidden = !displayAuth;
    auth.hidden = !displayAuth;
    $('#profile-settings').hidden = displayAuth;
    for (const tab of document.querySelectorAll('[data-auth-mode]')) {
      tab.setAttribute('aria-pressed', String(tab.dataset.authMode === authMode));
    }
    $('#auth-intro').textContent = registering
      ? 'Достаточно псевдонима, логина и парольной фразы. Электронная почта не нужна.'
      : 'Войди, чтобы открыть свой прогресс и сохранённые обращения.';
    $('#register-name').hidden = !registering;
    $('#register-accept').hidden = !registering;
    auth.elements.name.required = registering;
    auth.elements.accept.required = registering;
    secret.minLength = registering ? 12 : 1;
    secret.autocomplete = registering ? 'new-password' : 'current-password';
    $('#password-help').hidden = !registering;
    $('#auth-submit').firstChild.textContent = registering ? 'Создать аккаунт ' : 'Войти ';
    $('#profile-intro').textContent = current
      ? 'Прогресс и цель сохраняются в аккаунте на сервере.'
      : hasServer ? 'Гостевой прогресс хранится в этом браузере.' : 'Демо на GitHub Pages. Цель и прогресс хранятся в браузере. Аккаунты доступны при запуске серверной версии.';
    settings.elements.name.value = info.name;
    settings.elements.weeklyGoal.value = String(info.weeklyGoal);
    $('#back-to-auth').hidden = !hasServer || Boolean(current);
    $('#account-delete').hidden = !current;
    $('#account-logout').hidden = !current;
    $('#merge-guest-progress').hidden = !current;
    $('#retry-sync').hidden = !current || !blocked;
  }

  function activate(data) {
    current = data.user || undefined;
    revision = data.revision || 0;
    queued = undefined;
    blocked = false;
    guestSettings = false;
    swapProgress(current ? data.progress : loadGuest());
    $('#account-delete').open = false;
    updateProfile();
    updateFeedbackForm();
  }

  async function drain() {
    while (queued && current && !blocked) {
      const payload = queued;
      queued = undefined;
      try {
        const response = await api('progress', 'PUT', { progress: payload, revision });
        revision = response.revision;
      } catch (error) {
        queued ||= payload;
        blocked = true;
        $('#retry-sync').hidden = false;
        const message = error.code === 'revision_conflict'
          ? 'Прогресс изменился в другой вкладке. Объедини записи в профиле.'
          : 'Пока не удалось сохранить прогресс. Повтори попытку в профиле.';
        status(accountStatus, message, true);
        if (!dialog.open) notify(message);
      }
    }
  }

  function store(value) {
    if (!current) return false;
    queued = value;
    if (!syncing && !blocked) {
      syncing = drain().finally(() => {
        syncing = undefined;
        if (queued && !blocked && current) store(queued);
      });
    }
    return true;
  }

  $('#open-account').addEventListener('click', () => {
    guestSettings = false;
    if (!blocked) status(accountStatus);
    updateProfile();
    dialog.showModal();
  });
  for (const tab of document.querySelectorAll('[data-auth-mode]')) {
    tab.addEventListener('click', () => {
      authMode = tab.dataset.authMode;
      auth.elements.password.value = '';
      passwordVisibility(false);
      status(accountStatus);
      updateProfile();
    });
  }
  $('#open-guest-settings').addEventListener('click', () => {
    guestSettings = true;
    status(accountStatus);
    updateProfile();
  });
  $('#back-to-auth').addEventListener('click', () => {
    guestSettings = false;
    status(accountStatus);
    updateProfile();
  });
  $('#show-auth-password').addEventListener('click', () => passwordVisibility(secret.type === 'password'));

  auth.addEventListener('submit', (event) => {
    event.preventDefault();
    const mode = authMode;
    void submit(auth, async (form) => {
      status(accountStatus, 'Проверяем данные…');
      const result = await api(mode, 'POST', {
        login: form.get('login'), password: form.get('password'), name: form.get('name'), accept: form.get('accept') === 'on'
      });
      auth.reset();
      passwordVisibility(false);
      activate(result);
      status(accountStatus, mode === 'register' ? 'Аккаунт создан.' : 'Ты вошёл в аккаунт.');
    }, report);
  });

  settings.addEventListener('submit', (event) => {
    event.preventDefault();
    void submit(settings, async (form) => {
      const name = form.get('name').trim();
      const weeklyGoal = Number(form.get('weeklyGoal'));
      if (!name || name.length > 36 || !Number.isInteger(weeklyGoal) || weeklyGoal < 1 || weeklyGoal > 7) {
        throw new Error('Проверь псевдоним и недельную цель.');
      }
      if (current) {
        const patched = await api('account', 'PATCH', { name, weeklyGoal });
        current = patched.user;
      } else {
        localStorage.setItem(settingsKey, JSON.stringify({ name, weeklyGoal }));
        guest = { name, weeklyGoal };
      }
      updateProfile();
      status(accountStatus, 'Настройки сохранены.');
    }, report);
  });

  $('#export-progress').addEventListener('click', () => {
    download('til-mix-progress.json', JSON.stringify({ format: 'til-mix-progress', version: 1, progress: snapshot() }, null, 2), 'application/json');
    status(accountStatus, 'Копия прогресса подготовлена.');
  });
  $('#import-progress').addEventListener('change', async (event) => {
    const input = event.currentTarget;
    const file = input.files[0];
    if (!file) return;
    try {
      if (file.size > 128 * 1024) throw new Error('Выбери копию Тіл Mix размером до 128 КБ.');
      const data = JSON.parse(await file.text());
      if (data?.format !== 'til-mix-progress' || data.version !== 1 || !data.progress || Array.isArray(data.progress)
          || typeof data.progress !== 'object' || !Object.hasOwn(data.progress, 'sessions')) {
        throw new Error('Формат копии не распознан.');
      }
      mergeProgress(data.progress);
      status(accountStatus, 'Копия добавлена к текущему прогрессу.');
    } catch (error) {
      status(accountStatus, error instanceof SyntaxError ? 'Файл не является корректной копией JSON.' : error.message, true);
    } finally {
      input.value = '';
    }
  });
  $('#merge-guest-progress').addEventListener('click', () => {
    mergeProgress(loadGuest());
    status(accountStatus, 'Данные гостя добавлены в аккаунт.');
  });
  $('#retry-sync').addEventListener('click', async (event) => {
    const trigger = event.currentTarget;
    trigger.disabled = true;
    try {
      if (syncing) await syncing;
      const remote = await api('account');
      if (!remote.user || remote.user.login !== current?.login) {
        status(accountStatus, 'Сессия закончилась. Скачай копию, войди заново и загрузи её.', true);
        return;
      }
      revision = remote.revision;
      blocked = false;
      mergeProgress(remote.progress);
      await syncing;
      if (!blocked) status(accountStatus, 'Прогресс объединён и сохранён.');
      updateProfile();
    } catch (error) {
      report(error);
    } finally {
      trigger.disabled = false;
    }
  });

  $('#account-logout').addEventListener('click', async (event) => {
    const trigger = event.currentTarget;
    trigger.disabled = true;
    try {
      if (syncing) await syncing;
      if (blocked) {
        download('til-mix-progress.json', JSON.stringify({ format: 'til-mix-progress', version: 1, progress: snapshot() }, null, 2), 'application/json');
      }
      await api('logout', 'POST');
      const wasBlocked = blocked;
      activate({ user: null });
      status(accountStatus, wasBlocked ? 'Ты вышел. Несохранённый прогресс в скачанной копии.' : 'Ты вышел. Открыт гостевой режим.');
    } catch (error) {
      report(error);
    } finally {
      trigger.disabled = false;
    }
  });
  $('#delete-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void submit(event.currentTarget, async (form) => {
      if (syncing) await syncing;
      await api('account', 'DELETE', { password: form.get('password') });
      $('#delete-form').reset();
      activate({ user: null });
      status(accountStatus, 'Аккаунт и данные на сервере удалены.');
    }, report);
  });

  function updateFeedbackForm() {
    $('#feedback-intro').textContent = current
      ? 'Опиши ситуацию без паролей, имён других людей и контактных данных.'
      : 'Составь заметку и скачай её текстом. Она останется на твоём устройстве.';
    $('#feedback-submit').textContent = current ? 'Сохранить обращение' : 'Скачать заметку';
  }

  async function loadFeedback() {
    const history = $('#feedback-history');
    history.replaceChildren();
    if (!current) return;
    const owner = current.login;
    const { entries } = await api('feedback');
    if (current?.login !== owner || !feedbackDialog.open || !entries.length) return;
    const title = document.createElement('h3');
    title.textContent = 'Мои обращения';
    const fragment = document.createDocumentFragment();
    fragment.append(title);
    for (const entry of entries) {
      const box = document.createElement('article');
      box.className = 'feedback-entry';
      const label = document.createElement('strong');
      label.textContent = categories[entry.category] + ' · ' + new Date(entry.created).toLocaleDateString('ru-RU');
      const message = document.createElement('p');
      message.textContent = entry.message;
      box.append(label, message);
      fragment.append(box);
    }
    history.replaceChildren(fragment);
  }

  $('#open-feedback').addEventListener('click', () => {
    status(feedbackStatus);
    updateFeedbackForm();
    feedbackDialog.showModal();
    void loadFeedback().catch(() => status(feedbackStatus, 'Не удалось загрузить сохранённые обращения.', true));
  });
  $('#feedback-message').addEventListener('input', (event) => {
    $('#feedback-count').textContent = event.currentTarget.value.length + ' / 1200';
  });
  feedback.addEventListener('submit', (event) => {
    event.preventDefault();
    void submit(feedback, async (form) => {
      const category = form.get('category');
      const message = form.get('message').trim();
      if (!Object.hasOwn(categories, category) || message.length < 8 || message.length > 1200) {
        throw new Error('Выбери тему и напиши от 8 до 1200 символов.');
      }
      if (current) {
        await api('feedback', 'POST', { category, message });
        feedback.reset();
        $('#feedback-count').textContent = '0 / 1200';
        status(feedbackStatus, 'Обращение сохранено в профиле.');
        await loadFeedback();
      } else {
        download('til-mix-feedback.txt', categories[category] + '\n\n' + message + '\n', 'text/plain;charset=utf-8');
        status(feedbackStatus, 'Заметка подготовлена для скачивания.');
      }
    }, (error) => status(feedbackStatus, error.message, true));
  });

  updateProfile();
  updateFeedbackForm();
  dialog.addEventListener('close', () => {
    auth.elements.password.value = '';
    passwordVisibility(false);
    $('#delete-form').reset();
  });
  const ready = hasServer
    ? api('account').then((data) => { if (data.user && !current) activate(data); })
      .catch(() => status(accountStatus, 'Пока не удалось проверить подключение к серверу.', true))
    : Promise.resolve();
  return { ready, store, getGoal: () => (current || guest).weeklyGoal };
}
