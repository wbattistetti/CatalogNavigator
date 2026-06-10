/**
 * useListSelection: Explorer-style range and toggle helpers.
 */
import assert from 'node:assert/strict';
import { rangeSelectIds, toggleSelectedId } from './useListSelection';

function test(name: string, fn: () => void) {
  fn();
  console.log(`ok: ${name}`);
}

test('range select fills inclusive span from anchor to target', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual([...rangeSelectIds(items, 0, 3)], ['a', 'b', 'c', 'd']);
  assert.deepEqual([...rangeSelectIds(items, 3, 1)], ['b', 'c', 'd']);
});

test('range select with same anchor and target selects one row', () => {
  const items = ['a', 'b', 'c'];
  assert.deepEqual([...rangeSelectIds(items, 1, 1)], ['b']);
});

test('toggle adds unselected id', () => {
  const next = toggleSelectedId(new Set(['a']), 'b');
  assert.deepEqual([...next], ['a', 'b']);
});

test('toggle removes selected id', () => {
  const next = toggleSelectedId(new Set(['a', 'b']), 'b');
  assert.deepEqual([...next], ['a']);
});

console.log('all useListSelection tests passed');
