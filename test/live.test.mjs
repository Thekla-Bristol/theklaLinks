import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConfig, decode } from '../scripts/lib/live.mjs';

test('reads Firebase settings pasted in either style', () => {
  assert.deepEqual(readConfig('firebase: { apiKey: "AIza1", projectId: "thekla-links" }'), { projectId: 'thekla-links', apiKey: 'AIza1' });
  assert.deepEqual(readConfig(`firebase: { "apiKey": 'k', "projectId": 'p' }`), { projectId: 'p', apiKey: 'k' });
  assert.equal(readConfig('projectId: ""').projectId, '');
});

test('decodes Firestore documents', () => {
  const str = (v) => ({ stringValue: v });
  const map = (o) => ({ mapValue: { fields: o } });
  const arr = (a) => ({ arrayValue: { values: a } });
  const doc = map({
    overrides: map({ 'e-1': map({ status: str('soldout'), hidden: { booleanValue: true }, times: map({ sets: arr([map({ name: str('A') })]) }) }) }),
    updatedAt: { timestampValue: '2026-10-19T12:00:00Z' },
    n: { integerValue: '3' },
  });
  assert.deepEqual(decode(doc), { overrides: { 'e-1': { status: 'soldout', hidden: true, times: { sets: [{ name: 'A' }] } } }, updatedAt: '2026-10-19T12:00:00Z', n: 3 });
});
