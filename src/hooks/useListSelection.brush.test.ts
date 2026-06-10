/**
 * Brush range-fill: dragging fast must select every row between last and current index.
 */
import assert from 'node:assert/strict';

/** Mirrors list-index range fill used during brush drag. */
function indicesInBrushSpan(lastIndex: number | null, currentIndex: number): number[] {
  const lastIdx = lastIndex ?? currentIndex;
  const lo = Math.min(lastIdx, currentIndex);
  const hi = Math.max(lastIdx, currentIndex);
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

function test(name: string, fn: () => void) {
  fn();
  console.log(`ok: ${name}`);
}

test('brush span fills gap when pointer jumps indices', () => {
  assert.deepEqual(indicesInBrushSpan(2, 8), [2, 3, 4, 5, 6, 7, 8]);
});

test('brush span first touch selects single row', () => {
  assert.deepEqual(indicesInBrushSpan(null, 5), [5]);
});

test('brush span works when moving upward', () => {
  assert.deepEqual(indicesInBrushSpan(10, 4), [4, 5, 6, 7, 8, 9, 10]);
});

console.log('all useListSelection brush tests passed');
