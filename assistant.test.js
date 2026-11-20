import assert from 'node:assert/strict';
import test from 'node:test';
import { checkPractice, createAssistant } from './assistant.js';
import { TIL_STORIES } from './stories.js';

const assistant = createAssistant(TIL_STORIES);

test('follow-up explanations use the chosen phrase and preserve its source lesson', () => {
  const first = assistant.answer('Что значит «Алып кетемін»?');
  const context = { phrase: first.examples[0].kk, lesson: first.examples[0].lesson };
  assert.equal(assistant.answer('Объясни проще', context).examples[0].kk, 'Алып кетемін.');
  assert.equal(assistant.answer('А какой урок?', context).lesson, 'coffee');
  assert.equal(assistant.answer('Объясни проще').kind, 'unknown');
});

test('chat practice accepts punctuation but preserves Kazakh letters and word order', () => {
  assert.equal(checkPractice('АЛЫП КЕТЕМІН!', 'Алып кетемін.').correct, true);
  assert.equal(checkPractice('Алып кетемин', 'Алып кетемін.').correct, false);
  const swapped = checkPractice('кетемін алып тағы', 'Алып кетемін.');
  assert.equal(swapped.correct, false);
  assert.equal(swapped.extra, 1);
  assert.ok(swapped.words.every(({ correct }) => !correct));
});

test('translates a lesson line with typographic punctuation and a Kazakh question', () => {
  const answer = assistant.answer('«АЛЫП КЕТЕМІН!» нені білдіреді?');
  assert.equal(answer.kind, 'translation');
  assert.equal(answer.examples[0].ru, 'Возьму с собой.');
  assert.equal(answer.examples[0].lesson, 'coffee');
});

test('uses the current dialogue only for a contextual translation request', () => {
  const context = { lesson: 'coffee', phrase: TIL_STORIES[0].scenes.start.line[0] };
  assert.equal(assistant.answer('Переведи реплику', context).examples[0].kk, context.phrase);
  assert.equal(assistant.answer('Переведи реплику').kind, 'unknown');
  assert.equal(assistant.answer('Что за планета Нептун?', context).kind, 'unknown');
});

test('explains a grammar question with examples and offers a bilingual glossary translation', () => {
  const grammar = assistant.answer('Почему «бар ма» пишется раздельно?');
  assert.equal(grammar.kind, 'grammar');
  assert.match(grammar.text, /пишутся отдельно/);
  assert.ok(grammar.examples.some(({ kk }) => kk.endsWith('ма?')));

  const word = assistant.answer('Как будет по-казахски «спасибо»?');
  assert.equal(word.kind, 'translation');
  assert.match(word.text, /рақмет.*спасибо/);
  assert.equal(word.examples[0].lesson, 'market');
});

test('recommends a lesson by topic or requested level', () => {
  assert.equal(assistant.answer('Дай урок про велосипед').lesson, 'bike-rental');
  assert.equal(assistant.answer('Сабақ ұсыншы, тауарды қайтару').lesson, 'return-order');
  for (const [question, level] of [['Какой урок для новичка?', 'A1'], ['Хочу пройти А2', 'A2']]) {
    const { lesson } = assistant.answer(question);
    assert.equal(TIL_STORIES.find(({ id }) => id === lesson)?.level, level);
  }
});

test('continues an example search without repeating previous results', () => {
  const answer = assistant.answer('Как узнать, где остановка?');
  assert.equal(answer.kind, 'phrases');
  assert.equal(answer.examples[0].kk, 'Кешіріңіз, аялдама қайда?');
  assert.ok(answer.more);
  const next = assistant.more(answer.more);
  assert.ok(next.examples.length > 0);
  assert.ok(next.examples.every(({ kk }) => !answer.examples.some((previous) => previous.kk === kk)));
});

test('declines unrelated questions and accepts arbitrary text as data only', () => {
  for (const question of ['Какая погода в Алматы?', 'Переведи «ғарыш кемесі»', 'Посоветуй урок про слонов', '<img src=x onerror=alert(1)>']) {
    const answer = assistant.answer(question);
    assert.equal(answer.kind, 'unknown', question);
    assert.equal(answer.examples.length, 0);
  }
});
