/**
 * Side panel: synonym editor for the selected dictionary category (recognition grammar).
 */
import { forwardRef } from 'react';
import { Braces } from 'lucide-react';
import type { GrammarEntry } from '../../hooks/useAnalysis';
import type { TokenCategory } from '../../lib/dictionaryTree';
import type { TokenEntry } from '../../lib/tokenDictionary';
import { VincoloPipelinePanel } from '../../features/agent/VincoloPipelinePanel';
import { InlineGrammarEditor, type GrammarEditorHandle } from './InlineGrammarEditor';

export interface CategoryGrammarSidePanelProps {
  category: TokenCategory | null;
  tokens: TokenEntry[];
  grammar: GrammarEntry | null;
  onSave: (grammar: GrammarEntry) => void;
  onClose: () => void;
}

export const CategoryGrammarSidePanel = forwardRef<GrammarEditorHandle, CategoryGrammarSidePanelProps>(
function CategoryGrammarSidePanel({
  category,
  tokens,
  grammar,
  onSave,
  onClose,
}, ref) {
  const editorKey = category?.id ?? 'none';
  const tokenCount = category?.tokenTexts?.length ?? 0;
  const isVincolo = category?.type === 'vincolo';
  const canEdit = Boolean(category && !isVincolo && tokenCount > 0);

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#080e0a]">
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[#1a3a2a] bg-[#0a1510]">
        <Braces className="w-3.5 h-3.5 text-sky-400/70" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-sky-400/60">
          Sinonimi categoria
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {!category ? (
          <p className="font-mono text-[10px] text-emerald-400/35 leading-relaxed px-1">
            Seleziona una categoria nel pannello a sinistra per modificarne i sinonimi di riconoscimento.
          </p>
        ) : isVincolo ? (
          <VincoloPipelinePanel category={category} />
        ) : tokenCount === 0 ? (
          <p className="font-mono text-[10px] text-emerald-400/35 leading-relaxed px-1">
            Aggiungi almeno un token a &quot;{category.name}&quot; prima di definire i sinonimi.
          </p>
        ) : canEdit && category ? (
          <InlineGrammarEditor
            key={editorKey}
            ref={ref}
            slot={category.name}
            slots={[category.name]}
            itemPaths={[]}
            grammar={grammar}
            mode="category"
            categoryContext={{ category, tokens }}
            onSave={onSave}
            onCancel={onClose}
          />
        ) : null}
      </div>
    </div>
  );
});
