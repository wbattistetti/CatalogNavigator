/**
 * Editor for disambiguation answer grammar: master/detail synonyms + test phrase grid.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Pencil, Play, Trash2, X } from 'lucide-react';
import type { GrammarEntry } from '../../lib/analysisTypes';
import type { DisambiguationQuestionStyle } from '../../lib/disambiguationPlanTypes';
import type { DisambiguationTestPhrase } from '../../lib/disambiguationPlanTypes';
import {
  buildDisambiguationAnswerGrammarPanels,
  compileDisambiguationAnswerGrammarFromPanels,
  evaluateDisambiguationTestPhrase,
  type DisambiguationTestPhraseEvaluation,
} from '../../lib/disambiguationAnswerGrammarEditor';
import { DICT_INPUT_FIELD } from '../../features/dictionaries/dictionaryFormStyles';
import {
  normalizeSortedSynonymList,
  sortSynonymsAlphabetically,
} from '../../lib/grammarSynonyms';
import { formatTechnicalOptions } from '../../lib/disambiguationPlanMessages';
import { sameOptionTokenSets } from '../../lib/catalogDisambiguationOptions';
import { isNoneOption } from '../../lib/turnAnswerGrammar';
import {
  addTestPhrase,
  normalizeTestPhrases,
  testPhraseKey,
} from '../../lib/disambiguationTestPhrases';

const CHAT_TEXT = 'text-sm leading-relaxed';

const VALUES_PANEL_RATIO_KEY = 'disambiguation-grammar-values-ratio';
const VALUES_PANEL_DEFAULT_RATIO = 40;
const VALUES_PANEL_MIN_RATIO = 18;
const VALUES_PANEL_MAX_RATIO = 72;

function readValuesPanelRatio(): number {
  try {
    const raw = localStorage.getItem(VALUES_PANEL_RATIO_KEY);
    if (!raw) return VALUES_PANEL_DEFAULT_RATIO;
    const n = Number(raw);
    if (!Number.isFinite(n)) return VALUES_PANEL_DEFAULT_RATIO;
    return Math.min(VALUES_PANEL_MAX_RATIO, Math.max(VALUES_PANEL_MIN_RATIO, n));
  } catch {
    return VALUES_PANEL_DEFAULT_RATIO;
  }
}

type TestFilter = 'selected' | 'all';

export type DisambiguationGrammarEditorView = 'grammatiche' | 'test';

interface TestRowResult extends DisambiguationTestPhraseEvaluation {}

function synonymKey(text: string): string {
  return text.trim().toLowerCase();
}

function findSynonymIndex(synonyms: string[], text: string): number {
  const key = synonymKey(text);
  return synonyms.findIndex((s) => synonymKey(s) === key);
}

function formatOptionLabel(option: string): string {
  return isNoneOption(option) ? 'none (declino)' : option;
}

function evaluatePhrase(
  panels: ReturnType<typeof buildDisambiguationAnswerGrammarPanels>,
  phrase: string,
  expected: string,
): TestRowResult {
  return evaluateDisambiguationTestPhrase(panels, phrase, expected);
}

function testRowResultKey(phrase: string, expected?: string): string {
  return expected ? `${testPhraseKey(phrase)}\0${expected}` : testPhraseKey(phrase);
}

interface DisambiguationAnswerGrammarEditorProps {
  viewMode: DisambiguationGrammarEditorView;
  options: string[];
  style: DisambiguationQuestionStyle;
  grammar: GrammarEntry | null | undefined;
  testPhrases?: DisambiguationTestPhrase[];
  runtimeOptions?: string[];
  autoFocus?: boolean;
  focusExpectedOption?: string | null;
  onNavigateToGrammar?: (expected: string) => void;
  onSave: (grammar: GrammarEntry) => void;
  onSaveTestPhrases: (phrases: DisambiguationTestPhrase[]) => void;
}

export function DisambiguationAnswerGrammarEditor({
  viewMode,
  options,
  style,
  grammar,
  testPhrases: testPhrasesProp,
  runtimeOptions,
  autoFocus = false,
  focusExpectedOption = null,
  onNavigateToGrammar,
  onSave,
  onSaveTestPhrases,
}: DisambiguationAnswerGrammarEditorProps) {
  const grammarRegex = grammar?.regex ?? '';
  const optionsKey = options.join('\0');
  const testPhrasesKey = (testPhrasesProp ?? []).map((r) => `${r.phrase}\0${r.expected}`).join('\n');
  const rowSyncKey = `${grammarRegex}\0${optionsKey}\0${style}\0${testPhrasesKey}`;

  const initialPanels = useMemo(
    () => buildDisambiguationAnswerGrammarPanels(options, grammar, style),
    [options, grammarRegex, style],
  );
  const initialTestPhrases = useMemo(
    () => normalizeTestPhrases(testPhrasesProp),
    [testPhrasesProp],
  );

  const [panels, setPanels] = useState(initialPanels);
  const [selectedPanelIndex, setSelectedPanelIndex] = useState(0);
  const [testPhrases, setTestPhrases] = useState(initialTestPhrases);
  const [error, setError] = useState<string | null>(null);
  const [contextualTestOpen, setContextualTestOpen] = useState(true);
  const [testFilter, setTestFilter] = useState<TestFilter>('all');
  const [newPhraseExpected, setNewPhraseExpected] = useState('');
  const [testResults, setTestResults] = useState<Map<string, TestRowResult>>(new Map());
  const [contextualTestResults, setContextualTestResults] = useState<Map<string, TestRowResult>>(new Map());
  const [highlightTestKey, setHighlightTestKey] = useState<string | null>(null);
  const [testPhraseError, setTestPhraseError] = useState<string | null>(null);
  const lastRowSyncKeyRef = useRef(rowSyncKey);

  useEffect(() => {
    if (lastRowSyncKeyRef.current === rowSyncKey) return;
    lastRowSyncKeyRef.current = rowSyncKey;
    setPanels(initialPanels);
    setTestPhrases(initialTestPhrases);
    setSelectedPanelIndex(0);
    setError(null);
    setContextualTestOpen(initialTestPhrases.some((r) => r.expected === initialPanels[0]?.targetPath));
    setTestResults(new Map());
    setContextualTestResults(new Map());
    setHighlightTestKey(null);
    setTestPhraseError(null);
  }, [rowSyncKey, initialPanels, initialTestPhrases]);

  useEffect(() => {
    setSelectedPanelIndex((idx) => Math.min(idx, Math.max(panels.length - 1, 0)));
  }, [panels.length]);

  useEffect(() => {
    if (!focusExpectedOption) return;
    const idx = panels.findIndex((p) => p.targetPath === focusExpectedOption);
    if (idx >= 0) setSelectedPanelIndex(idx);
  }, [focusExpectedOption, panels]);

  useEffect(() => {
    if (panels.length === 0) {
      setNewPhraseExpected('');
      return;
    }
    setNewPhraseExpected((prev) => {
      if (prev && panels.some((p) => p.targetPath === prev)) return prev;
      return panels[0]!.targetPath;
    });
  }, [panels]);

  const selectedPanel = panels[selectedPanelIndex] ?? panels[0] ?? null;

  const phrasesForSelectedValue = useMemo(
    () => (selectedPanel
      ? testPhrases.filter((row) => row.expected === selectedPanel.targetPath)
      : []),
    [testPhrases, selectedPanel],
  );

  useEffect(() => {
    if (phrasesForSelectedValue.length > 0) setContextualTestOpen(true);
  }, [selectedPanel?.targetPath, phrasesForSelectedValue.length]);

  const persistPanels = useCallback((nextPanels: typeof panels) => {
    try {
      const compiled = compileDisambiguationAnswerGrammarFromPanels(nextPanels);
      onSave(compiled);
      lastRowSyncKeyRef.current = `${compiled.regex ?? ''}\0${optionsKey}\0${style}\0${testPhrasesKey}`;
      setError(null);
      setTestResults(new Map());
      setContextualTestResults(new Map());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [onSave, optionsKey, style, testPhrasesKey]);

  const persistTestPhrases = useCallback((next: DisambiguationTestPhrase[]) => {
    const normalized = normalizeTestPhrases(next);
    setTestPhrases(normalized);
    onSaveTestPhrases(normalized);
    setTestResults(new Map());
    setContextualTestResults(new Map());
    setTestPhraseError(null);
  }, [onSaveTestPhrases]);

  const updatePanelSynonyms = useCallback((index: number, synonyms: string[]) => {
    let nextPanels: typeof panels = [];
    setPanels((prev) => {
      nextPanels = prev.map((p, i) => (i === index ? { ...p, synonyms } : p));
      return nextPanels;
    });
    persistPanels(nextPanels);
  }, [persistPanels]);

  const visibleTestPhrases = useMemo(() => {
    if (testFilter === 'all') return testPhrases;
    if (!newPhraseExpected) return testPhrases;
    return testPhrases.filter((row) => row.expected === newPhraseExpected);
  }, [testPhrases, testFilter, newPhraseExpected]);

  const runContextualTestAll = useCallback(() => {
    if (!selectedPanel) return;
    const next = new Map<string, TestRowResult>();
    for (const row of phrasesForSelectedValue) {
      next.set(testPhraseKey(row.phrase), evaluatePhrase(panels, row.phrase, row.expected));
    }
    setContextualTestResults(next);
  }, [phrasesForSelectedValue, panels, selectedPanel]);

  const runTestAll = useCallback(() => {
    const next = new Map<string, TestRowResult>();
    for (const row of visibleTestPhrases) {
      next.set(
        testRowResultKey(row.phrase, row.expected),
        evaluatePhrase(panels, row.phrase, row.expected),
      );
    }
    setTestResults(next);
  }, [visibleTestPhrases, panels]);

  const addTestPhraseForExpected = useCallback((phrase: string, expected: string) => {
    const { phrases: next, duplicateIndex, ambiguous } = addTestPhrase(
      testPhrases,
      phrase,
      expected,
    );
    if (ambiguous) {
      setTestPhraseError(
        `La frase esiste già con valore atteso «${formatOptionLabel(testPhrases[duplicateIndex]!.expected)}».`,
      );
      setHighlightTestKey(testPhraseKey(phrase));
      return;
    }
    if (duplicateIndex >= 0) {
      setHighlightTestKey(testPhraseKey(testPhrases[duplicateIndex]!.phrase));
      setTestPhraseError(null);
      return;
    }
    persistTestPhrases(next);
    setHighlightTestKey(testPhraseKey(phrase));
  }, [testPhrases, persistTestPhrases]);

  const optionsDiffer = !!runtimeOptions?.length && !sameOptionTokenSets(runtimeOptions, options);

  if (style === 'ask_age') return null;

  if (viewMode === 'test') {
    return (
      <div id="disambiguation-answer-grammar" className="flex flex-col h-full min-h-0">
        <GrammarTestPanel
          variant="full"
          panels={panels}
          testFilter={testFilter}
          onTestFilterChange={setTestFilter}
          newPhraseExpected={newPhraseExpected}
          onNewPhraseExpectedChange={setNewPhraseExpected}
          phrases={visibleTestPhrases}
          allPhraseCount={testPhrases.length}
          testResults={testResults}
          highlightKey={highlightTestKey}
          testPhraseError={testPhraseError}
          optionsDiffer={optionsDiffer}
          planOptions={options}
          runtimeOptions={runtimeOptions}
          onRunTestAll={runTestAll}
          onAddPhrase={addTestPhraseForExpected}
          onDeletePhrase={(phrase) => {
            persistTestPhrases(testPhrases.filter((row) => row.phrase !== phrase));
          }}
          onClearHighlight={() => setHighlightTestKey(null)}
          onEditGrammar={onNavigateToGrammar}
        />
      </div>
    );
  }

  return (
    <div id="disambiguation-answer-grammar" className="flex flex-col h-full min-h-0 gap-2">
      <div className="flex-1 min-h-0 flex flex-col">
      <GrammarValuesSplitPane
        valuesList={(
          <SemanticValueList
            panels={panels}
            selectedIndex={selectedPanelIndex}
            onSelect={setSelectedPanelIndex}
          />
        )}
        detail={selectedPanel ? (
          <SemanticValueSynonymsPanel
            label={selectedPanel.label}
            synonyms={selectedPanel.synonyms}
            autoFocusAdd={autoFocus}
            onChange={(synonyms) => updatePanelSynonyms(selectedPanelIndex, synonyms)}
          />
        ) : (
          <div className="flex h-full min-h-0 items-center justify-center rounded border border-sky-400/20 bg-[#0a1510] p-3 font-mono text-sm text-emerald-300/75">
            Nessun valore semantico
          </div>
        )}
      />
      </div>

      {error && (
        <p className={`flex-shrink-0 font-mono ${CHAT_TEXT} text-red-300/90 flex items-center gap-1`}>
          <X className="w-3 h-3 flex-shrink-0" />
          {error}
        </p>
      )}

      <ContextualTestAccordion
        open={contextualTestOpen}
        onToggle={() => setContextualTestOpen((v) => !v)}
        selectedExpectedLabel={selectedPanel ? formatOptionLabel(selectedPanel.targetPath) : ''}
        phrases={phrasesForSelectedValue}
        testResults={contextualTestResults}
        highlightKey={highlightTestKey}
        testPhraseError={testPhraseError}
        onRunTestAll={runContextualTestAll}
        onAddPhrase={(phrase) => {
          if (!selectedPanel) return;
          addTestPhraseForExpected(phrase, selectedPanel.targetPath);
        }}
        onDeletePhrase={(phrase) => {
          persistTestPhrases(testPhrases.filter((row) => row.phrase !== phrase));
        }}
        onClearHighlight={() => setHighlightTestKey(null)}
        disabled={!selectedPanel}
      />
    </div>
  );
}

function GrammarValuesSplitPane({
  valuesList,
  detail,
}: {
  valuesList: React.ReactNode;
  detail: React.ReactNode;
}) {
  const [ratio, setRatio] = useState(readValuesPanelRatio);
  const [resizing, setResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onSashPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setResizing(true);
    const startX = e.clientX;
    const startRatio = ratio;
    let latestRatio = startRatio;

    const onMove = (ev: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const width = container.getBoundingClientRect().width;
      if (width <= 0) return;
      const deltaRatio = ((ev.clientX - startX) / width) * 100;
      latestRatio = Math.min(
        VALUES_PANEL_MAX_RATIO,
        Math.max(VALUES_PANEL_MIN_RATIO, startRatio + deltaRatio),
      );
      setRatio(latestRatio);
    };

    const onUp = () => {
      setResizing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try {
        localStorage.setItem(VALUES_PANEL_RATIO_KEY, String(latestRatio));
      } catch {
        /* ignore */
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [ratio]);

  return (
    <div
      ref={containerRef}
      className={`flex flex-1 min-h-0 min-w-0 overflow-hidden ${resizing ? 'select-none' : ''}`}
    >
      <div
        className="flex flex-col min-h-0 min-w-0"
        style={{ width: `${ratio}%` }}
      >
        {valuesList}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Ridimensiona elenco valori semantici"
        onPointerDown={onSashPointerDown}
        className="w-1 flex-shrink-0 cursor-col-resize bg-[#1a3a2a] hover:bg-sky-400/50 active:bg-sky-400/70 transition-colors"
      />
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {detail}
      </div>
    </div>
  );
}

