/**
 * Test-Motore engine: two-mode hybrid.
 *
 * When `categories` + `tokens` are present in config (dictionary loaded),
 * uses **slot-based navigation** identical to the backend engine:
 *   text → extract token slots → filter candidates → find next disambiguation
 *
 * When only raw rows are available (legacy), falls back to grammar regex scoring.
 */
import type { AnalysisRow } from '../hooks/useAnalysis';
import { matchBestItemPath, matchGrammarInput } from './grammarMatch';
import { requiresInteractiveNode, resolveNavigationTarget } from './nluQuestionRules';
import type { TokenCategory } from './dictionaryTree';
import type { TokenEntry } from './tokenDictionary';
import { AGE_YEARS_QUESTION } from './constraintValidation';
import {
  buildCorpusItemsFromPaths,
  matchTextToSlots,
  resolveNextSlotNavigation,
  scorePathsBySlots,
} from './slotExtract';
import { crossSlotSlotsDuringPending } from './crossSlotDuringPending';
import { formatReadableLeafConfirmation } from './readableCatalog';

export interface TestMessage {
  id: string;
  role: 'agent' | 'user';
  text: string;
  isResult?: boolean;
}

export interface TestState {
  messages: TestMessage[];
  /** Used only in legacy grammar mode: current tree position. */
  currentPath: string | null;
  noMatchCount: number;
  selectedPath: string | null;
  /** Slot-based mode: cumulative category key → canonical token value. */
  resolvedSlots: Record<string, string>;
  /** Slot-based mode: category we just asked about (awaiting the user's answer). */
  pendingCategoryKey: string | null;
  /** Remaining candidate item paths after last slot-based scoring. */
  candidatePaths: string[] | null;
}

