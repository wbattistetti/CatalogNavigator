import type { AnalysisRow } from '../hooks/useAnalysis';

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

function pythonToJsRegex(pattern: string): string {
  return pattern
    .replace(/\(\?P</g, '(?<')
    .replace(/\(\?P\\([A-Za-z_])/g, '(?<$1')
    .replace(/\\\\([wWdDsSpPhHvVbBnNrRtT])/g, '\\$1');
}

function applyGrammar(input: string, row: AnalysisRow): string | null {
  if (!row.grammar) return null;
  try {
    const re = new RegExp(pythonToJsRegex(row.grammar.regex), 'i');
    const match = re.exec(input);
    if (match?.groups) {
      const matched = Object.entries(match.groups).find(([, v]) => v !== undefined);
      if (matched) {
        return row.grammar.mappings[matched[0]] ?? null;
      }
    }
  } catch {
    // invalid regex
  }
  return null;
}

export function initTest(rows: AnalysisRow[]): TestState {
  const roots = rows.filter((r) => !r.slot_filling.includes('.'));
  const startRow = roots.length === 1 ? roots[0] : rows.find((r) => r.question !== null);

  if (!startRow?.question) {
    return {
      messages: [{ id: '0', role: 'agent', text: 'Nessuna domanda di avvio trovata.' }],
      currentPath: null,
      noMatchCount: 0,
      selectedPath: null,
    };
  }

  return {
    messages: [{ id: '0', role: 'agent', text: startRow.question }],
    currentPath: startRow.slot_filling,
    noMatchCount: 0,
    selectedPath: null,
  };
}

export function processInput(state: TestState, input: string, rows: AnalysisRow[]): TestState {
  if (state.selectedPath !== null) return state;

  const currentRow = rows.find((r) => r.slot_filling === state.currentPath);
  if (!currentRow) return state;

  const uid = String(Date.now() + Math.random());
  const userMsg: TestMessage = { id: uid + '-u', role: 'user', text: input.trim() };

  const targetPath = applyGrammar(input, currentRow);

  if (!targetPath) {
    const idx = state.noMatchCount;
    const nm =
      idx === 0 ? currentRow.no_match_1
      : idx === 1 ? currentRow.no_match_2
      : currentRow.no_match_3;
    const agentMsg: TestMessage = {
      id: uid + '-a',
      role: 'agent',
      text: nm ?? currentRow.question ?? 'Non ho capito. Può ripetere?',
    };
    return {
      ...state,
      messages: [...state.messages, userMsg, agentMsg],
      noMatchCount: Math.min(state.noMatchCount + 1, 2),
    };
  }

  const targetRow = rows.find((r) => r.slot_filling === targetPath);

  if (!targetRow || !targetRow.question) {
    const resultMsg: TestMessage = {
      id: uid + '-r',
      role: 'agent',
      text: `Selezionato: ${targetPath}`,
      isResult: true,
    };
    return {
      ...state,
      messages: [...state.messages, userMsg, resultMsg],
      currentPath: targetPath,
      noMatchCount: 0,
      selectedPath: targetPath,
    };
  }

  const agentMsg: TestMessage = { id: uid + '-a', role: 'agent', text: targetRow.question };
  return {
    ...state,
    messages: [...state.messages, userMsg, agentMsg],
    currentPath: targetPath,
    noMatchCount: 0,
  };
}
