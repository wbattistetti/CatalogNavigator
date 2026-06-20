/**
 * Explains why chat STUCK/no_match happens when client grammar matches.
 */
import type { AgentSessionState } from './agentBundleTypes';
import { sameOptionTokenSets } from './catalogDisambiguationOptions';
import type { UserTurnRecognition } from './chatUserTurnRecognition';
import type { VbTextTurnResponse } from './vbTestEngineClient';

export interface ChatStuckDiagnosis {
  reasons: string[];
}

function canonicalInOptions(canonical: string | undefined, options: readonly string[]): boolean {
  if (!canonical?.trim()) return false;
  const key = canonical.trim().toLowerCase();
  return options.some((o) => o.trim().toLowerCase() === key);
}

/** Builds human-readable reasons when grammar matches but the dialog does not advance. */
export function buildChatStuckDiagnosis(params: {
  recognition: UserTurnRecognition;
  priorSession: AgentSessionState | null;
  vbResult: VbTextTurnResponse;
  planOptions?: readonly string[];
}): ChatStuckDiagnosis {
  const reasons: string[] = [];
  const { recognition, priorSession, vbResult, planOptions } = params;
  const grammarHit = recognition.grammarMatch?.selectedOption;
  const action = vbResult.instruction?.action;
  const vbCategoryHit = recognition.vbParsed.find(
    (p) => p.category.toLowerCase() === recognition.categoryName?.toLowerCase(),
  );
  const pending = priorSession?.pendingExpectedInput?.[0];
  const pendingActive = pending?.valueKind === 'canonical_token'
    && pending.categoryName?.trim().toLowerCase() === recognition.categoryName?.trim().toLowerCase();
  const exactAfter = vbResult.nextState?.exactAttributoCategories ?? [];

  if (planOptions && planOptions.length > 0 && !sameOptionTokenSets(planOptions, recognition.options)) {
    reasons.push(
      `Token piano messaggi (${planOptions.join(' · ')}) ≠ token runtime VB (${recognition.options.join(' · ')}). `
      + 'La prova nel pannello usa i token del piano; il motore usa i key catalogo.',
    );
  }

  if (grammarHit && !canonicalInOptions(grammarHit, recognition.options)) {
    reasons.push(
      `La grammar mappa a «${grammarHit}» ma il motore accetta solo: ${recognition.options.join(' · ')}.`,
    );
  }

  if (recognition.categoryName && !pendingActive) {
    reasons.push(
      'Pending disambiguazione assente nello stato inviato al motore: la risposta non è stata interpretata come risposta alla domanda.',
    );
  }

  if (grammarHit && pendingActive && !vbCategoryHit) {
    reasons.push(
      'Il motore VB non ha estratto nulla per la categoria attesa nonostante il pending attivo '
      + '(grammar nel bundle diversa da quella del pannello, o token opzione non ammesso).',
    );
  }

  if (vbCategoryHit && recognition.categoryName
    && !exactAfter.some((c) => c.trim() === recognition.categoryName?.trim())
    && action === 'no_match') {
    reasons.push(
      `Il motore ha parsato ${vbCategoryHit.category}: ${vbCategoryHit.value} ma senza «commit esplicito» `
      + '(exactAttributoCategories): il filtro può lasciare più candidati → STUCK.',
    );
  }

  if (grammarHit && vbCategoryHit && action === 'no_match' && (vbResult.candidateCount ?? 0) > 1) {
    const acquired = vbResult.nextState?.acquiredConcepts?.find(
      (c) => c.category?.trim().toLowerCase() === recognition.categoryName?.trim().toLowerCase(),
    );
    if (acquired) {
      reasons.push(
        `Concetto già in memoria (${acquired.category}: ${(acquired.values ?? []).join('+')}) `
        + 'ma il catalogo ha ancora più candidati — possibile acquisizione implicita precedente.',
      );
    }
  }

  if (reasons.length === 0 && grammarHit && !vbCategoryHit && action === 'no_match') {
    reasons.push(
      'Grammar client ok ma il motore non ha parsato la risposta: verifica bundle pubblicato e pending del turno precedente.',
    );
  }

  return { reasons };
}
