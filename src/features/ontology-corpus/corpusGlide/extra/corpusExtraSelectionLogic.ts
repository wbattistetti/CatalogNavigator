/**
 * Pure selection rules for corpus extra column (display-row indices).
 */

export interface ExtraSelectionModifiers {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export interface ExtraSelectionUpdate {
  selection: Set<number>;
  anchor: number | null;
}

/** Applies spreadsheet-style click modifiers to the extra-column selection. */
export function applyExtraSelectionClick(
  prev: ReadonlySet<number>,
  displayRow: number,
  anchor: number | null,
  modifiers: ExtraSelectionModifiers,
): ExtraSelectionUpdate {
  const next = new Set(prev);

  if (modifiers.ctrlKey || modifiers.metaKey) {
    if (next.has(displayRow)) next.delete(displayRow);
    else next.add(displayRow);
    return { selection: next, anchor: displayRow };
  }

  if (modifiers.shiftKey && anchor != null) {
    next.clear();
    const lo = Math.min(anchor, displayRow);
    const hi = Math.max(anchor, displayRow);
    for (let r = lo; r <= hi; r += 1) next.add(r);
    return { selection: next, anchor };
  }

  next.clear();
  next.add(displayRow);
  return { selection: next, anchor: displayRow };
}
