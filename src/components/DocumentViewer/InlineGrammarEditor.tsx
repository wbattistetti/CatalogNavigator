/**
 * Inline synonym editor for node grammars — compiles to regex without exposing JSON.
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { GrammarEditMode, GrammarEntry } from '../../hooks/useAnalysis';
import { buildCategoryGrammarEditorState } from '../../lib/categoryGrammar';
import type { TokenCategory } from '../../lib/dictionaryTree';
import type { TokenEntry } from '../../lib/tokenDictionary';
import {
  buildGrammarEditorState,
  compileGrammarFromEditorState,
  formatSynonymText,
  parseSynonymText,
  type GrammarEditorPanel,
} from '../../lib/grammarSynonyms';
import { DICT_FORM_TEXTAREA } from '../../features/dictionaries/dictionaryFormStyles';

const ANSWER_PANEL_GUIDE =
  'Parole che, rispondendo alla domanda sopra, specificano questo nodo.';
const CATEGORY_PANEL_GUIDE =
  'Parole riconosciute per questo valore canonico nella categoria.';
const NODE_GUIDE =
  'Sinonimi del token (condivisi da tutti i nodi con questo segmento).';

function SynonymTextarea({
  value,
  onChange,
  placeholder,
  syncKey,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  syncKey: string;
}) {
  const [draft, setDraft] = useState(() => formatSynonymText(value));

  // Reset draft only when switching token/grammar — not on every parent re-render.
  useEffect(() => {
    setDraft(formatSynonymText(value));
  }, [syncKey]);

  const lineCount = draft.split(/\r?\n/).length;

  return (
    <textarea
      value={draft}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        onChange(parseSynonymText(next));
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      placeholder={placeholder ?? 'Un sinonimo per riga…'}
      rows={Math.min(8, Math.max(2, lineCount + 1))}
      className={`${DICT_FORM_TEXTAREA} border-sky-400/30 text-emerald-200 placeholder-emerald-400/25 resize-y focus:border-sky-400/60 whitespace-pre-wrap`}
    />
  );
}

export interface GrammarEditorHandle {
  /** Persists the current draft (same as Salva). Returns false on compile error. */
  flushSave: () => boolean;
}

export const InlineGrammarEditor = forwardRef(function InlineGrammarEditor({
  slot,
  slots,
  itemPaths,
  grammar,
  mode,
  categoryContext,
  onSave,
  onCancel,
}: {
  slot: string;
  slots: string[];
  itemPaths: string[];
  grammar: GrammarEntry | null;
  mode: GrammarEditMode;
  categoryContext?: { category: TokenCategory; tokens: TokenEntry[] };
  onSave: (grammar: GrammarEntry) => void;
  onCancel: () => void;
}, ref) {
  const resolveEditorState = () => {
    if (mode === 'category' && categoryContext) {
      return buildCategoryGrammarEditorState(
        categoryContext.category,
        categoryContext.tokens,
        grammar,
      );
    }
    return buildGrammarEditorState(slot, slots, itemPaths, grammar, mode);
  };

  const initial = useMemo(
    () => resolveEditorState(),
    [slot, slots, itemPaths, grammar, mode, categoryContext?.category.id, categoryContext?.tokens],
  );

  const grammarSync = grammar?.regex ?? '';

  const [interactive] = useState(initial.interactive);
  const [panels, setPanels] = useState<GrammarEditorPanel[]>(initial.panels);
  const [simpleSynonyms, setSimpleSynonyms] = useState<string[]>(initial.simpleSynonyms);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = resolveEditorState();
    setPanels(next.panels);
    setSimpleSynonyms(next.simpleSynonyms);
    setError(null);
  }, [slot, mode, grammarSync, slots, itemPaths, grammar, categoryContext?.category.id, categoryContext?.tokens]);

  const panelGuide = mode === 'category' ? CATEGORY_PANEL_GUIDE : ANSWER_PANEL_GUIDE;

  const updatePanelSynonyms = (index: number, synonyms: string[]) => {
    setPanels((prev) => prev.map((p, i) => (i === index ? { ...p, synonyms } : p)));
    setError(null);
  };

  const persistDraft = (): boolean => {
    try {
      const compiled = compileGrammarFromEditorState(slot, mode, panels, simpleSynonyms);
      onSave(compiled);
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  useImperativeHandle(ref, () => ({ flushSave: persistDraft }), [slot, mode, panels, simpleSynonyms, onSave]);

  const handleSave = () => {
    persistDraft();
  };

  const title = mode === 'node'
    ? 'Sinonimi token'
    : mode === 'category'
      ? 'Valori categoria'
      : 'Sinonimi risposta';

  return (
    <div
      className="mt-2 pt-2 border-t border-sky-400/20 space-y-3"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="font-mono text-[9px] uppercase tracking-widest text-sky-400/50">
        {title}
      </p>

      {interactive ? (
        panels.map((panel, index) => (
          <div key={panel.targetPath} className="space-y-1">
            <p className="font-mono text-[11px] font-semibold text-emerald-300/90">
              {panel.label}
            </p>
            <p className="font-sans text-[10px] text-emerald-400/45 leading-snug">
              {panelGuide}
            </p>
            <SynonymTextarea
              syncKey={`${mode}:${slot}:${panel.targetPath}:${grammarSync}`}
              value={panel.synonyms}
              onChange={(syns) => updatePanelSynonyms(index, syns)}
              placeholder={`Sinonimi per ${panel.label}…`}
            />
          </div>
        ))
      ) : (
        <div className="space-y-1">
          <p className="font-mono text-[11px] font-semibold text-emerald-300/90">
            {slot.split('.').pop() ?? slot}
          </p>
          <p className="font-sans text-[10px] text-emerald-400/45 leading-snug">
            {NODE_GUIDE}
          </p>
          <SynonymTextarea
            syncKey={`${mode}:${slot}:${grammarSync}`}
            value={simpleSynonyms}
            onChange={(syns) => {
              setSimpleSynonyms(syns);
              setError(null);
            }}
          />
        </div>
      )}

      {error && (
        <p className="font-mono text-[10px] text-red-400/90 px-2 py-1 rounded border border-red-400/30 bg-red-400/5">
          {error}
        </p>
      )}

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-1 px-2 py-1 bg-sky-400/20 border border-sky-400/40 rounded text-sky-300 hover:bg-sky-400/30 transition-colors font-mono text-[10px]"
        >
          <Check className="w-3 h-3" /> Salva
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 text-emerald-400/30 hover:text-emerald-400/60 transition-colors"
          title="Chiudi"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
});
