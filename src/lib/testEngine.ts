import type { AnalysisRow } from '../hooks/useAnalysis';
import { matchBestItemPath, matchGrammarInput } from './grammarMatch';
import { requiresInteractiveNode, resolveNavigationTarget } from './nluQuestionRules';

export interface TestMessage {
  id: string;
  role: 'agent' | 'user';
  text: string;
  isResult?: boolean;
}

export interface TestState {
  messages: TestMessage[];
  currentPath: string | null;
  noMatchCount: number;
  selectedPath: string | null;
}

export interface AgentTestConfig {
  start_question: string | null;
  confirmation_preamble: string | null;
  item_paths?: string[] | null;
}

/** Builds the final confirmation message when a leaf is selected. */
export function formatLeafConfirmation(
  targetPath: string,
  targetRow: AnalysisRow,
  preamble: string | null,
): string {
  const text = targetRow.confirmation_text?.trim();
  if (text) {
    const pre = preamble?.trim() || 'Quindi confermo:';
    return `${pre} ${text}`;
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
        text: 'Imposta la Domanda di start (apertura generale) nella barra in alto, poi salva.',
      }],
      currentPath: null,
      noMatchCount: 0,
      selectedPath: null,
    };
  }

  return {
    messages: [{ id: '0', role: 'agent', text: openingText }],
    currentPath: null,
    noMatchCount: 0,
    selectedPath: null,
  };
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

/** Joins all user utterances in the session for multi-turn grammar scoring. */
export function buildCumulativeUserText(state: TestState, currentInput: string): string {
  const prior = state.messages
    .filter((m) => m.role === 'user')
    .map((m) => m.text.trim())
    .filter(Boolean);
  const parts = [...prior, currentInput.trim()].filter(Boolean);
  return parts.join(' ');
}

/** True when agent asked a disambiguation question and expects an answer grammar match. */
function isAwaitingInteractiveAnswer(
  state: TestState,
  rows: AnalysisRow[],
  itemPaths?: string[] | null,
): boolean {
  if (!state.currentPath || state.selectedPath !== null) return false;
  const row = rows.find((r) => r.slot_filling === state.currentPath);
  if (!row?.question?.trim() || !row.answer_grammar?.regex?.trim()) return false;
  const slots = rows.map((r) => r.slot_filling);
  return requiresInteractiveNode(slots, state.currentPath, itemPaths);
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
    const agentMsg: TestMessage = { id: uid + '-a', role: 'agent', text: fallback };
    return {
      ...state,
      messages: [...state.messages, userMsg, agentMsg],
      noMatchCount: Math.min(state.noMatchCount + 1, 2),
    };
  }

  const resolved = resolveNavigationTarget(result.targetPath, rows, config?.item_paths);

  if (resolved.isLeaf) {
    const resultMsg: TestMessage = {
      id: uid + '-r',
      role: 'agent',
      text: formatLeafConfirmation(resolved.path, resolved.row, config?.confirmation_preamble ?? null),
      isResult: true,
    };
    return {
      ...state,
      messages: [...state.messages, userMsg, resultMsg],
      currentPath: resolved.path,
      noMatchCount: 0,
      selectedPath: resolved.path,
    };
  }

  const nextQuestion = resolved.row.question?.trim();
  const agentText = nextQuestion
    || `Ho individuato: ${resolved.path.replace(/\./g, ' ')}. Può essere più specifico?`;

  const agentMsg: TestMessage = { id: uid + '-a', role: 'agent', text: agentText };
  return {
    ...state,
    messages: [...state.messages, userMsg, agentMsg],
    currentPath: resolved.path,
    noMatchCount: 0,
  };
}

export function processInput(
  state: TestState,
  input: string,
  rows: AnalysisRow[],
  config?: AgentTestConfig,
): TestState {
  if (state.selectedPath !== null) return state;

  const uid = String(Date.now() + Math.random());
  const userMsg: TestMessage = { id: uid + '-u', role: 'user', text: input.trim() };

  if (isAwaitingInteractiveAnswer(state, rows, config?.item_paths)) {
    return processAnswerAtCurrentPath(state, input, rows, config, uid, userMsg);
  }

  const cumulativeText = buildCumulativeUserText(state, input.trim());
  const grammarResult = matchBestItemPath(cumulativeText, rows, {
    anchorPath: state.currentPath,
    itemPaths: config?.item_paths,
  });

  if (!grammarResult.targetPath) {
    let fallback = noMatchReply(rows, state, config);
    if (grammarResult.regexError) {
      fallback = 'Errore configurazione grammatica: regex non valida su uno o più nodi.';
    }
    const agentMsg: TestMessage = { id: uid + '-a', role: 'agent', text: fallback };
    return {
      ...state,
      messages: [...state.messages, userMsg, agentMsg],
      noMatchCount: Math.min(state.noMatchCount + 1, 2),
    };
  }

  const resolved = resolveNavigationTarget(grammarResult.targetPath, rows, config?.item_paths);

  if (resolved.isLeaf) {
    const resultMsg: TestMessage = {
      id: uid + '-r',
      role: 'agent',
      text: formatLeafConfirmation(resolved.path, resolved.row, config?.confirmation_preamble ?? null),
      isResult: true,
    };
    return {
      ...state,
      messages: [...state.messages, userMsg, resultMsg],
      currentPath: resolved.path,
      noMatchCount: 0,
      selectedPath: resolved.path,
    };
  }

  const nextQuestion = resolved.row.question?.trim();
  const agentText = nextQuestion
    || `Ho individuato: ${resolved.path.replace(/\./g, ' ')}. Può essere più specifico?`;

  const agentMsg: TestMessage = { id: uid + '-a', role: 'agent', text: agentText };
  return {
    ...state,
    messages: [...state.messages, userMsg, agentMsg],
    currentPath: resolved.path,
    noMatchCount: 0,
  };
}
