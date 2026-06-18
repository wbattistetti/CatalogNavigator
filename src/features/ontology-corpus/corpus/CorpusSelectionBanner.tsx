/**
 * Banner shown when dictionary chips are selected in the corpus view.
 */
import { useDictionarySelectionCount } from '../../../features/document-editor/dictionarySelectionStore';

export function CorpusSelectionBanner() {
  const count = useDictionarySelectionCount();
  if (count === 0) return null;
  return (
    <div className="px-3 py-1 border-b border-[#1a3a2a]/60 bg-[#0a1510] font-mono text-[9px] text-emerald-300/80">
      {count} chip sel. · Ctrl+click multiselezione · trascina su una categoria in Dizionari
    </div>
  );
}