export interface AgentTestConfig {
  start_question: string | null;
  confirmation_preamble: string | null;
  item_paths?: string[] | null;
  /** Canonical token grammars for recognition matching. */
  tokens?: TokenEntry[] | null;
  /** Dictionary categories for same-category disambiguation only. */
  categories?: TokenCategory[] | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Builds the final confirmation message when a leaf is selected. */
export function formatLeafConfirmation(
  targetPath: string,
  targetRow: AnalysisRow,
  preamble: string | null,
): string {
  const text = targetRow.confirmation_text?.trim();
  if (text) {
    return formatReadableLeafConfirmation(targetPath, text, preamble);
  }
  return `Selezionato: ${targetPath}`;
}

function getOpeningText(_rows: AnalysisRow[], config?: AgentTestConfig): string | null {
  if (config?.start_question?.trim()) return config.start_question.trim();
  return null;
}

export function initTest(rows: AnalysisRow[], config?: AgentTestConfig): TestState {
  const openingText = getOpeningText(rows, config);

  if (!openingText) {
    return {
      messages: [{
        id: '0',
        role: 'agent',
        text: 'Imposta la Domanda di apertura nel pannello Messaggi (sezione globale in alto), poi salva.',
      }],
      currentPath: null,
      noMatchCount: 0,
      selectedPath: null,
      resolvedSlots: {},
      pendingCategoryKey: null,
      candidatePaths: null,
    };
  }

  return {
    messages: [{ id: '0', role: 'agent', text: openingText }],
    currentPath: null,
    noMatchCount: 0,
    selectedPath: null,
    resolvedSlots: {},
    pendingCategoryKey: null,
    candidatePaths: null,
  };
}

/** True when both categories and tokens are available for slot-based navigation. */
function isSlotMode(config?: AgentTestConfig): boolean {
  return !!(config?.categories?.length && config?.tokens?.length && config?.item_paths?.length);
}

// ── Legacy grammar-based navigation ──────────────────────────────────────────

/** Joins all user utterances in the session for multi-turn grammar scoring. */
export function buildCumulativeUserText(state: TestState, currentInput: string): string {
  const prior = state.messages
    .filter((m) => m.role === 'user')
    .map((m) => m.text.trim())
    .filter(Boolean);
  const parts = [...prior, currentInput.trim()].filter(Boolean);
  return parts.join(' ');
}

function noMatchReply(
  rows: AnalysisRow[],
  state: TestState,
  config?: AgentTestConfig,
): string {
  const idx = state.noMatchCount;
  const contextual = state.currentPath
    ? rows.find((r) => r.slot_filling === state.currentPath)
    : null;

  if (contextual) {
    const nm =
      idx === 0 ? contextual.no_match_1
      : idx === 1 ? contextual.no_match_2
      : contextual.no_match_3;
    if (nm?.trim()) return nm;
    if (contextual.question?.trim()) return contextual.question;
  }

  return config?.start_question?.trim() || 'Non ho capito. Può ripetere?';
}

/** True when agent asked a disambiguation question and expects an answer grammar match. */
function isAwaitingInteractiveAnswer(
  state: TestState,
  rows: AnalysisRow[],
  config?: AgentTestConfig,
): boolean {
  if (!state.currentPath || state.selectedPath !== null) return false;
  const row = rows.find((r) => r.slot_filling === state.currentPath);
  if (!row?.question?.trim() || !row.answer_grammar?.regex?.trim()) return false;
  const slots = rows.map((r) => r.slot_filling);
  return requiresInteractiveNode(slots, state.currentPath, config?.item_paths, config?.categories ?? undefined);
}

function processAnswerAtCurrentPath(
  state: TestState,
  input: string,
  rows: AnalysisRow[],
  config: AgentTestConfig | undefined,
  uid: string,
  userMsg: TestMessage,
): TestState {
  const row = rows.find((r) => r.slot_filling === state.currentPath)!;
  const result = matchGrammarInput(input.trim(), {
    ...row,
    grammar: row.answer_grammar,
  });

  if (!result.targetPath) {
    let fallback = noMatchReply(rows, state, config);
    if (result.regexError) {
      fallback = 'Errore configurazione grammatica risposta: regex non valida.';
    }
    return {
      ...state,
      messages: [...state.messages, userMsg, { id: uid + '-a', role: 'agent', text: fallback }],
      noMatchCount: Math.min(state.noMatchCount + 1, 2),
    };
  }

  const resolved = resolveNavigationTarget(
    result.targetPath, rows, config?.item_paths, config?.categories ?? undefined,
  );

  if (resolved.isLeaf) {
    return {
      ...state,
      messages: [...state.messages, userMsg, {
        id: uid + '-r',
        role: 'agent',
        text: formatLeafConfirmation(resolved.path, resolved.row, config?.confirmation_preamble ?? null),
        isResult: true,
      }],
      currentPath: resolved.path,
      noMatchCount: 0,
      selectedPath: resolved.path,
    };
  }

  const nextQuestion = resolved.row.question?.trim()
    || `Ho individuato: ${resolved.path.replace(/\./g, ' ')}. Può essere più specifico?`;
  return {
    ...state,
    messages: [...state.messages, userMsg, { id: uid + '-a', role: 'agent', text: nextQuestion }],
    currentPath: resolved.path,
    noMatchCount: 0,
  };
}

function processLegacyInput(
  state: TestState,
  input: string,
  rows: AnalysisRow[],
  config: AgentTestConfig | undefined,
  uid: string,
  userMsg: TestMessage,
): TestState {
  if (isAwaitingInteractiveAnswer(state, rows, config)) {
    return processAnswerAtCurrentPath(state, input, rows, config, uid, userMsg);
  }

  const cumulativeText = buildCumulativeUserText(state, input.trim());
  const grammarResult = matchBestItemPath(cumulativeText, rows, {
    anchorPath: state.currentPath,
    itemPaths: config?.item_paths,
    tokens: config?.tokens,
  });

  if (!grammarResult.targetPath) {
    let fallback = noMatchReply(rows, state, config);
    if (grammarResult.regexError) {
      fallback = 'Errore configurazione grammatica: regex non valida su uno o più nodi.';
    }
    return {
      ...state,
      messages: [...state.messages, userMsg, { id: uid + '-a', role: 'agent', text: fallback }],
      noMatchCount: Math.min(state.noMatchCount + 1, 2),
    };
  }

  const resolved = resolveNavigationTarget(
    grammarResult.targetPath, rows, config?.item_paths, config?.categories ?? undefined,
  );

  if (resolved.isLeaf) {
    return {
      ...state,
      messages: [...state.messages, userMsg, {
        id: uid + '-r',
        role: 'agent',
        text: formatLeafConfirmation(resolved.path, resolved.row, config?.confirmation_preamble ?? null),
        isResult: true,
      }],
      currentPath: resolved.path,
      noMatchCount: 0,
      selectedPath: resolved.path,
    };
  }

  const nextQuestion = resolved.row.question?.trim()
    || `Ho individuato: ${resolved.path.replace(/\./g, ' ')}. Può essere più specifico?`;
  return {
    ...state,
    messages: [...state.messages, userMsg, { id: uid + '-a', role: 'agent', text: nextQuestion }],
    currentPath: resolved.path,
    noMatchCount: 0,
  };
}

// ── Slot-based navigation ─────────────────────────────────────────────────────

/**
 * Finds the confirmation row for the given path.
 * Falls back to a default message when the row has no confirmation_text.
 */
function confirmPath(
  path: string,
  rows: AnalysisRow[],
  preamble: string | null,
): string {
  const row = rows.find((r) => r.slot_filling === path);
  if (row) return formatLeafConfirmation(path, row, preamble);
  return `Selezionato: ${path}`;
}

/**
 * Tries to match the user's answer text against tokens belonging to `categoryKey`.
 * Returns the matched canonical token value, or null.
 */
function matchCategoryAnswer(
  text: string,
  categoryKey: string,
  tokens: TokenEntry[],
  categories: TokenCategory[],
): string | null {
  const slots = matchTextToSlots(text, tokens, categories);
  return slots[categoryKey] ?? null;
}

function processSlotInput(
  state: TestState,
  input: string,
  rows: AnalysisRow[],
  config: AgentTestConfig,
  uid: string,
  userMsg: TestMessage,
): TestState {
  const tokens = config.tokens!;
  const categories = config.categories!;
  const itemPaths = config.item_paths!;

  const corpusItems = buildCorpusItemsFromPaths(itemPaths, categories);

  // ── Phase 1: extract new slots from user input ─────────────────────────────
  // When we asked about a specific category (pendingCategoryKey), try to
  // extract only that category's token from the answer first.
  const newSlots = matchTextToSlots(input.toLowerCase(), tokens, categories);

  const pendingKey = state.pendingCategoryKey;

  let merged = { ...state.resolvedSlots, ...newSlots };

  const pendingNotAnswered = pendingKey != null && newSlots[pendingKey] == null;
  if (pendingNotAnswered) {
    const crossOnly = crossSlotSlotsDuringPending(
      input,
      pendingKey,
      state.resolvedSlots,
      tokens,
      categories,
      itemPaths,
      corpusItems,
    );
    if (crossOnly == null) {
      const idx = state.noMatchCount;
      const lastAgentMsg = [...state.messages].reverse().find((m) => m.role === 'agent');
      const fallback = lastAgentMsg?.text ?? (config.start_question?.trim() || 'Non ho capito. Può ripetere?');
      return {
        ...state,
        messages: [...state.messages, userMsg, { id: uid + '-a', role: 'agent', text: fallback }],
        noMatchCount: Math.min(idx + 1, 2),
      };
    }
    merged = { ...state.resolvedSlots, ...crossOnly };
  }

  // ── Phase 2: score candidates ──────────────────────────────────────────────
  const { paths: candidates, maxCount } = scorePathsBySlots(itemPaths, corpusItems, merged);

  if (maxCount === 0) {
    // No item path matches any of the resolved slots — start fresh
    const fallback = config.start_question?.trim() || 'Non ho capito. Può ripetere?';
    return {
      ...state,
      messages: [...state.messages, userMsg, { id: uid + '-a', role: 'agent', text: fallback }],
      resolvedSlots: {},
      pendingCategoryKey: null,
      candidatePaths: null,
      noMatchCount: Math.min(state.noMatchCount + 1, 2),
    };
  }

  // ── Phase 3: navigate ──────────────────────────────────────────────────────
  const nav = resolveNextSlotNavigation(candidates, corpusItems, merged, categories);

  if (nav.kind === 'confirm') {
    const row = rows.find((r) => r.slot_filling === nav.path);
    const confirmText = row
      ? confirmPath(nav.path, rows, config.confirmation_preamble ?? null)
      : `Selezionato: ${nav.path}`;
    return {
      ...state,
      messages: [...state.messages, userMsg, {
        id: uid + '-r',
        role: 'agent',
        text: confirmText,
        isResult: true,
      }],
      resolvedSlots: merged,
      pendingCategoryKey: null,
      candidatePaths: candidates,
      noMatchCount: 0,
      selectedPath: nav.path,
      currentPath: nav.path,
    };
  }

  if (nav.kind === 'ask_age') {
    return {
      ...state,
      messages: [...state.messages, userMsg, { id: uid + '-a', role: 'agent', text: AGE_YEARS_QUESTION }],
      resolvedSlots: merged,
      pendingCategoryKey: 'fascia di eta', // age key
      candidatePaths: candidates,
      noMatchCount: 0,
    };
  }

  if (nav.kind === 'disambiguate') {
    return {
      ...state,
      messages: [...state.messages, userMsg, {
        id: uid + '-a',
        role: 'agent',
        text: nav.questionText,
      }],
      resolvedSlots: merged,
      pendingCategoryKey: nav.categoryKey,
      candidatePaths: candidates,
      noMatchCount: 0,
    };
  }

  // no_match
  const fallback = config.start_question?.trim() || 'Non ho capito. Può ripetere?';
  return {
    ...state,
    messages: [...state.messages, userMsg, { id: uid + '-a', role: 'agent', text: fallback }],
    resolvedSlots: merged,
    pendingCategoryKey: null,
    candidatePaths: null,
    noMatchCount: Math.min(state.noMatchCount + 1, 2),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function processInput(
  state: TestState,
  input: string,
  rows: AnalysisRow[],
  config?: AgentTestConfig,
): TestState {
  if (state.selectedPath !== null) return state;

  const uid = String(Date.now() + Math.random());
  const userMsg: TestMessage = { id: uid + '-u', role: 'user', text: input.trim() };

  if (isSlotMode(config)) {
    return processSlotInput(state, input, rows, config!, uid, userMsg);
  }

  return processLegacyInput(state, input, rows, config, uid, userMsg);
}
