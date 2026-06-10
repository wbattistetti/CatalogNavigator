/**
 * Side panel: synonym editor for the selected dictionary token (shared grammar).
 */
import { forwardRef, useMemo } from 'react';
import { Braces } from 'lucide-react';
import type { GrammarEntry } from '../../hooks/useAnalysis';
import { InlineGrammarEditor, type GrammarEditorHandle } from './InlineGrammarEditor';

const EMPTY_ITEM_PATHS: string[] = [];

export interface TokenGrammarSidePanelProps {
  tokenText: string | null;
  grammar: GrammarEntry | null;
  onSave: (grammar: GrammarEntry) => void;
  onClose: () => void;
}

export const TokenGrammarSidePanel = forwardRef<GrammarEditorHandle, TokenGrammarSidePanelProps>(
function TokenGrammarSidePanel({
  tokenText,
  grammar,
  onSave,
  onClose,
}, ref) {
  const slots = useMemo(() => (tokenText ? [tokenText] : []), [tokenText]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#080e0a]">
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[#1a3a2a] bg-[#0a1510]">
        <Braces className="w-3.5 h-3.5 text-sky-400/70" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-sky-400/60">
          Sinonimi token
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {!tokenText ? (
          <p className="font-mono text-[10px] text-emerald-400/35 leading-relaxed px-1">
            Seleziona un token nel dizionario per modificarne i sinonimi di riconoscimento.
          </p>
        ) : (
          <InlineGrammarEditor
            key={tokenText}
            ref={ref}
            slot={tokenText}
            slots={slots}
            itemPaths={EMPTY_ITEM_PATHS}
            grammar={grammar}
            mode="node"
            onSave={onSave}
            onCancel={onClose}
          />
        )}
      </div>
    </div>
  );
});
