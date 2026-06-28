/**
 * Resolves corpus segmentation UI status from loader + persistence signals.
 * Keeps ontology tab messaging independent of React hooks.
 */

export type CorpusOntologyPhase =
  | 'loading'
  | 'stabilizing'
  | 'ready'
  | 'missing'
  | 'stale'
  | 'partial';

export interface CorpusOntologyStatus {
  phase: CorpusOntologyPhase;
  /** User-facing detail for banners and empty states. */
  message: string;
}

export interface CorpusOntologyStatusInput {
  layoutStable: boolean;
  layoutStabilizing: boolean;
  loadingPersisted: boolean;
  segmentationReady: boolean;
  segmentationStale: boolean;
  partialSaved: boolean;
  partialProcessed: number;
  partialTotal: number;
}

/** Maps low-level segmentation flags to a single UX status. */
export function resolveCorpusOntologyStatus(
  input: CorpusOntologyStatusInput,
): CorpusOntologyStatus {
  if (input.layoutStabilizing || input.loadingPersisted) {
    return {
      phase: input.layoutStabilizing ? 'stabilizing' : 'loading',
      message: input.layoutStabilizing
        ? 'Caricamento dizionari collegati…'
        : 'Caricamento segmentazione salvata…',
    };
  }

  if (input.segmentationReady) {
    if (input.segmentationStale) {
      return {
        phase: 'stale',
        message:
          'Il dizionario o il corpus sono cambiati dopo l\'ultima ontologia. '
          + 'Usa «Ricrea ontologia» per aggiornare la segmentazione.',
      };
    }
    return { phase: 'ready', message: '' };
  }

  if (input.segmentationStale) {
    return {
      phase: 'stale',
      message:
        'Il dizionario o il corpus sono cambiati dopo l\'ultima ontologia. '
        + 'Usa «Ricrea ontologia» per aggiornare la segmentazione.',
    };
  }

  if (input.partialSaved && input.partialTotal > input.partialProcessed) {
    return {
      phase: 'partial',
      message:
        `Segmentazione parziale salvata (${input.partialProcessed.toLocaleString('it-IT')} / `
        + `${input.partialTotal.toLocaleString('it-IT')} testi unici).`,
    };
  }

  return {
    phase: 'missing',
    message: 'Segmentazione corpus non ancora disponibile per questo layout.',
  };
}
