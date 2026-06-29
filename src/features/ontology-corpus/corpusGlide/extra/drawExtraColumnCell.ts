/**
 * Canvas draw for corpus extra column — chips, selection highlight, editor blank.
 */
import type { RefObject } from 'react';
import type { CustomCell, CustomRenderer } from '@glideapps/glide-data-grid';
import {
  drawGlideChipPills,
  glideChipRenderer,
  isGlideChipCell,
  type GlideChipCellData,
} from '../../../../lib/glideChipRenderer';

export function drawExtraColumnCell(
  args: Parameters<CustomRenderer<CustomCell<GlideChipCellData>>['draw']>[0],
  cell: CustomCell<GlideChipCellData>,
  editorDisplayRow: number | null,
  selectedDisplayRows: ReadonlySet<number>,
): void {
  if (!isGlideChipCell(cell)) return;
  const { ctx, rect, theme, row } = args;

  if (editorDisplayRow === row) {
    ctx.fillStyle = theme.bgCell;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    return;
  }

  drawGlideChipPills(args, cell.data);

  if (selectedDisplayRows.has(row)) {
    ctx.save();
    ctx.fillStyle = theme.accentColor;
    ctx.globalAlpha = 0.12;
    ctx.fillRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.accentColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
    ctx.restore();
  }
}

export function createExtraColumnRenderer(
  editorDisplayRowRef: RefObject<number | null>,
  selectionRef: RefObject<ReadonlySet<number>>,
): CustomRenderer<CustomCell> {
  return {
    ...glideChipRenderer,
    draw: (args, cell) => {
      if (!isGlideChipCell(cell as CustomCell)) return;
      drawExtraColumnCell(
        args,
        cell as CustomCell<GlideChipCellData>,
        editorDisplayRowRef.current,
        selectionRef.current,
      );
    },
  };
}
