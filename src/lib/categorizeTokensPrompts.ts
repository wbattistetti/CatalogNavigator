/**
 * OpenAI prompts for automatic token → category assignment.
 */
import type { CategorizeTokensSnapshot, CategorizeUncategorizedToken } from './categorizeTokensContext';

export const CATEGORIZE_TOKENS_SYSTEM_PROMPT = `Sei un assistente per dizionari NLU in italiano.
Il designer ha già catalogato manualmente alcuni token nelle categorie: usa quella mappa come REGOLA INDUTTIVA.
Devi proporre assegnazioni SOLO per i token ancora in "no category".

REGOLE TASSATIVE:
1. Usa SOLO categoryId presenti in CATALOGAZIONE ATTUALE — non inventare categorie nuove.
2. Assegna SOLO token elencati in "TOKEN DA CLASSIFICARE" — non spostare token già catalogati.
3. Ragiona per INDUZIONE: token semanticamente simili agli esempi del designer → stessa categoria.
4. Categorie VUOTE: non assegnarci token senza evidenza corpus molto forte.
5. Se non sei ragionevolmente sicuro, OMETTI il token (resta in no category).
6. confidence 0–1: >= 0.75 solo con evidenza coerente con la catalogazione attuale.
7. I token possono contenere prefissi come "> 17 anni" — copia il testo IDENTICO.
8. Rispondi SOLO con JSON valido, senza markdown.

Formato:
{
  "assignments": [
    { "token": "testo esatto", "categoryId": "cat_...", "confidence": 0.82, "reason": "breve motivo" }
  ]
}`;

function formatCatalogationBlock(snapshot: CategorizeTokensSnapshot): string {
  if (snapshot.catalogation.length === 0) return '(nessuna categoria)';

  return snapshot.catalogation
    .map((c) => {
      const tokenList = c.tokens.length > 0 ? c.tokens.join(', ') : '(vuota)';
      const examples = c.corpusExamples.length > 0
        ? c.corpusExamples.map((s) => `"${s}"`).join(' | ')
        : '(nessuna frase corpus con token di questa categoria)';
      return (
        `- [${c.name}] id=${c.id} | ordine=${c.order} | token: ${tokenList}\n` +
        `  frasi corpus: ${examples}`
      );
    })
    .join('\n');
}

export function buildCategorizeTokensUserMessage(
  snapshot: CategorizeTokensSnapshot,
  batch: CategorizeUncategorizedToken[],
): string {
  const batchBlock = batch
    .map((t) => {
      const ctx = t.snippets.length > 0
        ? ` | contesto: ${t.snippets.map((s) => `"${s}"`).join(' ')}`
        : '';
      return `- "${t.token}"${ctx}`;
    })
    .join('\n');

  return (
    `CATALOGAZIONE ATTUALE DEL DESIGNER (estendi per induzione, non contraddire):\n` +
    `${formatCatalogationBlock(snapshot)}\n\n` +
    `TOKEN IN NO CATEGORY (${snapshot.uncategorizedCount} totali, batch ${batch.length}):\n` +
    `${batchBlock}\n\n` +
    `Assegna solo dove la catalogazione attuale e il contesto corpus danno evidenza chiara. Ometti i dubbiosi.`
  );
}
