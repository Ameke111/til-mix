import { grammarNotes, intentExamples, lessonKeywords, vocabulary } from './assistant-data.js';

export const questionLimit = 180;

const filler = new Set((
  'а и в во на не но с со по к из у за от до об о для про ли или это этой этот тот то где как что кто зачем почему куда вежливо можно нужно ' +
  'будет скажи сказать спроси спросить спрашивать означает значат значит переведи перевод перевести подбери подобрать посоветуй подскажи нужен хочу дай ' +
  'посоветовать предложи покажи найди какой какую какие объясни мне мы мой ты пожалуйста фраза фразу фразы фраз реплика реплику слово ' +
  'слова выражение пример примеры урок уроки урока уроков диалог диалоги история истории тема теме учить учиться пройти уровень узнать ' +
  'русский русском русского казахском казахски казахского туралы бар қандай қалай деген нені білдіреді аудар аударып берші айт ' +
  'қазақша орысша бұл болады мысал мысалдар сабақ сабақты ұсыншы түсіндір сұраймын'
).split(' '));

function normalize(text) {
  return text.normalize('NFKC').toLowerCase().replaceAll('ё', 'е').replace(/[\s\p{P}\p{S}]+/gu, ' ').trim();
}

function terms(text) {
  return [...new Set(normalize(text).split(' ').filter((word) => word.length >= 2 && !filler.has(word)))];
}

function features(text) {
  const vector = new Set();
  for (const word of normalize(text).split(' ').filter(Boolean)) {
    vector.add('word:' + word);
    const padded = '^' + word + '$';
    for (let i = 0; i < padded.length - 2; i++) vector.add(padded.slice(i, i + 3));
  }
  return vector;
}

// Fit a supervised, nearest-example classifier over weighted words and character trigrams.
function trainIntentClassifier(examples) {
  const corpus = Object.entries(examples).flatMap(([intent, texts]) => texts.map((text) => ({ intent, vector: features(text) })));
  const counts = new Map();
  for (const { vector } of corpus) {
    for (const feature of vector) counts.set(feature, (counts.get(feature) ?? 0) + 1);
  }
  const weights = new Map([...counts].map(([feature, count]) => [feature,
    (feature.startsWith('word:') ? 2 : 1) * Math.log1p(corpus.length / count)]));
  const magnitude = (vector) => Math.sqrt([...vector].reduce((sum, feature) => sum + (weights.get(feature) ?? 0) ** 2, 0));
  const training = corpus.map((example) => ({ ...example, length: magnitude(example.vector) }));
  return (question) => {
    const vector = features(question);
    const length = magnitude(vector);
    if (!length) return undefined;
    const best = new Map();
    for (const example of training) {
      let dot = 0;
      for (const feature of vector) {
        if (example.vector.has(feature)) dot += weights.get(feature) ** 2;
      }
      const score = dot / (length * example.length);
      best.set(example.intent, Math.max(score, best.get(example.intent) ?? 0));
    }
    const [[intent, score], [, runnerUp]] = [...best].sort((a, b) => b[1] - a[1]);
    return score >= 0.24 && score - runnerUp >= 0.035 ? intent : undefined;
  };
}

const classify = trainIntentClassifier(intentExamples);
const beginner = new Set(['начать', 'начинающих', 'начинающего', 'новичков', 'новичка', 'новичок', 'бастаушыға', 'жаңадан']);

function strength(query, candidate) {
  if (query === candidate) return 1;
  if (query.length < 4 || candidate.length < 4) return 0;
  const prefix = Math.min(5, Math.min(query.length, candidate.length) - 1);
  return query.slice(0, prefix) === candidate.slice(0, prefix) ? 0.62 : 0;
}

function relevance(query, candidate) {
  if (!query.length || !candidate.length) return 0;
  const matches = query.map((word) => Math.max(...candidate.map((target) => strength(word, target))));
  if (matches.filter(Boolean).length < Math.ceil(query.length * 0.6)) return 0;
  return matches.reduce((sum, value) => sum + value, 0) / query.length;
}

