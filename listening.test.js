import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { LISTENING_CLIPS, listeningRound } from './listening.js';

const unchanged = (items) => items.slice();

test('every listening prompt has a unique transcript and a playable WAV source', () => {
  assert.equal(new Set(LISTENING_CLIPS.map(({ id }) => id)).size, LISTENING_CLIPS.length);
  assert.equal(new Set(LISTENING_CLIPS.map(({ kk }) => kk)).size, LISTENING_CLIPS.length);
  for (const { id, kk, ru, distractors } of LISTENING_CLIPS) {
    assert.ok(kk && ru);
    assert.equal(new Set([ru, ...distractors]).size, 3);
    const audio = readFileSync(new URL('./audio/' + id + '.wav', import.meta.url));
    assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
    assert.equal(audio.toString('ascii', 8, 12), 'WAVE');
    assert.equal(audio.readUInt32LE(4) + 8, audio.length);
    assert.ok(audio.length > 6000, id);
  }
});

test('rounds keep the selected level and give unseen recordings priority', () => {
  for (const level of ['A1', 'A2']) {
    const known = LISTENING_CLIPS.find((clip) => clip.level === level).id;
    const round = listeningRound({ level, solved: [known], shuffle: unchanged });
    assert.equal(round.length, 5);
    assert.ok(round.every((clip) => clip.level === level && clip.id !== known && clip.options.includes(clip.ru)));
  }
});
