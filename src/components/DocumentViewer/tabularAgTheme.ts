/**
 * Dark emerald AG Grid theme for tabular document preview.
 */
import { colorSchemeDark, themeQuartz } from 'ag-grid-community';

export const TABULAR_AG_THEME = themeQuartz.withPart(colorSchemeDark).withParams({
  backgroundColor: '#0d0d0d',
  foregroundColor: '#a7f3d0',
  headerBackgroundColor: '#0a1510',
  headerTextColor: '#6ee7b7',
  borderColor: '#1a3a2a',
  rowHoverColor: 'rgba(52, 211, 153, 0.08)',
  selectedRowBackgroundColor: 'rgba(52, 211, 153, 0.12)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 12,
  headerFontSize: 11,
  cellHorizontalPadding: 8,
  rowHeight: 36,
  headerHeight: 36,
});