function rank(items, score) {
  return items.map((item) => ({ item, score: score(item) }))
    .filter((match) => match.score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

function collectPhrases(stories) {
  const phrases = new Map();
  for (const story of stories) {
    for (const scene of Object.values(story.scenes)) {
      const lines = [scene.line, ...(scene.choices ?? []).filter((choice) => choice[2])];
      for (const [kk, ru, , note] of lines) {
        const key = normalize(kk);
        const phrase = { kk, ru, key, russian: normalize(ru), words: terms(kk + ' ' + ru), note, lesson: story.id };
        if (!phrases.has(key) || (!phrases.get(key).note && note)) phrases.set(key, phrase);
      }
    }
  }
  return phrases;
}

function pack(kind, text, examples = [], lesson, offset = 0) {
  const next = offset + 3;
  return {
    kind, text, examples: examples.slice(offset, next), lesson,
    more: next < examples.length ? { kind, text, examples, lesson, offset: next } : null
  };
}

export function createAssistant(stories) {
  const phrases = collectPhrases(stories);
  const allPhrases = [...phrases.values()];
  const lessons = stories.map(({ id, title, description, level }) => ({
    id, title, description, level, terms: terms(`${title} ${description} ${level} ${level.replace('A', 'А')} ${lessonKeywords[id] ?? ''}`)
  }));
  const notes = grammarNotes.map((note) => ({
    ...note, terms: terms(note.cues.join(' ')), examples: note.examples.map((phrase) => phrases.get(normalize(phrase))).filter(Boolean)
  }));
  const glossary = vocabulary.flatMap(([kk, ru, sample]) => {
    const example = phrases.get(normalize(sample));
    return example ? [{ kk, ru, example, aliases: [kk, ...ru.split(', ')].map(normalize) }] : [];
  });

  function recommend(query, lesson) {
    const topics = query.filter((word) => !beginner.has(word));
    const pool = topics.length !== query.length ? lessons.filter(({ level }) => level === 'A1') : lessons;
    if (topics.length) return rank(pool, (entry) => relevance(topics, entry.terms))[0];
    return pool.find(({ id }) => id === lesson) ?? pool.find(({ level }) => level === 'A1');
  }

  function answer(raw, { lesson, phrase } = {}) {
    const question = raw.trim().slice(0, questionLimit);
    const normalized = normalize(question);
    const intent = classify(question);
    const wantsLesson = intent === 'lessons' || /(?:^| )(?:урок|уроки|урока|сабақ|сабақты)(?: |$)/.test(normalized);
    const wantsGrammar = intent === 'grammar' || /^(?:почему|зачем|неге) /.test(normalized);
    const quoted = question.match(/[«“"]([^»”"]+)[»”"]/)?.[1];
    const direct = quoted ? normalize(quoted) : normalized
      .replace(/^(?:что (?:значит|означает)|переведи(?: фразу| слово)?|как (?:сказать|будет) (?:по казахски|по русски)) /, '')
      .replace(/ (?:нені білдіреді|орысша қалай болады|қазақша қалай болады)$/, '');
    const query = terms(quoted ?? question);
    const matches = rank(allPhrases, (entry) => {
      const score = relevance(query, entry.words);
      return score && score + (entry.lesson === lesson ? 0.06 : 0);
    });
    const exact = phrases.get(direct) ?? allPhrases.find((entry) => entry.russian === direct);
    const original = phrase ? phrases.get(normalize(phrase)) : undefined;
    const bestLesson = recommend(query, lesson);
    const note = rank(notes, (entry) => relevance(query, entry.terms))[0];
    const word = glossary.find(({ aliases }) => aliases.includes(direct)
      || (intent === 'translation' && query.length === 1 && aliases.includes(query[0])));

    if (/^(привет|здравствуйте|сәлем|сәлеметсіз бе|добрый день|қайырлы күн)$/.test(normalized)) {
      return pack('hello', 'Сәлем! Могу подобрать фразы для ситуации, помочь с переводом из урока или объяснить правило на примерах. Что разберём?');
    }
    if (wantsGrammar && note) {
      return pack('grammar', note.title + '. ' + note.text, note.examples);
    }
    if (exact || (original && /^(переведи реплику|что это значит|что значит эта фраза)$/.test(normalized))) {
      const entry = exact ?? original;
      return pack('translation', entry.note ?? 'Вот как эта реплика переводится в уроке.', [entry]);
    }
    if (word) {
      return pack('translation', `«${word.kk}» — «${word.ru}». Вот пример из диалога.`, [word.example]);
    }
    if (!wantsLesson && note && (intent === 'phrases' || !intent || !matches.length)) {
      return pack('grammar', note.title + '. ' + note.text, note.examples);
    }
    if (!wantsLesson && matches.length) {
      const text = intent === 'translation' ? 'Вот близкие фразы с переводом из уроков.' : 'Вот что можно сказать в этой ситуации.';
      return pack('phrases', text, matches);
    }
    if (bestLesson && (wantsLesson || query.length)) {
      const sample = allPhrases.find((entry) => entry.lesson === bestLesson.id);
      return pack('lesson', `${bestLesson.title} · ${bestLesson.level}. ${bestLesson.description}`, sample ? [sample] : [], bestLesson.id);
    }
    return pack('unknown', 'В уроках не нашлось уверенного ответа. Попробуй написать одну фразу или назови ситуацию, например «заказать чай» или «спросить цену».');
  }

  return { answer, more: ({ kind, text, examples, lesson, offset }) => pack(kind, text, examples, lesson, offset) };
}
