/**
 * AI prompts and post-processing for disambiguation plan messages.
 */
import type { DisambiguationEditorRow } from './disambiguationPlanMessages';
import { formatCopySignatureLabel, formatHumanOptions } from './disambiguationPlanMessages';
import { sanitizeOpenAiJsonRegex } from './grammarNormalize';
import { defaultNoMatchReplies } from './messageAssembly';
import type { DisambiguationMessageRecord } from './disambiguationPlanTypes';
import { DISAMBIGUATION_MULTI_CHOICE_MARKER } from './disambiguationPlanTypes';
import { compileDisambiguationAnswerGrammar } from './disambiguationPlanMessages';

const DOCUMENT_TEXT_MAX = 12_000;

/** Stable short id for AI requests within one batch (avoids echoing long signatures). */
export function disambiguationMessageId(index: number): string {
  return `d${index + 1}`;
}

export const DISAMBIGUATION_MESSAGES_PROMPT = `Sei un esperto di dialoghi medici in italiano per prenotazione prestazioni.
Ti viene fornita una lista CHIUSA di punti di disambiguazione del dialogo (non modificare l'elenco).

Per ogni punto scrivi:
- question: domanda naturale, fluente, come parlerebbe un operatore di centralino medico
- no_match_1, no_match_2, no_match_3: re-prompt progressivi se l'utente non capisce

REGOLE TASSATIVE:
1. Genera ESATTAMENTE una voce per OGNI id elencato (campo id IDENTICO: d1, d2, …).
2. Copia il campo signature così com'è, senza modificarlo.
3. NON elencare mai il token tecnico "none" al paziente.
4. style=optional_include: chiedi se vuole includere l'opzione (es. ecodoppler), NON "preferisce X o none".
5. style=choice con poche opzioni (2-4): domanda specifica tra quelle opzioni.
6. style=choice con signature che contiene "${DISAMBIGUATION_MULTI_CHOICE_MARKER}": domanda GENERICA sulla categoria (es. "Per quale specialità desidera prenotare?"), NON elencare decine di specialità.
7. NON usare il template robotico "Per {categoria}, preferisce A o B?".
8. Italiano formale ma caldo (Lei). Una sola domanda per question, con "?".
9. style=ask_age (vincolo): chiedi UN solo dato grezzo dedotto dai token catalogo (es. età in anni, litri, peso).
   - Se i token contengono "anni", "mesi", "settimane": chiedi l'età del paziente in forma naturale (es. "Quanti anni ha il paziente?").
   - NON elencare fasce o range dal catalogo come menu ("da 6 a 15 anni", "over 17", ecc.).
   - no_match: chiedi di rispondere con un numero (es. "Può indicare l'età in anni?").
10. Per style=ask_age ignora opzioni/token nel testo della domanda — servono solo al motore per filtrare.

IMPORTANTE: Rispondi SOLO con JSON valido.

Formato:
{ "messages": [
  {
    "id": "d1",
    "signature": "tipo visita||controllo|prima visita||choice",
    "question": "È una prima visita o una visita di controllo?",
    "no_match_1": "Non ho capito. È una prima visita o una visita di controllo?",
    "no_match_2": "Mi scusi, può ripetere? Prima visita o controllo?",
    "no_match_3": "Provi a rispondere solo con «prima visita» o «controllo»."
  }
] }`;

export function buildDisambiguationMessagesUserMessage(
  rows: DisambiguationEditorRow[],
  documentName: string,
  documentText?: string,
  correction = '',
): string {
  const docSection = documentText?.trim()
    ? `\n\nCONTESTO DOCUMENTO:\n${documentText.trim().slice(0, DOCUMENT_TEXT_MAX)}`
    : '';

  const lines = rows.map((row, index) => {
    const opts = row.style === 'ask_age'
      ? formatHumanOptions(row.options, row.style)
      : formatHumanOptions(row.options, row.style);
    const id = disambiguationMessageId(index);
    const vincoloNote = row.style === 'ask_age'
      ? '\n  nota_vincolo: deduci il dato da chiedere dai token catalogo; non elencarli'
      : '';
    return (
      `- id: ${id}\n` +
      `  signature: ${row.signature}\n` +
      `  etichetta: ${formatCopySignatureLabel(row.signature, row.categoryName)}\n` +
      `  categoria: ${row.categoryName}\n` +
      `  tipo: ${row.style}\n` +
      `  opzioni: ${opts}\n` +
      `  contesti simili: ${row.contextCount ?? 1}` +
      vincoloNote
    );
  });

  return (
    `Genera domande e re-prompt per questi ${rows.length} punti di disambiguazione.\n` +
    `Documento: "${documentName}"\n\n` +
    `GENERA UNA VOCE PER OGNI id (${rows.length}):\n` +
    lines.join('\n') +
    docSection +
    correction
  );
}

