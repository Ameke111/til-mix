export function setupCompanion() {
  const control = document.querySelector('#companion');
  const fox = document.querySelector('#fox');
  const status = document.querySelector('#companion-status');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let motion;
  let resetTimer;

  function react(mood = 'cheer') {
    clearTimeout(resetTimer);
    control.dataset.reaction = mood;
    resetTimer = setTimeout(() => { delete control.dataset.reaction; }, 700);
    if (mood === 'cheer' && !reducedMotion.matches) {
      motion?.cancel();
      motion = fox.animate([
        { transform: 'translateY(0) rotate(0deg)' },
        { transform: 'translateY(-16px) rotate(-8deg)', offset: .46 },
        { transform: 'translateY(0) rotate(0deg)' }
      ], { duration: 510, easing: 'cubic-bezier(.25,.65,.35,1)' });
    }
  }

  control.addEventListener('click', () => {
    react();
    status.textContent = 'Түлкі радуется.';
  });
  return react;
}

export function setupDailyPhrase({ phrases, audioButton, hasCard, addCard }) {
  const kk = document.querySelector('#daily-phrase-kk');
  const ru = document.querySelector('#daily-phrase-ru');
  const actions = document.querySelector('#daily-phrase-actions');
  const save = document.querySelector('#daily-phrase-save');
  const status = document.querySelector('#daily-phrase-status');
  const shortPhrases = phrases.filter((phrase) => phrase.kk.length <= 64 && phrase.ru.length <= 82);
  const dailyPhrases = shortPhrases.length ? shortPhrases : phrases;
  let current;

  save.addEventListener('click', () => {
    if (!current || hasCard(current.kk)) return;
    addCard(current.kk);
    status.textContent = 'Фраза дня добавлена в карточки.';
  });
  return (day) => {
    const phrase = dailyPhrases[day % dailyPhrases.length];
    if (!phrase) return;
    if (phrase !== current) {
      current = phrase;
      kk.textContent = phrase.kk;
      ru.textContent = phrase.ru;
      actions.replaceChildren(audioButton(phrase.kk), save);
    }
    const saved = hasCard(phrase.kk);
    save.setAttribute('aria-disabled', String(saved));
    save.textContent = saved ? 'В карточках ✓' : 'В карточки ↗';
  };
}
