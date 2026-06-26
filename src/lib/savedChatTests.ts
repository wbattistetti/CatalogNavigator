/**
 * Saved manual VB chat tests — persisted on kb_analyses with project save.
 */
import type { ChatTurnDebug } from './chatTurnDebug';
import type { UserTurnRecognition } from './chatUserTurnRecognition';
import type { DialogTestTurnRecord } from './dialogTestPlan/dialogTestPlanTypes';

export type SavedChatPlanCopyField = 'question' | 'no_match_1' | 'no_match_2' | 'no_match_3';

export interface SavedChatMessageInput {
  role: 'user' | 'agent';
  text: string;
  isResult?: boolean;
  hintSource?: 'disambiguation_plan' | 'disambiguation_plan_no_match' | 'template' | string;
  disambiguationSignature?: string;
  disambiguationCategory?: string;
  disambiguationOptions?: string[];
  editablePlanField?: SavedChatPlanCopyField;
  turnStuckReasons?: string[];
  turnRecognition?: UserTurnRecognition;
  turnDebug?: ChatTurnDebug;
}

export interface SavedChatTest {
  id: string;
  title: string;
  finalPath: string | null;
  savedAt: string;
  transcript: DialogTestTurnRecord[];
  /** Full bubble list for interactive replay (preferred over transcript alone). */
  messages?: SavedChatMessageInput[];
}

export type SavedChatTestsStorage = SavedChatTest[];

/** Parses persisted JSON into saved chat tests. */
export function parseSavedChatTests(raw: unknown): SavedChatTestsStorage {
  if (!Array.isArray(raw)) return [];
  const tests: SavedChatTest[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Partial<SavedChatTest>;
    if (typeof row.id !== 'string' || typeof row.title !== 'string') continue;
    if (typeof row.savedAt !== 'string') continue;
    if (!Array.isArray(row.transcript)) continue;
    tests.push({
      id: row.id,
      title: row.title,
      finalPath: typeof row.finalPath === 'string' ? row.finalPath : null,
      savedAt: row.savedAt,
      transcript: row.transcript as DialogTestTurnRecord[],
      messages: Array.isArray(row.messages)
        ? (row.messages as SavedChatMessageInput[])
        : undefined,
    });
  }
  return tests;
}

/** Builds title: "# n final.path" */
export function buildSavedChatTitle(sequenceNumber: number, finalPath: string | null): string {
  const pathLabel = finalPath?.trim() || '(senza percorso)';
  return `# ${sequenceNumber} ${pathLabel}`;
}

/**
 * Converts alternating chat bubbles into VB turn records for transcript replay.
 * Skips the opening agent message (start question).
 */
export function chatMessagesToTranscript(
  messages: readonly SavedChatMessageInput[],
  finalPath: string | null,
): DialogTestTurnRecord[] {
  const transcript: DialogTestTurnRecord[] = [];
  let seenUser = false;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'agent' && !seenUser) continue;

    if (msg.role !== 'user') continue;
    seenUser = true;

    const turn: DialogTestTurnRecord = { userText: msg.text };

    for (let j = i + 1; j < messages.length; j++) {
      const next = messages[j];
      if (next.role === 'user') break;
      if (next.role !== 'agent') continue;

      turn.spokenHint = next.text;
      turn.disambiguationCategory = next.disambiguationCategory;
      turn.disambiguationOptions = next.disambiguationOptions;
      turn.disambiguationSignature = next.disambiguationSignature;
      turn.hintSource = next.hintSource;
      turn.turnStuckReasons = next.turnStuckReasons;
      turn.turnDebug = next.turnDebug;
      turn.turnRecognition = msg.turnRecognition ?? turn.turnRecognition;
      if (next.isResult) {
        turn.action = 'confirm';
        turn.selectedPath = finalPath;
      }
      break;
    }

    transcript.push(turn);
  }

  return transcript;
}

/** Rebuilds bubble list from transcript when legacy saves lack `messages`. */
export function transcriptToSavedMessages(
  startQuestion: string | undefined,
  transcript: readonly DialogTestTurnRecord[],
  finalPath: string | null,
): SavedChatMessageInput[] {
  const messages: SavedChatMessageInput[] = [];
  const opening = startQuestion?.trim();
  if (opening) {
    messages.push({ role: 'agent', text: opening });
  }

  for (const turn of transcript) {
    messages.push({
      role: 'user',
      text: turn.userText,
      turnRecognition: turn.turnRecognition,
    });
    const agentText = turn.spokenHint?.trim();
    if (!agentText) continue;

    const isConfirm = turn.action === 'confirm' && !!(turn.selectedPath ?? finalPath);
    messages.push({
      role: 'agent',
      text: agentText,
      isResult: isConfirm,
      hintSource: turn.hintSource,
      disambiguationSignature: turn.disambiguationSignature,
      disambiguationCategory: turn.disambiguationCategory,
      disambiguationOptions: turn.disambiguationOptions,
      turnStuckReasons: turn.turnStuckReasons,
      turnDebug: turn.turnDebug,
    });
  }

  if (
    finalPath
    && messages.length > 0
    && !messages.some((m) => m.isResult)
  ) {
    messages.push({
      role: 'agent',
      text: 'Prestazione confermata.',
      isResult: true,
    });
  }

  return messages;
}

/** Resolves interactive message list for a saved test. */
export function resolveSavedChatMessages(
  test: SavedChatTest,
  startQuestion?: string,
): SavedChatMessageInput[] {
  if (test.messages?.length) return test.messages;
  return transcriptToSavedMessages(startQuestion, test.transcript, test.finalPath);
}

/** Creates a saved chat test from live chat panel state. */
export function createSavedChatTest(
  messages: readonly SavedChatMessageInput[],
  finalPath: string | null,
  existingCount: number,
): SavedChatTest {
  const sequenceNumber = existingCount + 1;
  const snapshot = messages.map((msg) => ({ ...msg }));
  return {
    id: `saved-chat-${Date.now()}-${sequenceNumber}`,
    title: buildSavedChatTitle(sequenceNumber, finalPath),
    finalPath,
    savedAt: new Date().toISOString(),
    messages: snapshot,
    transcript: chatMessagesToTranscript(snapshot, finalPath),
  };
}

export function hasSavedChatTests(storage: SavedChatTestsStorage | null | undefined): boolean {
  return (storage?.length ?? 0) > 0;
}

/** Merges session + DB lists; session entries win on id collision. */
export function mergeSavedChatTests(
  session: SavedChatTestsStorage,
  fromDb: SavedChatTestsStorage,
): SavedChatTestsStorage {
  const byId = new Map<string, SavedChatTest>();
  for (const test of fromDb) byId.set(test.id, test);
  for (const test of session) byId.set(test.id, test);
  return Array.from(byId.values()).sort((a, b) => a.savedAt.localeCompare(b.savedAt));
}

/** Keeps in-memory session tests when DB round-trip omits the column or returns empty. */
export function preserveSavedChatTestsOnReload(
  session: SavedChatTestsStorage,
  reloaded: SavedChatTestsStorage,
): SavedChatTestsStorage {
  if (session.length === 0) return reloaded;
  if (reloaded.length === 0) return session;
  return mergeSavedChatTests(session, reloaded);
}
