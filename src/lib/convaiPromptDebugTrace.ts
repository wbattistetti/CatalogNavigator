/**
 * Shared system-prompt lines requiring per-turn PARSED debug output in Convai agents.
 */

/** Separator between spoken reply and non-vocal debug log. */
export const CONVAI_PARSED_DEBUG_SEPARATOR = '---PARSED---';

/** Short reminder at the top of system prompts so the model does not skip PARSED. */
export function formatConvaiDebugTracePreamble(): string[] {
  return [
    `REGOLA ASSOLUTA OUTPUT: ogni tua risposta DEVE finire con ${CONVAI_PARSED_DEBUG_SEPARATOR} e il blocco PARSED (vedi TRACCIA DEBUG).`,
    'Omettere ---PARSED--- è un errore grave: genera sempre il blocco, anche in conferme e aperture.',
    '',
  ];
}

/** Appends debug-trace instructions to Convai system prompts. */
export function formatConvaiDebugTraceLines(): string[] {
  return [
    '',
    'TRACCIA DEBUG (obbligatoria a OGNI turno — mai saltare)',
    `- Dopo T9 (o equivalente), SEMPRE aggiungi in coda: riga vuota, poi ${CONVAI_PARSED_DEBUG_SEPARATOR}, poi le righe PARSED.`,
    '- Struttura output completa (sempre questa sequenza):',
    '  [Parte 1 — solo voce] Risposta parlata (STILE VOCALE, max 2 frasi).',
    `  [Parte 2 — solo transcript] ${CONVAI_PARSED_DEBUG_SEPARATOR}`,
    '  [Parte 2 — righe PARSED] una riga per categoria parsata + PROSSIMA_AZIONE.',
    '- Nel blocco PARSED riporta SOLO il parsing dell\'ultima frase utente, più la prossima azione:',
    '  - Una riga per ogni categoria del dizionario con token riconosciuto in quel turno.',
    '  - Etichetta = nome categoria ESATTO dal dizionario (es. specialità, tipo visita, fascia di età).',
    '  - Valore = token canonico dal catalogo (es. cardiologica, prima, 30 per età in anni).',
    '  - Includi "NO CATEGORY: …" se matched.',
    '  - Se nessun token: (nessun token riconosciuto)',
    '  - Ultima riga: PROSSIMA_AZIONE: chiedi_vincolo | chiedi_attributo | conferma | upgrade_subset',
    '- Vietato nel PARSED: turno_corrente, cumulativo, candidati_attivi, conteggi, elenchi ITEM.',
    '- STILE VOCALE vale SOLO per la Parte 1 (prima di ---PARSED---). Il blocco PARSED non va letto a voce.',
    '- Esempio completo (copia questa struttura):',
    '  Certo, posso aiutarla con una prima visita cardiologica. Quanti anni ha il paziente?',
    '',
    `  ${CONVAI_PARSED_DEBUG_SEPARATOR}`,
    '  specialità: cardiologica',
    '  tipo visita: prima',
    '  PROSSIMA_AZIONE: chiedi_vincolo',
  ];
}
