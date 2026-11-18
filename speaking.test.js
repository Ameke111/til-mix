import assert from 'node:assert/strict';
import test from 'node:test';
import { compareSpeech, measureRecording, recordingAdvice } from './speaking.js';

test('recognition compares Kazakh words without treating case or punctuation as mistakes', () => {
  const reference = 'Қай тілде сөйлескіңіз келеді?';
  const match = compareSpeech(reference, 'ҚАЙ ТІЛДЕ сөйлескіңіз келеді.');
  assert.equal(match.matches, 4);
  assert.equal(match.extra, 0);
  assert.ok(match.alignment.every(({ matched }) => matched));
  const differentLetter = compareSpeech(reference, 'Қай тілде сөйлескініз келеді');
  assert.deepEqual(differentLetter.alignment.filter(({ matched }) => !matched).map(({ word }) => word), ['сөйлескіңіз']);
});

test('alignment keeps the remaining words matched after an insertion or deletion', () => {
  const extra = compareSpeech('Маған шай беріңізші', 'Маған су шай беріңізші');
  assert.equal(extra.matches, 3);
  assert.equal(extra.extra, 1);
  const missing = compareSpeech('Маған шай шай беріңізші', 'Маған шай беріңізші');
  assert.equal(missing.alignment.filter(({ matched }) => !matched).length, 1);
  assert.equal(missing.matches, 3);
});

test('audio feedback distinguishes silence, clipping and measured duration', () => {
  const rate = 16_000;
  const samples = new Float32Array(2 * rate);
  assert.equal(measureRecording(samples, rate).audible, false);
  samples.fill(.1, rate / 2, rate * 1.5);
  assert.deepEqual(measureRecording(samples, rate), { audible: true, clipped: false, seconds: 1 });
  assert.match(recordingAdvice(measureRecording(samples, rate), 3), /короче образца/);
  samples.fill(1, rate / 2, rate);
  assert.equal(measureRecording(samples, rate).clipped, true);
});
