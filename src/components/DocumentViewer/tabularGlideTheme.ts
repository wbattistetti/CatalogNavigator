/**
 * Dark emerald theme for Glide Data Grid in tabular document preview.
 */
import type { Theme } from '@glideapps/glide-data-grid';
import type { ColumnRole } from '../../lib/supabase';

export const TABULAR_GLIDE_THEME: Partial<Theme> = {
  accentColor: '#34d399',
  accentFg: '#0a1510',
  accentLight: 'rgba(52, 211, 153, 0.15)',
  textDark: '#6ee7b7',
  textMedium: '#34d399',
  textLight: 'rgba(167, 243, 208, 0.55)',
  textHeader: '#6ee7b7',
  textHeaderSelected: '#ecfdf5',
  bgCell: '#0d0d0d',
  bgCellMedium: '#0f0f0f',
  bgHeader: '#0a1510',
  bgHeaderHasFocus: '#134e32',
  bgHeaderHovered: '#0f3524',
  borderColor: '#1a3a2a',
  horizontalBorderColor: '#111111',
  headerBottomBorderColor: '#1a3a2a',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  baseFontStyle: '12px',
  headerFontStyle: '600 12px',
  markerFontStyle: '11px',
  lineHeight: 18,
  cellHorizontalPadding: 8,
  cellVerticalPadding: 2,
};

/** Canvas fill colors aligned with column role semantics. */
export const TABULAR_ROLE_CELL_BG: Record<ColumnRole, string> = {
  selector: '#1a1008',
  data: '#081018',
  description: '#151008',
  ignore: '#121212',
  ontology: '#151008',
};

export const TABULAR_ROLE_HEADER_BG: Record<ColumnRole, string> = {
  selector: '#2a1808',
  data: '#0a1828',
  description: '#281808',
  ignore: '#1a1a1a',
  ontology: '#281808',
};

/** Stable per-role cell themes — reused in getCellContent to avoid GC churn on scroll. */
export const TABULAR_ROLE_CELL_THEME: Record<ColumnRole, Partial<Theme>> = {
  selector: { bgCell: TABULAR_ROLE_CELL_BG.selector },
  data: { bgCell: TABULAR_ROLE_CELL_BG.data },
  description: { bgCell: TABULAR_ROLE_CELL_BG.description },
  ignore: { bgCell: TABULAR_ROLE_CELL_BG.ignore },
  ontology: { bgCell: TABULAR_ROLE_CELL_BG.ontology },
};

/** Stable per-role header themes for column definitions. */
export const TABULAR_ROLE_HEADER_THEME: Record<ColumnRole, Partial<Theme>> = {
  selector: { bgHeader: TABULAR_ROLE_HEADER_BG.selector, textHeader: '#d1fae5' },
  data: { bgHeader: TABULAR_ROLE_HEADER_BG.data, textHeader: '#d1fae5' },
  description: { bgHeader: TABULAR_ROLE_HEADER_BG.description, textHeader: '#d1fae5' },
  ignore: { bgHeader: TABULAR_ROLE_HEADER_BG.ignore, textHeader: '#d1fae5' },
  ontology: { bgHeader: TABULAR_ROLE_HEADER_BG.ontology, textHeader: '#d1fae5' },
};
