const preferenceKey = 'til-mix-companion-folded';
const replies = {
  pet: 'Рақмет! Это «спасибо» по-казахски.',
  story: 'Жарайсың! Ещё один диалог позади.',
  phrase: 'Дұрыс! Фраза получилась.',
  quiz: 'Керемет! Тест пройден.',
  retry: 'Попробуй ещё раз. Сложную фразу можно повторить в карточках.'
};

function nextActivity({ due, resumed, practiced }) {
  if (due) return ['Фразы уже ждут тебя в карточках.', '#review', 'Повторить карточки ↗'];
  if (resumed) return ['У тебя есть незаконченный диалог.', '#path', 'Продолжить урок ↗'];
  if (practiced) return ['Хочешь закрепить то, что уже знаешь?', '#studio', 'Собрать фразу ↗'];
  return ['Сәлем! Готов к разговору?', '#stories', 'Выбрать диалог ↗'];
}

export function setupCompanion({ phrases, audioButton, hasCard, addCard }) {
  const root = document.querySelector('#companion');
  const body = document.querySelector('#companion-body');
  const fox = document.querySelector('#fox');
  const toggle = document.querySelector('#companion-toggle');
  const line = document.querySelector('#companion-line');
  const next = document.querySelector('#companion-next');
  const save = document.querySelector('#companion-save');
  const phraseActions = document.querySelector('#companion-phrase-actions');
  const dailyPhrases = phrases.filter(({ kk, ru }) => kk.length <= 64 && ru.length <= 82);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let shownPhrase;
  let lastMood = '';
  let guidance = line.textContent;
  let motion;
  let resetTimer;

  function setFolded(folded) {
    body.hidden = folded;
    toggle.setAttribute('aria-expanded', String(!folded));
    toggle.textContent = folded ? 'Позвать Түлкі' : 'Свернуть';
    if (folded && motion) motion.cancel();
  }

  try {
    setFolded(localStorage.getItem(preferenceKey) === 'yes');
  } catch {
    setFolded(false);
  }

  toggle.addEventListener('click', () => {
    const folded = !body.hidden;
    setFolded(folded);
    try {
      localStorage.setItem(preferenceKey, folded ? 'yes' : 'no');
    } catch {
      // The preference still applies for this visit.
    }
  });

  function react(kind, announce = false) {
    lastMood = kind;
    line.textContent = replies[kind];
    const excited = kind !== 'retry';
    root.dataset.mood = excited ? 'happy' : 'thinking';
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => { lastMood = ''; line.textContent = guidance; delete root.dataset.mood; }, 5200);
    if (announce) document.querySelector('#companion-status').textContent = replies[kind];
    if (!body.hidden && !reducedMotion.matches && excited) {
      motion?.cancel();
      motion = fox.animate([
        { transform: 'translateY(0) rotate(0deg)' },
        { transform: 'translateY(-13px) rotate(-5deg)', offset: .45 },
        { transform: 'translateY(0) rotate(0deg)' }
      ], { duration: 540, easing: 'cubic-bezier(.25,.65,.35,1)' });
    }
  }

  function update({ day, due, resumed, practiced }) {
    const phrase = dailyPhrases[day % dailyPhrases.length];
    if (phrase !== shownPhrase) {
      shownPhrase = phrase;
      document.querySelector('#companion-kk').textContent = phrase.kk;
      document.querySelector('#companion-ru').textContent = phrase.ru;
      phraseActions.replaceChildren(audioButton(phrase.kk), save);
    }
    save.disabled = hasCard(phrase.kk);
    save.textContent = save.disabled ? 'В карточках ✓' : 'В карточки ↗';
    const [prompt, href, label] = nextActivity({ due, resumed, practiced });
    guidance = prompt;
    if (!lastMood) line.textContent = prompt;
    next.href = href;
    next.textContent = label;
  }

  document.querySelector('#companion-pet').addEventListener('click', () => react('pet', true));
  save.addEventListener('click', () => {
    if (!shownPhrase || save.disabled) return;
    addCard(shownPhrase.kk);
    document.querySelector('#companion-status').textContent = 'Фраза дня добавлена в карточки.';
    next.focus();
  });
  return {
    react, update,
    reset() {
      clearTimeout(resetTimer);
      motion?.cancel();
      lastMood = '';
      delete root.dataset.mood;
    }
  };
}