function SemanticValueList({
  panels,
  selectedIndex,
  onSelect,
}: {
  panels: ReturnType<typeof buildDisambiguationAnswerGrammarPanels>;
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div
      className="flex flex-col h-full min-h-0 rounded border border-sky-400/25 bg-[#0a1510] overflow-hidden"
      role="listbox"
      aria-label="Valori semantici"
    >
      <p className="flex-shrink-0 font-mono text-[10px] uppercase tracking-wider text-sky-400/55 px-2 py-1.5 border-b border-sky-400/15">
        Valori
      </p>
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {panels.map((panel, index) => {
          const active = index === selectedIndex;
          const isNone = panel.label.startsWith('none');
          return (
            <button
              key={panel.targetPath}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onSelect(index)}
              className={`w-full text-left px-2 py-1.5 font-mono ${CHAT_TEXT} break-words transition-colors ${
                active
                  ? 'bg-sky-400/20 text-emerald-50 ring-1 ring-inset ring-sky-400/35'
                  : 'text-emerald-200/85 hover:bg-sky-400/8'
              } ${isNone && !active ? 'text-sky-300/80' : ''}`}
            >
              {panel.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SemanticValueSynonymsPanel({
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
    <div className="flex-1 min-w-0 flex flex-col min-h-0 rounded border border-sky-400/25 bg-[#0a1510] overflow-hidden">
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

function TestStatusIcon({
  result,
  hasRun,
}: {
  result?: TestRowResult;
  hasRun: boolean;
}) {
  if (!hasRun) return <span className="inline-block w-4" aria-hidden />;
  if (!result || result.status === 'error') {
    return (
      <span title={result?.compileError ?? 'Errore'} className="text-red-400">
        <X className="w-4 h-4" aria-label="Errore" />
      </span>
    );
  }
  if (result.status === 'ok') {
    return (
      <span title="Riconosciuto correttamente" className="text-emerald-400">
        <Check className="w-4 h-4" aria-label="OK" />
      </span>
    );
  }
  if (result.status === 'ambiguous') {
    return (
      <span title="Ambiguità: più valori matchano" className="text-amber-300">
        <AlertTriangle className="w-4 h-4" aria-label="Ambiguo" />
      </span>
    );
  }
  const title = result.status === 'mismatch'
    ? `Mismatch: ${formatOptionLabel(result.recognized ?? '')}`
    : 'Nessun match';
  return (
    <span title={title} className="text-red-400">
      <X className="w-4 h-4" aria-label={title} />
    </span>
  );
}

function RecognizedCell({
  result,
  hasRun,
}: {
  result?: TestRowResult;
  hasRun: boolean;
}) {
  if (!hasRun) return <span className="text-emerald-400/40">—</span>;
  if (!result || result.status === 'error') {
    return <span className="text-red-300/90">{result?.compileError ?? 'Errore'}</span>;
  }
  if (result.status === 'ok') {
    return <span className="text-emerald-400 font-semibold">{formatOptionLabel(result.recognized!)}</span>;
  }
  if (result.status === 'ambiguous') {
    return (
      <span className="text-amber-300 font-semibold">
        ambiguo
        {result.recognized ? ` (${formatOptionLabel(result.recognized)})` : ''}
      </span>
    );
  }
  if (result.status === 'mismatch' && result.recognized) {
    return <span className="text-red-400 font-semibold">{formatOptionLabel(result.recognized)}</span>;
  }
  return <span className="text-red-400">nessun match</span>;
}

function ContextualTestAccordion({
  open,
  onToggle,
  selectedExpectedLabel,
  phrases,
  testResults,
  highlightKey,
  testPhraseError,
  onRunTestAll,
  onAddPhrase,
  onDeletePhrase,
  onClearHighlight,
  disabled,
}: {
  open: boolean;
  onToggle: () => void;
  selectedExpectedLabel: string;
  phrases: DisambiguationTestPhrase[];
  testResults: Map<string, TestRowResult>;
  highlightKey: string | null;
  testPhraseError: string | null;
  onRunTestAll: () => void;
  onAddPhrase: (phrase: string) => void;
  onDeletePhrase: (phrase: string) => void;
  onClearHighlight: () => void;
  disabled?: boolean;
}) {
  const [addDraft, setAddDraft] = useState('');
  const highlightRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!highlightKey) return;
    highlightRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlightKey, phrases]);

  useEffect(() => {
    if (!highlightKey) return;
    const timer = setTimeout(() => onClearHighlight(), 2200);
    return () => clearTimeout(timer);
  }, [highlightKey, onClearHighlight]);

  const commitAdd = () => {
    const trimmed = addDraft.trim();
    if (!trimmed || disabled) return;
    onAddPhrase(trimmed);
    setAddDraft('');
  };

  return (
    <div className="flex-shrink-0 rounded border border-amber-400/25 bg-amber-400/5 overflow-hidden max-h-48 flex flex-col">
      <div className="flex items-center gap-3 px-3 py-1.5 min-w-0 flex-shrink-0">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1.5 flex-shrink-0 font-mono text-left hover:text-amber-200 transition-colors min-w-0"
          aria-expanded={open}
        >
          <ChevronDown
            className={`w-3.5 h-3.5 text-amber-300/80 flex-shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
          />
          <span className={`${CHAT_TEXT} uppercase tracking-wide text-amber-300/80 whitespace-nowrap`}>
            Prova frasi
          </span>
          <span className="text-xs text-emerald-300/70 truncate">({selectedExpectedLabel || '—'})</span>
        </button>
        <button
          type="button"
          onClick={onRunTestAll}
          disabled={phrases.length === 0 || disabled}
          className="ml-auto flex-shrink-0 px-2 py-0.5 rounded border border-amber-400/40 bg-amber-400/15 font-mono text-xs text-amber-100 hover:bg-amber-400/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          Test all
        </button>
      </div>

      {open && (
        <div className="flex flex-col min-h-0 border-t border-amber-400/15 px-2 pb-2 pt-1.5 space-y-1">
          {testPhraseError && (
            <p className={`font-mono text-xs text-red-300/90`}>{testPhraseError}</p>
          )}
          <div className="flex items-center gap-2 flex-shrink-0">
            <input
              type="text"
              value={addDraft}
              onChange={(e) => setAddDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitAdd();
                }
              }}
              disabled={disabled}
              placeholder="Nuova frase di test…"
              className={`${DICT_INPUT_FIELD} flex-1 text-sm bg-[#080e0a] border-amber-400/30 text-emerald-100 placeholder:text-emerald-400/55 focus:border-amber-400/55`}
            />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5">
            {phrases.length === 0 ? (
              <p className="px-1 py-2 font-mono text-xs text-emerald-300/70 italic">Nessuna frase per questo valore</p>
            ) : (
              phrases.map((row) => {
                const key = testPhraseKey(row.phrase);
                const result = testResults.get(key);
                const hasRun = testResults.has(key);
                return (
                  <div
                    key={key}
                    ref={highlightKey === key ? (el) => { highlightRef.current = el; } : undefined}
                    className={`group flex items-center gap-2 px-1.5 py-1 rounded font-mono text-sm ${
                      highlightKey === key ? 'bg-amber-400/15 ring-1 ring-inset ring-amber-400/35' : 'hover:bg-amber-400/5'
                    }`}
                  >
                    <span className="flex-1 min-w-0 text-emerald-100 break-words">{row.phrase}</span>
                    <TestStatusIcon result={result} hasRun={hasRun} />
                    <button
                      type="button"
                      onClick={() => onDeletePhrase(row.phrase)}
                      className="p-0.5 text-red-400/30 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity flex-shrink-0"
                      title="Elimina frase di test"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GrammarTestPanel({
  variant,
  panels,
  testFilter,
  onTestFilterChange,
  newPhraseExpected,
  onNewPhraseExpectedChange,
  phrases,
  allPhraseCount,
  testResults,
  highlightKey,
  testPhraseError,
  optionsDiffer,
  planOptions,
  runtimeOptions,
  onRunTestAll,
  onAddPhrase,
  onDeletePhrase,
  onClearHighlight,
  onEditGrammar,
}: {
  variant: 'full';
  panels: ReturnType<typeof buildDisambiguationAnswerGrammarPanels>;
  testFilter: TestFilter;
  onTestFilterChange: (filter: TestFilter) => void;
  newPhraseExpected: string;
  onNewPhraseExpectedChange: (expected: string) => void;
  phrases: DisambiguationTestPhrase[];
  allPhraseCount: number;
  testResults: Map<string, TestRowResult>;
  highlightKey: string | null;
  testPhraseError: string | null;
  optionsDiffer: boolean;
  planOptions: string[];
  runtimeOptions?: string[];
  onRunTestAll: () => void;
  onAddPhrase: (phrase: string, expected: string) => void;
  onDeletePhrase: (phrase: string) => void;
  onClearHighlight: () => void;
  onEditGrammar?: (expected: string) => void;
}) {
  const [addDraft, setAddDraft] = useState('');
  const highlightRef = useRef<HTMLTableRowElement | null>(null);
  const filterName = 'grammar-test-filter-full';

  useLayoutEffect(() => {
    if (!highlightKey) return;
    highlightRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlightKey, phrases]);

  useEffect(() => {
    if (!highlightKey) return;
    const timer = setTimeout(() => onClearHighlight(), 2200);
    return () => clearTimeout(timer);
  }, [highlightKey, onClearHighlight]);

  const commitAdd = () => {
    const trimmed = addDraft.trim();
    if (!trimmed || !newPhraseExpected) return;
    onAddPhrase(trimmed, newPhraseExpected);
    setAddDraft('');
  };

  const expectedLabelForFilter = panels.find((p) => p.targetPath === newPhraseExpected)?.label
    ?? formatOptionLabel(newPhraseExpected);

  return (
    <div className="flex flex-col h-full min-h-0 rounded border border-amber-400/25 bg-amber-400/5 overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-1.5 flex-shrink-0 border-b border-amber-400/15">
        <Play className="w-3.5 h-3.5 text-amber-300/80 flex-shrink-0" />
        <span className={`${CHAT_TEXT} uppercase tracking-wide text-amber-300/80 whitespace-nowrap`}>
          Test grammatica
        </span>
        <fieldset className="flex items-center gap-3 border-0 p-0 m-0">
          <legend className="sr-only">Filtro frasi di test</legend>
          <label className="flex items-center gap-1 font-mono text-xs text-emerald-200/90 cursor-pointer whitespace-nowrap">
            <input
              type="radio"
              name={filterName}
              checked={testFilter === 'all'}
              onChange={() => onTestFilterChange('all')}
              className="accent-amber-400"
            />
            Tutte ({allPhraseCount})
          </label>
          <label className="flex items-center gap-1 font-mono text-xs text-emerald-200/90 cursor-pointer whitespace-nowrap">
            <input
              type="radio"
              name={filterName}
              checked={testFilter !== 'all'}
              onChange={() => onTestFilterChange('selected')}
              className="accent-amber-400"
            />
            Solo atteso
          </label>
        </fieldset>
        <label className="flex items-center gap-1.5 font-mono text-xs text-emerald-200/90 ml-1">
          <span className="whitespace-nowrap">Nuova frase →</span>
          <select
            value={newPhraseExpected}
            onChange={(e) => onNewPhraseExpectedChange(e.target.value)}
            className={`${DICT_INPUT_FIELD} text-xs py-0.5 max-w-[12rem]`}
          >
            {panels.map((panel) => (
              <option key={panel.targetPath} value={panel.targetPath}>{panel.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onRunTestAll}
          disabled={phrases.length === 0}
          className="ml-auto flex-shrink-0 px-2 py-0.5 rounded border border-amber-400/40 bg-amber-400/15 font-mono text-xs text-amber-100 hover:bg-amber-400/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          Test all
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-3 pb-2 pt-1.5 space-y-1.5">
        {optionsDiffer && runtimeOptions && (
          <p className={`font-mono text-xs text-amber-300/80 break-words`}>
            Token piano: {formatTechnicalOptions(planOptions)}
            {' · '}
            Token catalogo (runtime VB): {formatTechnicalOptions(runtimeOptions)}
          </p>
        )}
        {testPhraseError && (
          <p className={`font-mono text-xs text-red-300/90`}>{testPhraseError}</p>
        )}
        <table className="w-full border-collapse font-mono text-sm">
          <thead className="sticky top-0 z-10 bg-[#0f1a12]">
            <tr className="text-left text-amber-300/75 uppercase tracking-wide text-[10px]">
              <th className="px-2 py-1.5 border-b border-amber-400/20 font-normal">Frase di test</th>
              <th className="px-2 py-1.5 border-b border-amber-400/20 font-normal w-[24%]">Atteso</th>
              <th className="px-2 py-1.5 border-b border-amber-400/20 font-normal w-[24%]">Riconosciuto</th>
              <th className="w-16 border-b border-amber-400/20" aria-hidden />
            </tr>
            <tr className="bg-[#0c1610]">
              <td className="px-2 py-1.5 border-b border-amber-400/25">
                <input
                  type="text"
                  value={addDraft}
                  onChange={(e) => setAddDraft(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitAdd();
                    }
                  }}
                  placeholder="Nuova frase di test…"
                  className={`${DICT_INPUT_FIELD} text-sm bg-[#080e0a] border-amber-400/30 text-emerald-100 placeholder:text-emerald-400/55 focus:border-amber-400/55`}
                />
              </td>
              <td className="px-2 py-1.5 border-b border-amber-400/25 text-emerald-200/80 break-words text-xs">
                {testFilter === 'all' ? expectedLabelForFilter : `= ${expectedLabelForFilter}`}
              </td>
              <td className="px-2 py-1.5 border-b border-amber-400/25 text-emerald-400/40">—</td>
              <td className="border-b border-amber-400/25" />
            </tr>
          </thead>
          <tbody>
            {phrases.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-2 py-4 text-emerald-300/70 italic text-center">
                  Nessuna frase di test
                </td>
              </tr>
            ) : (
              phrases.map((row) => {
                const key = testRowResultKey(row.phrase, row.expected);
                const phraseKey = testPhraseKey(row.phrase);
                const result = testResults.get(key);
                const hasRun = testResults.has(key);
                return (
                  <tr
                    key={`${phraseKey}\0${row.expected}`}
                    ref={highlightKey === phraseKey ? (el) => { highlightRef.current = el; } : undefined}
                    className={`group ${
                      highlightKey === phraseKey ? 'bg-amber-400/15 ring-1 ring-inset ring-amber-400/35' : 'hover:bg-amber-400/5'
                    }`}
                  >
                    <td className="px-2 py-1.5 border-b border-amber-400/10 text-emerald-100 break-words">
                      {row.phrase}
                    </td>
                    <td className="px-2 py-1.5 border-b border-amber-400/10 text-emerald-200/85 break-words text-xs">
                      {formatOptionLabel(row.expected)}
                    </td>
                    <td className="px-2 py-1.5 border-b border-amber-400/10 break-words text-sm">
                      <RecognizedCell result={result} hasRun={hasRun} />
                    </td>
                    <td className="px-1 py-1 border-b border-amber-400/10">
                      <div className="flex items-center justify-end gap-0.5">
                        {onEditGrammar && (
                          <button
                            type="button"
                            onClick={() => onEditGrammar(row.expected)}
                            className="p-0.5 text-sky-400/40 opacity-0 group-hover:opacity-100 hover:text-sky-300 transition-opacity"
                            title="Apri grammatica del valore atteso"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDeletePhrase(row.phrase)}
                          className="p-0.5 text-red-400/30 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
                          title="Elimina frase di test"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
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
