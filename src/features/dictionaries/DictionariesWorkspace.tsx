/**
 * Dizionari tab: library actions once at workspace level + multi-editor dock below.
 */
import { memo } from 'react';
import { Loader2 } from 'lucide-react';
import { useDocumentEditorController } from '../document-editor/DocumentEditorContext';
import { DictionaryLibraryActions } from './DictionaryLibraryActions';
import { DictionaryEditorsDock } from './DictionaryEditorsDock';

export const DictionariesWorkspace = memo(function DictionariesWorkspace() {
  const { dicts, content } = useDocumentEditorController();

  if (dicts.loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-emerald-300/85 font-mono text-xs">
        <Loader2 className="w-4 h-4 animate-spin" />
        Caricamento dizionari…
      </div>
    );
  }

  if (!content.tabular) {
    return (
      <div className="flex items-center justify-center h-full text-emerald-300/85 font-mono text-xs px-8 text-center">
        {content.loading
          ? 'Caricamento tabella…'
          : 'Impossibile leggere la tabella da questo file.'}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#070d09]">
      <div className="flex-shrink-0 flex flex-wrap items-center gap-x-1 gap-y-1 px-2 py-1 border-b border-[#1a3a2a] bg-[#080e0a] min-h-[32px]">
        <DictionaryLibraryActions />
        {dicts.hydratingLinked && (
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-sky-300/70 ml-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Caricamento dizionario collegato…
          </span>
        )}
      </div>
      <DictionaryEditorsDock />
    </div>
  );
});
