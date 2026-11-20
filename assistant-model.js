import { TIL_STORIES } from './stories.js';
import { createAssistant } from './assistant.js';
import { LANGUAGES, storyLanguage } from './languages.js';

const lessonSearch = Object.fromEntries(Object.keys(LANGUAGES).map((language) => [language,
  createAssistant(TIL_STORIES.filter((story) => storyLanguage(story) === language))]));

const systemPrompt = `Ты языковой помощник Тіл Mix для изучающих казахский на уровнях A1–A2.
Общайся на языке вопроса, учитывай просьбу пользователя выбрать язык. Помогай с переводом, грамматикой, лексикой, письмом и разговорной практикой.
Отвечай коротко, до 5 предложений. При исправлении сначала напиши исправленную фразу целиком, затем ОДНО предложение о конкретной ошибке. Учитывай допустимые варианты. Если правило неизвестно, скажи об этом. Не выдумывай объяснений.
В ролевом диалоге напиши одну естественную реплику персонажа и дождись ответа. Соблюдай выбранное вежливое или дружеское обращение. Если просят только фразу, выдай только фразу.
Можно обсуждать любые вопросы изучения языка. Ты не можешь начислять XP, сохранять прогресс, просматривать интернет или управлять сайтом. Материалы урока ниже служат справкой. Не выдумывай ссылки. Ответы не проверены преподавателем.`;

const grammarReference = `Справка о согласовании подлежащего и сказуемого.
Мен оқимын. Сен оқисың. Сіз оқисыз. Ол оқиды.
Мен сөйлеймін. Сен сөйлейсің. Сіз сөйлейсіз. Ол сөйлейді.
Слово мен требует первого лица, сен — второго, сіз — вежливого второго. Исправляя личное окончание, сохраняй смысл и время исходной фразы.
Формы с -а/-е/-й могут выражать обычное действие в настоящем или будущее в зависимости от контекста.
При обращении на сіз используй Қалайсыз, при обращении на сен — Қалайсың.`;

export class ModelError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function modelSettings(env = process.env) {
  if (!env.TIL_AI_URL || !env.TIL_AI_MODEL) return null;
  const url = new URL(env.TIL_AI_URL);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) {
    throw new Error('TIL_AI_URL requires HTTPS or a loopback HTTP address.');
  }
  if (url.username || url.password || url.search || url.hash) throw new Error('Keep model credentials in TIL_AI_KEY.');
  return { url: url.href, model: env.TIL_AI_MODEL, key: env.TIL_AI_KEY };
}

export function modelMessages(body) {
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 12) {
    throw new ModelError(400, 'Начни новый разговор или сократи переписку.');
  }
  let total = 0;
  const messages = body.messages.map((message, index) => {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string'
      || !message.content.trim() || message.content.length > 5000
      || message.role !== (index % 2 === 0 ? 'user' : 'assistant')) {
      throw new ModelError(400, 'Не удалось прочитать переписку. Очисти чат и попробуй ещё раз.');
    }
    total += message.content.length;
    return { role: message.role, content: message.content };
  });
  if (messages.at(-1).role !== 'user' || total > 9000 || messages.at(-1).content.length > 2000) {
    throw new ModelError(400, 'Сократи сообщение или начни новый разговор.');
  }
  const language = Object.hasOwn(LANGUAGES, body.language) ? body.language : 'kk';
  const lesson = TIL_STORIES.find((story) => story.id === body.lesson && storyLanguage(story) === language);
  const lines = lesson ? Object.values(lesson.scenes).flatMap((scene) => [scene.line, ...(scene.choices ?? []).filter((choice) => choice[2])]) : [];
  const current = lines.find(([kk]) => kk === body.phrase);
  const reference = lesson ? '\nCurrent lesson reference\n' + JSON.stringify({
    title: lesson.title, level: lesson.level, currentPhrase: current?.slice(0, 2), scenes: lesson.scenes
  }) : '';
  const found = lessonSearch[language].answer(messages.at(-1).content, { lesson: lesson?.id, phrase: current?.[0] });
  const examples = found.examples.map(({ kk, ru, note }) => ({ kk, ru, note }));
  const relevant = examples.length ? '\nRelated course examples\n' + JSON.stringify(examples) : '';
  const course = LANGUAGES[language];
  const prompt = systemPrompt.replace('изучающих казахский', 'изучающих язык «' + course.name + '»')
    + '\nИзучаемый язык: ' + course.native + ' (' + language + '). Если просят говорить на изучаемом языке, отвечай на '
    + course.native + '. Примеры и ролевые реплики давай на этом языке; пояснения можно давать по-русски.';
  return [{ role: 'system', content: prompt + '\n' + (language === 'kk' ? grammarReference : '') + reference + relevant }, ...messages];
}

export async function requestModel(settings, messages, signal) {
  try {
    const response = await fetch(settings.url, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', ...(settings.key ? { Authorization: 'Bearer ' + settings.key } : {}) },
      body: JSON.stringify({ model: settings.model, messages, temperature: 0.2, presence_penalty: 0.5, max_tokens: 500,
        stream: false })
    });
    if (!response.ok) throw new ModelError(502, 'Сервис нейросети сейчас недоступен. Попробуй ещё раз.');
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (typeof content !== 'string' || !content || content.length > 5000) {
      throw new ModelError(502, 'Нейросеть не прислала подходящий ответ. Попробуй уточнить вопрос.');
    }
    return { text: content, truncated: data.choices[0].finish_reason === 'length' };
  } catch (error) {
    if (error instanceof ModelError) throw error;
    throw new ModelError(503, signal.aborted ? 'Ожидание ответа завершено. Можно повторить вопрос.' : 'Не удалось связаться с нейросетью. Проверь, что сервер модели запущен.');
  }
}
