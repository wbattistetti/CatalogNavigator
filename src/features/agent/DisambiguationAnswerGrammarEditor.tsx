/**
 * Inline editor for disambiguation answer grammar (per-option synonyms).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Play, Trash2, X } from 'lucide-react';
import type { GrammarEntry } from '../../lib/analysisTypes';
import type { DisambiguationQuestionStyle } from '../../lib/disambiguationPlanTypes';
import {
  buildDisambiguationAnswerGrammarPanels,
  compileDisambiguationAnswerGrammarFromPanels,
  matchDisambiguationAnswerDraft,
} from '../../lib/disambiguationAnswerGrammarEditor';
import { DICT_INPUT_FIELD } from '../../features/dictionaries/dictionaryFormStyles';
import {
  normalizeSortedSynonymList,
  sortSynonymsAlphabetically,
} from '../../lib/grammarSynonyms';
import { formatTechnicalOptions } from '../../lib/disambiguationPlanMessages';
import { sameOptionTokenSets } from '../../lib/catalogDisambiguationOptions';
import { isNoneOption } from '../../lib/turnAnswerGrammar';

const CHAT_TEXT = 'text-sm leading-relaxed';

function synonymKey(text: string): string {
  return text.trim().toLowerCase();
}

function findSynonymIndex(synonyms: string[], text: string): number {
  const key = synonymKey(text);
  return synonyms.findIndex((s) => synonymKey(s) === key);
}

interface DisambiguationAnswerGrammarEditorProps {
  options: string[];
  style: DisambiguationQuestionStyle;
  grammar: GrammarEntry | null | undefined;
  runtimeOptions?: string[];
  autoFocus?: boolean;
  onSave: (grammar: GrammarEntry) => void;
}

export function DisambiguationAnswerGrammarEditor({
  options,
  style,
  grammar,
  runtimeOptions,
  autoFocus = false,
  onSave,
}: DisambiguationAnswerGrammarEditorProps) {
  const grammarRegex = grammar?.regex ?? '';
  const optionsKey = options.join('\0');
  const rowSyncKey = `${grammarRegex}\0${optionsKey}\0${style}`;

  const initialPanels = useMemo(
    () => buildDisambiguationAnswerGrammarPanels(options, grammar, style),
    [options, grammarRegex, style],
  );
  const [panels, setPanels] = useState(initialPanels);
  const [error, setError] = useState<string | null>(null);
  const [testUtterance, setTestUtterance] = useState('');
  const [testOpen, setTestOpen] = useState(false);
  const lastRowSyncKeyRef = useRef(rowSyncKey);

  useEffect(() => {
    if (lastRowSyncKeyRef.current === rowSyncKey) return;
    lastRowSyncKeyRef.current = rowSyncKey;
    setPanels(initialPanels);
    setError(null);
    setTestUtterance('');
    setTestOpen(false);
  }, [rowSyncKey, initialPanels]);

  const persistPanels = useCallback((nextPanels: typeof panels) => {
    try {
      const compiled = compileDisambiguationAnswerGrammarFromPanels(nextPanels);
      onSave(compiled);
      lastRowSyncKeyRef.current = `${compiled.regex ?? ''}\0${optionsKey}\0${style}`;
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [onSave, optionsKey, style]);

  const updatePanelSynonyms = useCallback((index: number, synonyms: string[]) => {
    let nextPanels: typeof panels = [];
    setPanels((prev) => {
      nextPanels = prev.map((p, i) => (i === index ? { ...p, synonyms } : p));
      return nextPanels;
    });
    persistPanels(nextPanels);
  }, [persistPanels]);

  const testResult = useMemo(
    () => matchDisambiguationAnswerDraft(panels, testUtterance),
    [panels, testUtterance],
  );

  const runtimeTestResult = useMemo(() => {
    if (!runtimeOptions?.length || sameOptionTokenSets(runtimeOptions, options)) return null;
    const runtimePanels = buildDisambiguationAnswerGrammarPanels(runtimeOptions, grammar, style);
    return matchDisambiguationAnswerDraft(runtimePanels, testUtterance);
  }, [runtimeOptions, options, grammar, grammarRegex, style, testUtterance]);

  const optionsDiffer = !!runtimeOptions?.length && !sameOptionTokenSets(runtimeOptions, options);

  if (style === 'ask_age') return null;

  return (
    <div id="disambiguation-answer-grammar" className="flex flex-col h-full min-h-0 gap-3">
      <div
        className="flex-1 min-h-0 grid gap-3 min-w-0 items-stretch"
        style={{ gridTemplateColumns: `repeat(${Math.max(panels.length, 1)}, minmax(0, 1fr))` }}
      >
        {panels.map((panel, index) => (
          <OptionSynonymColumn
            key={panel.targetPath}
            label={panel.label}
            synonyms={panel.synonyms}
            autoFocusAdd={autoFocus && index === 0}
            onChange={(synonyms) => updatePanelSynonyms(index, synonyms)}
          />
        ))}
      </div>

      {error && (
        <p className={`flex-shrink-0 font-mono ${CHAT_TEXT} text-red-300/90 flex items-center gap-1`}>
          <X className="w-3 h-3 flex-shrink-0" />
          {error}
        </p>
      )}

      <div className="flex-shrink-0 rounded border border-amber-400/25 bg-amber-400/5 overflow-hidden">
        <button
          type="button"
          onClick={() => setTestOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2 font-mono text-left hover:bg-amber-400/8 transition-colors"
          aria-expanded={testOpen}
        >
          <ChevronDown
            className={`w-3.5 h-3.5 text-amber-300/80 flex-shrink-0 transition-transform ${testOpen ? '' : '-rotate-90'}`}
          />
          <Play className="w-3.5 h-3.5 text-amber-300/80 flex-shrink-0" />
          <span className={`${CHAT_TEXT} uppercase tracking-wide text-amber-300/80`}>
            Prova risposta
          </span>
        </button>
        {testOpen && (
          <div className="px-3 pb-2 space-y-2 border-t border-amber-400/15">
            <p className={`font-sans ${CHAT_TEXT} text-emerald-300/80 pt-2`}>
              Scrivi come risponderebbe il paziente — stessa grammatica usata dal motore di test.
            </p>
            {optionsDiffer && runtimeOptions && (
              <p className={`font-mono ${CHAT_TEXT} text-amber-300/80 break-words`}>
                Token piano: {formatTechnicalOptions(options)}
                {' · '}
                Token catalogo (runtime VB): {formatTechnicalOptions(runtimeOptions)}
              </p>
            )}
            <input
              type="text"
              value={testUtterance}
              onChange={(e) => setTestUtterance(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder='es. "sì", "ecografia", "no grazie"…'
              className={`${DICT_INPUT_FIELD} bg-[#0a1510] border-amber-400/30 text-emerald-100 placeholder:text-emerald-400/55 focus:border-amber-400/55`}
            />
            {testUtterance.trim() && (
              <div className={`font-mono ${CHAT_TEXT} space-y-1`}>
                <p>
                  {testResult.compileError ? (
                    <span className="text-red-300/90">Grammatica non valida: {testResult.compileError}</span>
                  ) : testResult.selectedOption ? (
                    <span className="text-emerald-200/90">
                      Piano → <span className="text-amber-200 font-semibold">
                        {isNoneOption(testResult.selectedOption) ? 'none (declino)' : testResult.selectedOption}
                      </span>
                    </span>
                  ) : (
                    <span className="text-amber-300/85">Piano: nessun match</span>
                  )}
                </p>
                {runtimeTestResult && (
                  <p>
                    {runtimeTestResult.compileError ? (
                      <span className="text-red-300/90">Runtime: grammatica non valida</span>
                    ) : runtimeTestResult.selectedOption ? (
                      <span className="text-emerald-200/90">
                        Runtime VB → <span className="text-amber-200 font-semibold">
                          {isNoneOption(runtimeTestResult.selectedOption)
                            ? 'none (declino)'
                            : runtimeTestResult.selectedOption}
                        </span>
                      </span>
                    ) : (
                      <span className="text-amber-300/85">Runtime VB: nessun match</span>
                    )}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function OptionSynonymColumn({
  label,
  synonyms,
  autoFocusAdd,
  onChange,
}: {
  label: string;
  synonyms: string[];
  autoFocusAdd?: boolean;
  onChange: (synonyms: string[]) => void;
}) {
  const isNone = label.startsWith('none');
  const [addDraft, setAddDraft] = useState('');
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  const sortedSynonyms = useMemo(
    () => sortSynonymsAlphabetically(synonyms),
    [synonyms],
  );

  useLayoutEffect(() => {
    if (!highlightKey) return;
    highlightRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlightKey, sortedSynonyms]);

  useEffect(() => {
    if (!highlightKey) return;
    const timer = setTimeout(() => setHighlightKey(null), 2200);
    return () => clearTimeout(timer);
  }, [highlightKey]);

  const commitAdd = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const existingIdx = findSynonymIndex(synonyms, trimmed);
    if (existingIdx >= 0) {
      setHighlightKey(synonymKey(synonyms[existingIdx]!));
    } else {
      onChange(normalizeSortedSynonymList([...synonyms, trimmed]));
      setHighlightKey(synonymKey(trimmed));
    }
    setAddDraft('');
  };

  const updateSynonym = (synonym: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    const synIdx = findSynonymIndex(synonyms, synonym);
    if (synIdx < 0) return;

    const next = [...synonyms];
    next[synIdx] = trimmed;
    onChange(normalizeSortedSynonymList(next));

    const duplicateIdx = findSynonymIndex(normalizeSortedSynonymList(next), trimmed);
    if (duplicateIdx >= 0) {
      setHighlightKey(synonymKey(trimmed));
    }
  };

  const deleteSynonym = (synonym: string) => {
    const synIdx = findSynonymIndex(synonyms, synonym);
    if (synIdx < 0) return;
    onChange(normalizeSortedSynonymList(synonyms.filter((_, i) => i !== synIdx)));
  };

  return (
    <div className="flex flex-col h-full min-h-0 rounded border border-sky-400/25 bg-[#0a1510] overflow-hidden">
      <p
        className={`flex-shrink-0 font-mono ${CHAT_TEXT} font-semibold px-2 py-1.5 border-b border-sky-400/20 bg-sky-400/8 break-words ${
          isNone ? 'text-sky-300/80' : 'text-emerald-300/90'
        }`}
      >
        {label}
      </p>

      <div className="flex-shrink-0 px-2 py-2 border-b border-sky-400/15">
        <input
          autoFocus={autoFocusAdd}
          type="text"
          value={addDraft}
          onChange={(e) => setAddDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              commitAdd(addDraft);
            }
          }}
          placeholder="Aggiungi sinonimo…"
          aria-label={`Aggiungi sinonimo per ${label}`}
          className={`${DICT_INPUT_FIELD} text-sm ${
            isNone
              ? 'border-sky-400/25 text-sky-200/80 placeholder:text-sky-400/50'
              : 'border-sky-400/30 text-emerald-200 placeholder:text-emerald-400/55'
          } focus:border-sky-400/55`}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col divide-y divide-sky-400/10 px-1 py-1">
        {sortedSynonyms.length === 0 ? (
          <p className="px-2 py-3 font-mono text-sm text-emerald-300/75 italic">
            Nessun sinonimo
          </p>
        ) : (
          sortedSynonyms.map((synonym) => (
            <SynonymCell
              key={synonymKey(synonym)}
              value={synonym}
              muted={isNone}
              highlighted={highlightKey === synonymKey(synonym)}
              scrollRef={
                highlightKey === synonymKey(synonym)
                  ? (el) => { highlightRef.current = el; }
                  : undefined
              }
              onChange={(next) => updateSynonym(synonym, next)}
              onDelete={() => deleteSynonym(synonym)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SynonymCell({
  value,
  muted,
  highlighted,
  scrollRef,
  onChange,
  onDelete,
}: {
  value: string;
  muted?: boolean;
  highlighted?: boolean;
  scrollRef?: (el: HTMLDivElement | null) => void;
  onChange: (next: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const confirmEdit = () => {
    const trimmed = draft.trim();
    if (trimmed) onChange(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <div
        ref={scrollRef}
        className="flex items-center gap-1 min-h-[1.75rem] px-1 py-1"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') confirmEdit();
            if (e.key === 'Escape') {
              setDraft(value);
              setEditing(false);
            }
          }}
          className="flex-1 min-w-0 bg-[#080e0a] border border-sky-400/40 rounded px-1.5 py-0.5 font-mono text-sm text-emerald-200 focus:outline-none focus:border-sky-400/70"
        />
        <button
          type="button"
          onClick={confirmEdit}
          className="p-0.5 text-sky-400/70 hover:text-sky-300"
          title="Conferma"
        >
          <Check className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(value);
            setEditing(false);
          }}
          className="p-0.5 text-emerald-400/40 hover:text-emerald-300/80"
          title="Annulla"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setEditing(true);
        }
      }}
      className={`group flex items-center justify-between gap-1 min-h-[1.75rem] rounded px-2 py-1 cursor-pointer transition-colors ${
        highlighted
          ? 'bg-sky-400/20 ring-1 ring-sky-400/40'
          : 'hover:bg-sky-400/8'
      }`}
      title="Clic per modificare"
    >
      <span
        className={`font-mono text-sm break-words ${
          muted ? 'text-sky-300/80' : 'text-emerald-200/90'
        }`}
      >
        {value}
      </span>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="p-0.5 text-red-400/30 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity flex-shrink-0"
        title="Elimina sinonimo"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}
