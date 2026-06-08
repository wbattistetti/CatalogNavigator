/**
 * Post-processes AI confirmation responses into slot → text map.
 */

export interface LeafConfirmationInput {
  slot_filling: string;
  description: string;
}

function normalizeSlotKey(slot: string): string {
  return slot.toLowerCase().replace(/_/g, ' ');
}

/** Normalizes raw AI confirmation rows into a slot → confirmation_text map. */
export function processConfirmationAiResponse(
  expectedSlots: string[],
  rawRows: unknown[],
): Map<string, string> {
  const byExact = new Map<string, string>();
  const byNormalized = new Map<string, string>();

  for (const raw of rawRows) {
    const row = raw as Record<string, unknown>;
    const slot = row.slot_filling ?? row.slot ?? row.path;
    const text = row.confirmation_text ?? row.confirmation ?? row.text;
    if (typeof slot !== 'string' || !slot.trim()) continue;
    if (typeof text !== 'string' || !text.trim()) continue;
    const key = slot.trim();
    byExact.set(key, text.trim());
    byNormalized.set(normalizeSlotKey(key), text.trim());
  }

  const result = new Map<string, string>();
  const missing: string[] = [];

  for (const slot of expectedSlots) {
    const text = byExact.get(slot) ?? byNormalized.get(normalizeSlotKey(slot));
    if (!text) missing.push(slot);
    else result.set(slot, text);
  }

  if (missing.length > 0) {
    throw new Error(`Conferme mancanti per: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`);
  }

  return result;
}
