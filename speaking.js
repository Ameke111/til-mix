const words = (text) => text.normalize('NFC').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];

export function compareSpeech(reference, transcript) {
  const expected = words(reference);
  const heard = words(transcript);
  const distance = Array.from({ length: expected.length + 1 }, (_, i) =>
    Array.from({ length: heard.length + 1 }, (_, j) => i === 0 ? j : i)
  );
  for (let i = 1; i <= expected.length; i++) {
    for (let j = 1; j <= heard.length; j++) {
      distance[i][j] = Math.min(
        distance[i - 1][j] + 1,
        distance[i][j - 1] + 1,
        distance[i - 1][j - 1] + Number(expected[i - 1] !== heard[j - 1])
      );
    }
  }
  let i = expected.length;
  let j = heard.length;
  let extra = 0;
  const alignment = expected.map((word) => ({ word, matched: false }));
  while (i && j) {
    const match = expected[i - 1] === heard[j - 1];
    if (distance[i][j] === distance[i - 1][j - 1] + Number(!match)) {
      alignment[--i].matched = match;
      j--;
    } else if (distance[i][j] === distance[i - 1][j] + 1) {
      i--;
    } else {
      j--;
      extra++;
    }
  }
  return { alignment, matches: alignment.filter(({ matched }) => matched).length, extra: extra + j };
}

export function measureRecording(samples, sampleRate) {
  const frameSize = Math.max(1, Math.round(sampleRate * .025));
  let first = -1;
  let last = 0;
  let loudFrames = 0;
  let clipped = 0;
  for (let index = 0; index < samples.length; index += frameSize) {
    const end = Math.min(index + frameSize, samples.length);
    let energy = 0;
    for (let sample = index; sample < end; sample++) {
      const value = samples[sample];
      energy += value * value;
      if (Math.abs(value) >= .99) clipped++;
    }
    if (Math.sqrt(energy / (end - index)) >= .012) {
      if (first === -1) first = index;
      last = end;
      loudFrames++;
    }
  }
  return {
    audible: loudFrames >= 6,
    clipped: clipped > .006 * samples.length,
    seconds: first === -1 ? 0 : (last - first) / sampleRate
  };
}

export function recordingAdvice({ audible, clipped, seconds }, referenceSeconds) {
  if (!audible) return 'Запись почти не слышна. Поднеси микрофон ближе и попробуй ещё раз.';
  if (clipped) return 'Запись перегружена. Отодвинь микрофон или говори немного тише.';
  if (Number.isFinite(referenceSeconds) && seconds < referenceSeconds * .55) {
    return 'Запись заметно короче образца. Повтори фразу целиком и чуть медленнее.';
  }
  if (Number.isFinite(referenceSeconds) && seconds > referenceSeconds * 1.8) {
    return 'Запись заметно длиннее образца. Послушай паузы в образце и попробуй повторить.';
  }
  return 'Голос хорошо слышен. Прослушай себя рядом с образцом.';
}
