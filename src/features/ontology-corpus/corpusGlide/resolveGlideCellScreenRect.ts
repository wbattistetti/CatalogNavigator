/**
 * Resolves screen-space bounds for a Glide grid cell (for portaled hit layers).
 */
import type { RefObject } from 'react';
import type { DataEditorRef, Item, Rectangle } from '@glideapps/glide-data-grid';

export interface GlideCellScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function resolveGlideCellScreenRect(
  gridRef: RefObject<DataEditorRef | null>,
  cell: Item,
  eventBounds: Rectangle,
  container: HTMLElement | null,
): GlideCellScreenRect {
  const fromEditor = gridRef.current?.getBounds(cell[0], cell[1]);
  if (fromEditor) {
    return {
      x: fromEditor.x,
      y: fromEditor.y,
      width: fromEditor.width,
      height: fromEditor.height,
    };
  }

  const canvas = container?.querySelector('canvas');
  const base = canvas?.getBoundingClientRect() ?? container?.getBoundingClientRect();
  if (!base) {
    return {
      x: eventBounds.x,
      y: eventBounds.y,
      width: eventBounds.width,
      height: eventBounds.height,
    };
  }

  return {
    x: base.left + eventBounds.x,
    y: base.top + eventBounds.y,
    width: eventBounds.width,
    height: eventBounds.height,
  };
}
