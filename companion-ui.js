export function setupCompanion() {
  const control = document.querySelector('#companion');
  const fox = document.querySelector('#fox');
  const status = document.querySelector('#companion-status');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let motion;
  let resetTimer;
  setupFoxMovement(control, reducedMotion);

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

function setupFoxMovement(control, reducedMotion) {
  let cursor;
  let lookFrame;
  let roamTimer;
  let roaming;

  function queueLook() {
    if (!lookFrame) lookFrame = requestAnimationFrame(look);
  }

  function look() {
    lookFrame = undefined;
    if (!cursor || reducedMotion.matches) {
      clearLook();
      return;
    }
    const rect = control.getBoundingClientRect();
    const dx = cursor.x - (rect.left + rect.width / 2);
    const dy = cursor.y - (rect.top + rect.height * .45);
    const near = Math.hypot(dx, dy) < 150 + rect.width * .45;
    if (near) {
      const angle = Math.max(-13, Math.min(13, dx * .085));
      control.dataset.curious = 'true';
      control.style.setProperty('--fox-angle', angle.toFixed(1) + 'deg');
      control.style.setProperty('--fox-eye-x', (angle / 4).toFixed(1) + 'px');
      control.style.setProperty('--fox-eye-y', Math.max(-2.5, Math.min(2, dy / 40)).toFixed(1) + 'px');
    } else clearLook();
    if (roaming) queueLook();
  }

  function clearLook() {
    if (!control.hasAttribute('data-curious')) return;
    delete control.dataset.curious;
    for (const property of ['--fox-angle', '--fox-eye-x', '--fox-eye-y']) control.style.removeProperty(property);
  }

  function schedule(delay = 16000 + Math.random() * 13000) {
    clearTimeout(roamTimer);
    if (!document.hidden && !reducedMotion.matches) roamTimer = setTimeout(startRoam, delay);
  }

  function startRoam() {
    if (document.hidden || reducedMotion.matches) return;
    if (control.matches(':hover, :focus-visible, [data-curious]') || document.querySelector('dialog[open]')) {
      schedule(3000 + Math.random() * 2000);
      return;
    }
    const space = control.getBoundingClientRect().left;
    if (space < 80) {
      schedule();
      return;
    }
    const distance = Math.round(space * (.73 + Math.random() * .18));
    const duration = Math.min(6900, 1700 + distance * 4.2);
    const away = 'translateX(' + -distance + 'px)';
    control.style.setProperty('--fox-roam-time', duration + 'ms');
    control.dataset.roaming = 'true';
    const trip = control.animate([
      { transform: 'translateX(0)', easing: 'ease-in-out' },
      { transform: away, offset: .44 },
      { transform: away, offset: .56, easing: 'ease-in-out' },
      { transform: 'translateX(0)' }
    ], { duration });
    roaming = trip;
    trip.onfinish = () => { if (roaming === trip) resetMovement(); };
    queueLook();
  }

  function resetMovement() {
    roaming?.cancel();
    roaming = undefined;
    delete control.dataset.roaming;
    control.style.removeProperty('--fox-roam-time');
    if (document.hidden) cursor = undefined;
    queueLook();
    schedule();
  }

  window.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    cursor = { x: event.clientX, y: event.clientY };
    queueLook();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => {
    cursor = undefined;
    queueLook();
  });
  window.addEventListener('resize', resetMovement);
  document.addEventListener('visibilitychange', resetMovement);
  reducedMotion.addEventListener('change', resetMovement);
  schedule(10000 + Math.random() * 7000);
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
