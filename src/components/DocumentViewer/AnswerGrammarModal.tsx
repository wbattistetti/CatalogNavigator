/**
 * Modal editor for contextual answer grammars (one independent column per routing actor).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import type { GrammarEntry } from '../../hooks/useAnalysis';
import {
  buildGrammarEditorState,
  compileGrammarFromEditorState,
  normalizeSortedSynonymList,
  sortSynonymsAlphabetically,
  type GrammarEditorPanel,
} from '../../lib/grammarSynonyms';

function synonymKey(text: string): string {
  return text.trim().toLowerCase();
}

function findSynonymIndex(synonyms: string[], text: string): number {
  const key = synonymKey(text);
  return synonyms.findIndex((s) => synonymKey(s) === key);
}

function SynonymCell({
  value,
  highlighted,
  onChange,
  onDelete,
  scrollRef,
}: {
  value: string;
  highlighted?: boolean;
  onChange: (next: string) => void;
  onDelete: () => void;
  scrollRef?: (el: HTMLDivElement | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  if (editing) {
    return (
      <div ref={scrollRef} className="flex items-center gap-1 min-h-[1.75rem]">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const trimmed = draft.trim();
              if (trimmed) onChange(trimmed);
              setEditing(false);
            }
            if (e.key === 'Escape') {
              setDraft(value);
              setEditing(false);
            }
          }}
          className="flex-1 min-w-0 bg-[#0a1510] border border-sky-400/40 rounded px-1.5 py-0.5 font-sans text-xs text-emerald-200 focus:outline-none focus:border-sky-400/70"
        />
        <button
          type="button"
          onClick={() => {
            const trimmed = draft.trim();
            if (trimmed) onChange(trimmed);
            setEditing(false);
          }}
          className="p-0.5 text-sky-400/70 hover:text-sky-300"
          title="Conferma"
        >
          <Check className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className={`group flex items-center justify-between gap-1 min-h-[1.75rem] rounded px-1 -mx-1 transition-colors ${
        highlighted ? 'bg-sky-400/20 ring-1 ring-sky-400/40' : ''
      }`}
    >
      <span className="font-sans text-xs text-emerald-200/90 whitespace-nowrap">{value}</span>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="p-0.5 text-sky-400/50 hover:text-sky-300"
          title="Modifica sinonimo"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-0.5 text-red-400/40 hover:text-red-400"
          title="Elimina sinonimo"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

export function AnswerGrammarModal({
  slot,
  slots,
  itemPaths,
  grammar,
  question,
  categories,
  onSave,
  onClose,
}: {
  slot: string;
  slots: string[];
  itemPaths: string[];
  grammar: GrammarEntry | null;
  question: string | null;
  categories?: import('../../lib/dictionaryTree').TokenCategory[];
  onSave: (grammar: GrammarEntry) => void;
  onClose: () => void;
}) {
  const initial = useMemo(
    () => buildGrammarEditorState(slot, slots, itemPaths, grammar, 'answer', categories),
    [slot, slots, itemPaths, grammar, categories],
  );

  const grammarSync = grammar?.regex ?? '';
  const [panels, setPanels] = useState<GrammarEditorPanel[]>(initial.panels);
  const [error, setError] = useState<string | null>(null);
  const [addDrafts, setAddDrafts] = useState<Record<number, string>>({});
  const [highlight, setHighlight] = useState<{ panelIdx: number; key: string } | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const next = buildGrammarEditorState(slot, slots, itemPaths, grammar, 'answer', categories);
    setPanels(next.panels);
    setError(null);
    setAddDrafts({});
    setHighlight(null);
  }, [slot, grammarSync, slots, itemPaths, grammar, categories]);

  useLayoutEffect(() => {
    if (!highlight) return;
    highlightRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlight]);

  useEffect(() => {
    if (!highlight) return;
    const t = setTimeout(() => setHighlight(null), 2200);
    return () => clearTimeout(t);
  }, [highlight]);

  const sortedPanels = useMemo(
    () => panels.map((p) => ({
      ...p,
      synonyms: sortSynonymsAlphabetically(p.synonyms),
    })),
    [panels],
  );

  const updateSynonym = useCallback((panelIdx: number, synIdx: number, value: string) => {
    setPanels((prev) => prev.map((p, i) => {
      if (i !== panelIdx) return p;
      const next = [...p.synonyms];
      next[synIdx] = value;
      return { ...p, synonyms: normalizeSortedSynonymList(next) };
    }));
    setError(null);
  }, []);

  const deleteSynonym = useCallback((panelIdx: number, synIdx: number) => {
    setPanels((prev) => prev.map((p, i) => {
      if (i !== panelIdx) return p;
      const next = p.synonyms.filter((_, j) => j !== synIdx);
      return { ...p, synonyms: next };
    }));
    setError(null);
  }, []);

  const commitAddSynonym = useCallback((panelIdx: number, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const panel = panels[panelIdx];
    if (!panel) return;
    const existingIdx = findSynonymIndex(panel.synonyms, trimmed);
    if (existingIdx >= 0) {
      setHighlight({ panelIdx, key: synonymKey(panel.synonyms[existingIdx]!) });
    } else {
      setPanels((prev) => prev.map((p, i) => {
        if (i !== panelIdx) return p;
        return { ...p, synonyms: normalizeSortedSynonymList([...p.synonyms, trimmed]) };
      }));
      setHighlight({ panelIdx, key: synonymKey(trimmed) });
    }
    setAddDrafts((d) => ({ ...d, [panelIdx]: '' }));
    setError(null);
  }, [panels]);

  const handleSave = () => {
    try {
      const compiled = compileGrammarFromEditorState(slot, 'answer', panels, []);
      onSave(compiled);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative w-max max-w-[92vw] max-h-[90vh] flex flex-col rounded-lg border border-sky-400/30 bg-[#080e0a] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="answer-grammar-modal-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded text-emerald-400/40 hover:text-emerald-300 hover:bg-emerald-400/10 transition-colors z-10"
          title="Chiudi"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-[#1a3a2a] pr-12">
          <p className="font-mono text-[9px] uppercase tracking-widest text-sky-400/50 mb-2">
            Sinonimi risposta · contestuale
          </p>
          {question?.trim() && (
            <p
              id="answer-grammar-modal-title"
              className="font-sans text-sm text-amber-300/95 leading-relaxed max-w-xl"
            >
              {question.trim()}
            </p>
          )}
          <p className="mt-1 font-sans text-[10px] text-emerald-400/45">
            Parole che, rispondendo alla domanda, indirizzano verso ciascun nodo.
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-auto px-5 py-4">
          <div
            className="inline-grid gap-3"
            style={{ gridAutoFlow: 'column', gridAutoColumns: 'max-content' }}
          >
            {sortedPanels.map((panel, panelIdx) => (
              <div
                key={panel.targetPath}
                className="flex flex-col w-max max-w-[220px] rounded border border-[#1a3a2a] bg-[#0a1510] overflow-hidden"
              >
                <div className="px-3 py-2 border-b border-[#1a3a2a] bg-[#080e0a]">
                  <p className="font-mono text-[11px] font-semibold text-emerald-300/90 whitespace-nowrap">
                    {panel.label}
                  </p>
                </div>
                <div className="px-2 py-2 border-b border-[#1a3a2a]">
                  <input
                    value={addDrafts[panelIdx] ?? ''}
                    onChange={(e) => setAddDrafts((d) => ({ ...d, [panelIdx]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitAddSynonym(panelIdx, addDrafts[panelIdx] ?? '');
                      }
                    }}
                    placeholder="inserisci nuovo sinonimo"
                    className="w-full min-w-[10rem] bg-[#080e0a] border border-sky-400/25 rounded px-1.5 py-1 font-sans text-xs text-emerald-200 placeholder:text-emerald-400/30 focus:outline-none focus:border-sky-400/50"
                  />
                </div>
                <div className="flex flex-col divide-y divide-[#1a3a2a]/50 px-2 py-1">
                  {panel.synonyms.length === 0 ? (
                    <p className="py-2 font-mono text-[10px] text-emerald-400/25 italic">nessun sinonimo</p>
                  ) : (
                    panel.synonyms.map((syn, synIdx) => {
                      const isHighlighted = highlight?.panelIdx === panelIdx
                        && highlight.key === synonymKey(syn);
                      return (
                        <div key={`${syn}-${synIdx}`} className="py-1">
                          <SynonymCell
                            value={syn}
                            highlighted={isHighlighted}
                            scrollRef={isHighlighted ? (el) => { highlightRef.current = el; } : undefined}
                            onChange={(v) => updateSynonym(panelIdx, synIdx, v)}
                            onDelete={() => deleteSynonym(panelIdx, synIdx)}
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <p className="mx-5 mb-2 font-mono text-[10px] text-red-400/90 px-2 py-1 rounded border border-red-400/30 bg-red-400/5">
            {error}
          </p>
        )}

        <div className="flex-shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-[#1a3a2a] bg-[#0a1510]">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 font-mono text-[10px] text-emerald-400/50 border border-[#1a3a2a] rounded hover:text-emerald-400/80 transition-colors"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] font-semibold text-emerald-900 bg-sky-400 rounded hover:bg-sky-300 transition-colors"
          >
            <Check className="w-3.5 h-3.5" /> Salva
          </button>
        </div>
      </div>
    </div>
  );
}
