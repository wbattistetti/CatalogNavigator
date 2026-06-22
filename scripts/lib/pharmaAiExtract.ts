/**
 * OpenAI extraction + classification of pharma tokens into dictionary categories.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isPharmaCategoryName,
  PHARMA_CATEGORY_NAMES,
  type PharmaCategoryName,
} from './pharmaDictionaryCategories';
import type { PharmaCsvRow } from './pharmaCsvParse';
import { rowToPromptBlock } from './pharmaCsvParse';

export interface ExtractedPharmaToken {
  text: string;
  category: PharmaCategoryName;
}

export interface PharmaBatchExtraction {
  tokens: ExtractedPharmaToken[];
  ambiguous: Array<{ text: string; chosen: PharmaCategoryName; candidates: PharmaCategoryName[] }>;
}

const SYSTEM_PROMPT = `Sei un esperto di farmaci veterinari italiani. Estrai da ogni riga del catalogo valori utili come token di un dizionario semantico.

CATEGORIE (usa ESATTAMENTE questi nomi):
${PHARMA_CATEGORY_NAMES.map((c, i) => `${i + 1}. ${c}`).join('\n')}

REGOLE:
- NON fidarti dei nomi delle colonne CSV: classifica solo in base al significato del testo.
- Ogni token appartiene a UNA SOLA categoria (scegli la più specifica se ambiguo).
- Nome commerciale: solo BRAND normalizzato (es. da "CYDECTIN 0,1% SOLUZIONE ORALE PER PECORE" → "CYDECTIN"; da "ADVANTAGE- SOLUZIONE SPOT ON..." → "ADVANTAGE").
- Principio attivo: solo sostanza/microorganismo/vaccino (senza dose).
- Dosaggio / concentrazione: valori numerici con unità (es. "80 mg", "0,1%", "5 mg/ml").
- Quantità confezione: es. "100 ml", "35 compresse", "10 dosi" (solo quantità atomica).
- Tipo contenitore: flacone, blister, fiala, pipetta…
- Materiale contenitore: vetro, HDPE, PET…
- Configurazione kit: liofilizzato + solvente, multicomponente…
- Forma farmaceutica vs Tipo contenitore vs Modalità di somministrazione: distingui (compresse/soluzione orale; flacone/blister; orale/spot on/pour-on/iniettabile).
- Fascia di peso: range in kg (es. "4–10 kg"), non frasi lunghe "cani di peso da…".
- Classe terapeutica: codice ATC vet e/o descrizione classe (es. "QP54AB02-MOXIDECTIN").
- Regime di prescrizione: testo prescrizione così com'è nel catalogo.
- Target paziente: specie animali, fasce peso/età se presenti (veterinario).
- Vincoli / controindicazioni: restrizioni d'uso, note in informazioni_aggiuntive.
- Indicazione clinica: solo se esplicita o chiaramente deducibile da ATC/descrizione; altrimenti ometti.
- Indicazioni regolatorie: generico/branded/biosimilare/veterinario/non più in commercio se deducibile.
- Stabilità, metabolismo, interazioni: solo se espliciti nel testo; altrimenti ometti.
- Token in italiano, minuscolo salvo acronimi/brand (CYDECTIN, ATC).
- Non includere codici AIC/GTIN, date, ragione sociale come token.
- Deduplica dentro il batch; massimo ~25 token per categoria per batch (i più rilevanti).

Rispondi SOLO con JSON (forma compatta preferita):
{
  "byCategory": {
    "Principio attivo": ["token1", "token2"],
    "Nome commerciale": ["CYDECTIN"],
    "...": []
  },
  "ambiguous": [ { "text": "...", "chosen": "...", "candidates": ["...", "..."] } ]
}
Oppure equivalente con "tokens": [ { "text": "...", "category": "..." } ].`;

function loadOpenAiKey(): string {
  const paths = [
    join(process.cwd(), 'supabase', 'functions', '.env'),
    join(process.cwd(), '.env'),
  ];
  for (const p of paths) {
    try {
      const content = readFileSync(p, 'utf8');
      const match = content.match(/^OPENAI_API_KEY=(.+)$/m);
      if (match?.[1]?.trim()) return match[1].trim();
    } catch {
      /* try next */
    }
  }
  throw new Error('OPENAI_API_KEY non trovata in supabase/functions/.env o .env');
}

function normalizeTokenText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export class TruncatedAiResponseError extends Error {
  constructor() {
    super('Risposta OpenAI troncata: ridurre batch size');
    this.name = 'TruncatedAiResponseError';
  }
}

