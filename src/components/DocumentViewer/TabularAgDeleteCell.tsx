/**
 * Delete-row action cell for AG Grid tabular preview.
 */
import { memo } from 'react';
import { Trash2 } from 'lucide-react';
import type { CustomCellRendererProps } from 'ag-grid-react';
import type { TabularAgRow, TabularAgGridContext } from './tabularAgGridTypes';

export const TabularAgDeleteCell = memo(function TabularAgDeleteCell(
  props: CustomCellRendererProps<TabularAgRow, unknown, TabularAgGridContext>,
) {
  const sourceIndex = props.data?.__sourceIndex;
  if (sourceIndex === undefined) return null;

  return (
    <button
      type="button"
      className="flex h-full w-full items-center justify-center text-emerald-400/25 hover:text-red-400/80 transition-colors"
      title={`Elimina riga ${sourceIndex + 1}`}
      onClick={() => props.context.onDeleteRow(sourceIndex)}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
});
