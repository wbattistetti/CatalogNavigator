/**
 * Source/target category types for pharma dictionary refactor.
 */
import type { PharmaCategoryName } from '../pharmaDictionaryCategories';

/** Legacy category removed from target taxonomy but present in extract checkpoint. */
export const LEGACY_SOURCE_CATEGORIES = ['Forma di confezionamento'] as const;

export type SourceCategoryName = PharmaCategoryName | (typeof LEGACY_SOURCE_CATEGORIES)[number];
