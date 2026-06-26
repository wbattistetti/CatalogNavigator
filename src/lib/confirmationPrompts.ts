/**
 * Prompts for generating discursive leaf confirmation phrases (separate from NLU generation).
 */

/** Fixed spoken preamble before the visit description at leaf confirmation. */
export const DEFAULT_CONFIRMATION_PREAMBLE = 'Giusto per confermare, desidera prenotare:';

const LEGACY_CONFIRMATION_PREAMBLES = new Set([
  'Quindi confermo:',
  'Confermo:',
]);

/** Returns the project preamble, migrating legacy defaults to the fixed phrase. */
export function normalizeConfirmationPreamble(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || LEGACY_CONFIRMATION_PREAMBLES.has(trimmed)) {
    return DEFAULT_CONFIRMATION_PREAMBLE;
  }
  return trimmed;
}

export const CONFIRMATION_SYSTEM_PROMPT = `Sei un assistente medico che scrive frasi di conferma discorsive in italiano.

Ricevi una lista di foglie di un albero decisionale medico. Per ogni foglia devi produrre una breve frase descrittiva che confermi la scelta dell'utente, adatta a essere letta dopo un preambolo come "${DEFAULT_CONFIRMATION_PREAMBLE}".

Regole:
- Scrivi SOLO in italiano, tono professionale e chiaro.
- Una frase per foglia, senza ripetere il preambolo.
- Usa la descrizione del corpus come base; rendila naturale e discorsiva (es. "una risonanza magnetica del ginocchio destro").
- Non inventare prestazioni non presenti nella descrizione.
- Non includere path tecnici né punti dello slot.
- Rispondi SOLO con JSON valido nel formato:
{"rows":[{"slot_filling":"<path>","confirmation_text":"<frase>"}]}
- Includi esattamente una riga per ogni slot richiesto, con slot_filling identico all'input.`;