export function isTruncatedAiError(err: unknown): boolean {
  if (err instanceof TruncatedAiResponseError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('troncata') || msg.includes('truncat');
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function extractPharmaBatchWithAi(
  rows: PharmaCsvRow[],
  options?: { model?: string; maxTokens?: number },
): Promise<PharmaBatchExtraction> {
  const apiKey = loadOpenAiKey();
  const userMessage = rows.map(rowToPromptBlock).join('\n');
  const model = options?.model ?? 'gpt-4o-mini';
  const maxTokens = options?.maxTokens ?? 16384;

  let lastError = 'OpenAI non disponibile';
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Estrai token da queste ${rows.length} righe del catalogo farmaci veterinari:\n\n${userMessage}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      lastError = `OpenAI ${res.status}: ${body.slice(0, 300)}`;
      if ([429, 502, 503].includes(res.status) && attempt < 2) {
        await sleep(3000 * (attempt + 1));
        continue;
      }
      throw new Error(lastError);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (data.choices?.[0]?.finish_reason === 'length') {
      throw new TruncatedAiResponseError();
    }
    if (!content) throw new Error('Risposta OpenAI vuota');
    return parseAiExtractionJson(content);
  }
  throw new Error(lastError);
}

const MIN_CHUNK_ROWS = 5;

function mergeExtractions(a: PharmaBatchExtraction, b: PharmaBatchExtraction): PharmaBatchExtraction {
  return {
    tokens: [...a.tokens, ...b.tokens],
    ambiguous: [...a.ambiguous, ...b.ambiguous],
  };
}

/**
 * Calls OpenAI; on truncated response, splits the batch and retries smaller chunks.
 */
export async function extractPharmaBatchResilient(
  rows: PharmaCsvRow[],
  options?: { model?: string; maxTokens?: number; minChunk?: number },
): Promise<PharmaBatchExtraction> {
  const minChunk = options?.minChunk ?? MIN_CHUNK_ROWS;
  if (rows.length === 0) return { tokens: [], ambiguous: [] };

  try {
    return await extractPharmaBatchWithAi(rows, options);
  } catch (err) {
    if (!isTruncatedAiError(err) || rows.length <= minChunk) throw err;

    const mid = Math.ceil(rows.length / 2);
    const first = rows.slice(0, mid);
    const second = rows.slice(mid);
    console.log(
      `  ↳ risposta troncata su ${rows.length} righe → split ${first.length} + ${second.length}`,
    );

    const left = await extractPharmaBatchResilient(first, options);
    const right = await extractPharmaBatchResilient(second, options);
    return mergeExtractions(left, right);
  }
}

function parseAiExtractionJson(content: string): PharmaBatchExtraction {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`JSON AI non valido: ${content.slice(0, 200)}`);
  }

  const root = parsed as {
    tokens?: unknown;
    byCategory?: unknown;
    ambiguous?: unknown;
  };

  const tokens: ExtractedPharmaToken[] = [];

  if (root.byCategory && typeof root.byCategory === 'object') {
    for (const [category, values] of Object.entries(root.byCategory as Record<string, unknown>)) {
      if (!isPharmaCategoryName(category) || !Array.isArray(values)) continue;
      for (const v of values) {
        const text = normalizeTokenText(String(v ?? ''));
        if (text) tokens.push({ text, category });
      }
    }
  }

  if (Array.isArray(root.tokens)) {
    for (const item of root.tokens) {
      if (!item || typeof item !== 'object') continue;
      const text = normalizeTokenText(String((item as { text?: unknown }).text ?? ''));
      const category = String((item as { category?: unknown }).category ?? '').trim();
      if (!text || !isPharmaCategoryName(category)) continue;
      tokens.push({ text, category });
    }
  }

  const ambiguous: PharmaBatchExtraction['ambiguous'] = [];
  if (Array.isArray(root.ambiguous)) {
    for (const item of root.ambiguous) {
      if (!item || typeof item !== 'object') continue;
      const text = normalizeTokenText(String((item as { text?: unknown }).text ?? ''));
      const chosen = String((item as { chosen?: unknown }).chosen ?? '').trim();
      const rawCandidates = (item as { candidates?: unknown }).candidates;
      if (!text || !isPharmaCategoryName(chosen)) continue;
      const candidates = Array.isArray(rawCandidates)
        ? rawCandidates
            .map((c) => String(c).trim())
            .filter((c): c is PharmaCategoryName => isPharmaCategoryName(c))
        : [];
      ambiguous.push({ text, chosen, candidates });
    }
  }

  return { tokens, ambiguous };
}
