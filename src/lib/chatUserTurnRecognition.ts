/**
 * Client-side recognition debug for user turns during VB chat test.
 */
import type { AgentBundle, AgentSessionState } from './agentBundleTypes';
import type { DisambiguationPlanStorage } from './disambiguationPlanTypes';
import { isNoneOption, matchTurnAnswerGrammar, type TurnAnswerMatch } from './turnAnswerGrammar';
import type { NormalizedVbParsedConcept } from './vbParsedNormalize';

export interface PendingDisambiguationContext {
  signature?: string;
  categoryName?: string;
  options: string[];
}

export interface UserTurnRecognition {
  signature?: string;
  categoryName?: string;
  options: string[];
  planOptions?: string[];
  vbParsed: NormalizedVbParsedConcept[];
  grammarMatch: TurnAnswerMatch | null;
  grammarSource: 'plan' | 'none';
  grammarMapsToRuntimeToken: boolean;
  pendingWasActive: boolean;
  aligned: boolean;
}

export function resolvePendingDisambiguationContext(
  messages: Array<{
    role: string;
    disambiguationSignature?: string;
    disambiguationCategory?: string;
    disambiguationOptions?: string[];
  }>,
): PendingDisambiguationContext | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg.role !== 'agent') continue;
    const options = (msg.disambiguationOptions ?? [])
      .map((o) => o.trim())
      .filter(Boolean);
    if (options.length === 0 || !msg.disambiguationCategory?.trim()) continue;
    return {
      signature: msg.disambiguationSignature,
      categoryName: msg.disambiguationCategory.trim(),
      options,
    };
  }
  return null;
}

function resolveAnswerGrammar(
  plan: DisambiguationPlanStorage | null | undefined,
  signature: string | undefined,
) {
  if (!signature?.trim()) {
    return { grammar: null, source: 'none' as const };
  }
  const saved = plan?.messages.find((m) => m.signature === signature)?.answer_grammar;
  if (saved?.regex?.trim()) {
    return { grammar: saved, source: 'plan' as const };
  }
  return { grammar: null, source: 'none' as const };
}

function formatOptionLabel(option: string): string {
  return isNoneOption(option) ? 'none (declino)' : option;
}

function canonicalInOptions(canonical: string | undefined, options: readonly string[]): boolean {
  if (!canonical?.trim()) return false;
  const key = canonical.trim().toLowerCase();
  return options.some((o) => o.trim().toLowerCase() === key);
}

function planOptionsForSignature(
  plan: DisambiguationPlanStorage | null | undefined,
  signature: string | undefined,
): string[] | undefined {
  if (!signature) return undefined;
  const record = plan?.messages.find((m) => m.signature === signature);
  return record?.options?.map((o) => o.trim()).filter(Boolean);
}

/** Builds recognition summary for a user utterance against pending disambiguation context. */
export function buildUserTurnRecognition(params: {
  userText: string;
  bundle: AgentBundle;
  vbParsed?: NormalizedVbParsedConcept[];
  pending: PendingDisambiguationContext | null;
  priorSession?: AgentSessionState | null;
}): UserTurnRecognition | undefined {
  const pending = params.pending;
  if (!pending?.categoryName || pending.options.length === 0) return undefined;

  const { grammar, source } = resolveAnswerGrammar(
    params.bundle.analysis.disambiguation_plan,
    pending.signature,
  );

  const grammarMatch = grammar
    ? matchTurnAnswerGrammar(params.userText, grammar)
    : null;

  const vbParsed = (params.vbParsed ?? [])
    .map((p) => ({ category: p.category.trim(), value: p.value.trim() }))
    .filter((p) => p.category && p.value);

  const categoryKey = pending.categoryName.toLowerCase();
  const vbForCategory = vbParsed.find((p) => p.category.toLowerCase() === categoryKey);
  const aligned = !grammarMatch?.selectedOption || !vbForCategory
    || vbForCategory.value.toLowerCase() === grammarMatch.selectedOption.toLowerCase()
    || pending.options.some((o) => o.toLowerCase() === vbForCategory.value.toLowerCase());

  const planOptions = planOptionsForSignature(
    params.bundle.analysis.disambiguation_plan,
    pending.signature,
  );

  const grammarMapsToRuntimeToken = canonicalInOptions(
    grammarMatch?.selectedOption,
    pending.options,
  );

  const pendingSlot = params.priorSession?.pendingExpectedInput?.[0];
  const pendingWasActive = pendingSlot?.valueKind === 'canonical_token'
    && pendingSlot.categoryName?.trim().toLowerCase() === pending.categoryName.toLowerCase();

  return {
    signature: pending.signature,
    categoryName: pending.categoryName,
    options: pending.options,
    planOptions,
    vbParsed,
    grammarMatch,
    grammarSource: source,
    grammarMapsToRuntimeToken,
    pendingWasActive,
    aligned: grammarMatch == null ? vbForCategory == null : aligned,
  };
}

export function formatUserTurnRecognitionSummary(recognition: UserTurnRecognition): string {
  const parts: string[] = [];
  if (recognition.grammarMatch?.selectedOption) {
    parts.push(`Grammar → ${formatOptionLabel(recognition.grammarMatch.selectedOption)}`);
  }
  const vbHit = recognition.vbParsed.find(
    (p) => p.category.toLowerCase() === recognition.categoryName?.toLowerCase(),
  );
  if (vbHit) {
    parts.push(`Motore VB → ${vbHit.category}: ${vbHit.value}`);
  } else if (recognition.vbParsed.length > 0) {
    parts.push(
      recognition.vbParsed.map((p) => `Motore VB → ${p.category}: ${p.value}`).join(' · '),
    );
  }
  if (parts.length === 0) return 'Nessun riconoscimento';
  return parts.join(' · ');
}

export function shouldAutoExpandUserTurnRecognition(
  recognition: UserTurnRecognition | undefined,
): boolean {
  if (!recognition) return false;
  if (recognition.grammarMatch?.selectedOption && !recognition.grammarMapsToRuntimeToken) return true;
  if (!recognition.pendingWasActive) return true;
  const vbHit = recognition.vbParsed.find(
    (p) => p.category.toLowerCase() === recognition.categoryName?.toLowerCase(),
  );
  if (!recognition.grammarMatch?.selectedOption && !vbHit) return true;
  if (recognition.grammarMatch?.selectedOption && vbHit && !recognition.aligned) return true;
  return false;
}