export function buildDisambiguationMessagesCorrection(lastError: string): string {
  return (
    `\n\nCORREZIONE OBBLIGATORIA: tentativo precedente fallito (${lastError}). ` +
    `Rigenera TUTTI gli id elencati con id, signature, question e no_match_1/2/3 completi. ` +
    `Formato: { "messages": [ { "id": "d1", "signature": "...", "question": "...", "no_match_1": "...", ... } ] }`
  );
}

function parseMessagesPayload(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.messages)) return obj.messages;
  if (Array.isArray(obj.rows)) return obj.rows;
  return [];
}

/** Parses raw OpenAI JSON for disambiguation message generation. */
export function parseDisambiguationAiContent(rawContent: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    try {
      parsed = JSON.parse(sanitizeOpenAiJsonRegex(rawContent));
    } catch {
      throw new Error(`JSON OpenAI non valido: ${rawContent.slice(0, 200)}`);
    }
  }

  if (parseMessagesPayload(parsed).length === 0) {
    throw new Error(
      'Formato risposta AI non riconosciuto: usa { "messages": [ { "signature": "...", "question": "...", "no_match_1": "...", ... } ] }',
    );
  }

  return parsed;
}

/** Validates and merges AI output into message records. */
export function processDisambiguationMessagesAiResponse(
  targetRows: DisambiguationEditorRow[],
  raw: unknown,
): DisambiguationMessageRecord[] {
  const items = parseMessagesPayload(raw);
  const bySignature = new Map<string, Record<string, unknown>>();
  const byId = new Map<string, Record<string, unknown>>();

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const sig = typeof row.signature === 'string'
      ? row.signature.trim()
      : typeof row.slot_filling === 'string'
        ? row.slot_filling.trim()
        : '';
    if (id) byId.set(id, row);
    if (sig) bySignature.set(sig, row);
  }

  const missing: string[] = [];
  const out: DisambiguationMessageRecord[] = [];

  for (let i = 0; i < targetRows.length; i++) {
    const target = targetRows[i]!;
    const ai = byId.get(disambiguationMessageId(i)) ?? bySignature.get(target.signature);
    if (!ai) {
      missing.push(target.signature);
      continue;
    }
    const question = typeof ai.question === 'string' ? ai.question.trim() : '';
    if (!question) {
      missing.push(target.signature);
      continue;
    }
    const noMatch = defaultNoMatchReplies(question);
    out.push({
      signature: target.signature,
      categoryName: target.categoryName,
      options: target.options,
      style: target.style,
      question,
      no_match_1: typeof ai.no_match_1 === 'string' && ai.no_match_1.trim()
        ? ai.no_match_1.trim()
        : noMatch.no_match_1,
      no_match_2: typeof ai.no_match_2 === 'string' && ai.no_match_2.trim()
        ? ai.no_match_2.trim()
        : noMatch.no_match_2,
      no_match_3: typeof ai.no_match_3 === 'string' && ai.no_match_3.trim()
        ? ai.no_match_3.trim()
        : noMatch.no_match_3,
      source: 'ai',
      status: null,
      contextCount: target.contextCount,
      answer_grammar: target.style === 'ask_age'
        ? null
        : compileDisambiguationAnswerGrammar(target.options),
    });
  }

  if (missing.length > 0) {
    const labels = missing.map((sig) => {
      const row = targetRows.find((r) => r.signature === sig);
      return row ? formatCopySignatureLabel(sig, row.categoryName) : sig;
    });
    throw new Error(`Messaggi mancanti per: ${labels.slice(0, 5).join(', ')}${labels.length > 5 ? '…' : ''}`);
  }

  return out;
}
