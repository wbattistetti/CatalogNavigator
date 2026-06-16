/**
 * Per-turn slot contract returned to ConvAI (what to send on the next tool call).
 */
import type { AgentTurnInstruction, ExpectedSlotInput } from './agentBundleTypes';

const DEFAULT_AGE_CATEGORY = 'FASCIA DI ETÀ (VINCOLO)';

/** Contract for ask_age: numeric years only, never fascia catalog tokens. */
export function buildAskAgeExpectedInput(categoryName = DEFAULT_AGE_CATEGORY): ExpectedSlotInput[] {
  return [{
    categoryName,
    valueKind: 'age_years',
    description:
      'Età del paziente in anni come numero intero (es. "30"). '
      + 'NON usare token vincolo/fascia dal catalogo (es. "over 17 anni").',
  }];
}

/** Contract for attribute disambiguation: one canonical token from options. */
export function buildDisambiguateExpectedInput(
  categoryName: string,
  options: string[],
): ExpectedSlotInput[] {
  return [{
    categoryName,
    valueKind: 'canonical_token',
    description: `Uno dei token canonici: ${options.join(', ')}`,
  }];
}

function ageCategoryLabelForExpected(categoryName?: string): string {
  const base = categoryName?.trim() || 'FASCIA DI ETÀ';
  if (/vincolo/i.test(base)) return base;
  return `${base} (VINCOLO)`;
}

/** Attaches expectedInput to instruction when the action requires a specific next slot shape. */
export function withExpectedInput(instruction: AgentTurnInstruction): AgentTurnInstruction {
  if (instruction.action === 'ask_age') {
    return {
      ...instruction,
      expectedInput: {
        slots: buildAskAgeExpectedInput(ageCategoryLabelForExpected(instruction.categoryName)),
      },
    };
  }
  if (instruction.action === 'disambiguate' && instruction.categoryName && instruction.options?.length) {
    return {
      ...instruction,
      expectedInput: {
        slots: buildDisambiguateExpectedInput(instruction.categoryName, instruction.options),
      },
    };
  }
  if (instruction.action === 'confirm_implicit' && instruction.categoryName && instruction.implicitValue) {
    return {
      ...instruction,
      expectedInput: {
        slots: [{
          categoryName: instruction.categoryName,
          valueKind: 'canonical_token',
          description: `Conferma con token "${instruction.implicitValue}" (sì/no dall'utente).`,
        }],
      },
    };
  }
  return instruction;
}
