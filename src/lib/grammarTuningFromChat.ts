/**
 * Grammar tuning helpers: infer disambiguation option from chat text and navigation payloads.
 */
import { sameOptionTokenSets } from './catalogDisambiguationOptions';
import type { DisambiguationMessageRecord, DisambiguationPlanStorage } from './disambiguationPlanTypes';
import { escapeRegexLiteral } from './grammarSynonyms';
import {
  resolveBubbleDisambiguationSignature,
  type BubbleDisambiguationRef,
} from './resolveBubbleDisambiguationSignature';
import { isNoneOption } from './turnAnswerGrammar';
import type { UserTurnRecognition } from './chatUserTurnRecognition';

export interface OpenDisambiguationFromChatOptions {
  focusGrammar?: boolean;
  proposedSynonym?: string;
  focusExpectedOption?: string | null;
  chatReplay?: ChatTurnReplayRequest;
  categoryName?: string;
  options?: string[];
}

export interface ChatTurnReplayRequest {
  userMessageId: string;
  userText: string;
}

/** True when needle appears as a whole word (or word sequence) inside haystack. */
export function containsAsWholeWord(haystack: string, needle: string): boolean {
  const trimmed = needle.trim();
  if (!trimmed) return false;
  const pattern = new RegExp(`(?<![\\w])${escapeRegexLiteral(trimmed)}(?![\\w])`, 'iu');
  return pattern.test(haystack.trim());
}

/**
 * Picks the longest runtime option plausibly intended by the user utterance.
 * Prefers options contained in the user text, then options that contain the user text.
 */
export function inferExpectedOptionFromUserText(
  userText: string,
  options: readonly string[],
): string | null {
  const text = userText.trim().toLowerCase();
  if (!text) return null;

  const cleaned = options
    .map((o) => o.trim())
    .filter((o) => o.length > 0 && !isNoneOption(o));

  const inUserText = cleaned
    .filter((option) => containsAsWholeWord(text, option.toLowerCase()))
    .sort((a, b) => b.length - a.length);

  if (inUserText.length > 0) return inUserText[0]!;

  const userInOption = cleaned
    .filter((option) => containsAsWholeWord(option.toLowerCase(), text))
    .sort((a, b) => b.length - a.length);

  return userInOption[0] ?? null;
}

/** True when the user turn failed recognition during pending disambiguation. */
export function isUserTurnRecognitionFailure(
  recognition: UserTurnRecognition | null | undefined,
): boolean {
  if (!recognition) return false;
  if (recognition.correctionIntent?.payloadText) return true;
  if (recognition.grammarMatch?.selectedOption && !recognition.grammarMapsToRuntimeToken) return true;
  if (!recognition.pendingWasActive) return true;
  const vbHit = recognition.vbParsed.find(
    (p) => p.category.toLowerCase() === recognition.categoryName?.toLowerCase(),
  );
  if (!recognition.grammarMatch?.selectedOption && !vbHit) return true;
  if (recognition.grammarMatch?.selectedOption && vbHit && !recognition.aligned) return true;
  return false;
}

/**
 * Resolves a plan signature that exists in storage — falls back to category + option set match.
 */
export function resolvePlanSignatureForChat(
  ref: BubbleDisambiguationRef,
  plan: DisambiguationPlanStorage | null | undefined,
): string | null {
  const fromBubble = resolveBubbleDisambiguationSignature(ref);
  const messages = plan?.messages ?? [];
  if (fromBubble && messages.some((m) => m.signature === fromBubble)) {
    return fromBubble;
  }

  const category = ref.disambiguationCategory?.trim().toLowerCase();
  const options = (ref.disambiguationOptions ?? [])
    .map((o) => o.trim())
    .filter(Boolean);
  if (!category || options.length === 0) return fromBubble;

  const byOptions = messages.find(
    (m) => m.categoryName.trim().toLowerCase() === category
      && sameOptionTokenSets(m.options, options),
  );
  return byOptions?.signature ?? fromBubble;
}

/** Finds a plan/editor row when exact signature match fails. */
export function findDisambiguationRowByCategoryOptions(
  rows: readonly Pick<DisambiguationMessageRecord, 'signature' | 'categoryName' | 'options'>[],
  categoryName: string | undefined,
  options: readonly string[] | undefined,
): string | null {
  const category = categoryName?.trim().toLowerCase();
  if (!category || !options?.length) return null;
  const row = rows.find(
    (m) => m.categoryName.trim().toLowerCase() === category
      && sameOptionTokenSets(m.options, options),
  );
  return row?.signature ?? null;
}

export function resolveEditorSignatureForTuning(params: {
  signature: string | null;
  categoryName?: string;
  options?: readonly string[];
  plan: DisambiguationPlanStorage | null | undefined;
  editorSignatures?: readonly string[];
}): string | null {
  const fromPlan = resolvePlanSignatureForChat(
    {
      disambiguationSignature: params.signature ?? undefined,
      disambiguationCategory: params.categoryName,
      disambiguationOptions: params.options,
    },
    params.plan,
  );
  if (fromPlan && (!params.editorSignatures || params.editorSignatures.includes(fromPlan))) {
    return fromPlan;
  }
  const fromCategory = findDisambiguationRowByCategoryOptions(
    params.plan?.messages ?? [],
    params.categoryName,
    params.options,
  );
  if (fromCategory) return fromCategory;
  if (fromPlan) return fromPlan;
  return params.signature;
}
