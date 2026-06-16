/**
 * Spoken hints for deterministic agent dialog (rephrased naturally by ConvAI).
 */

/** Yes/no style hint when a single value is inferred from candidates. */
export function formatImplicitSlotConfirmHint(categoryName: string, token: string): string {
  const cat = categoryName.trim().toLowerCase();
  const t = token.trim().toLowerCase();

  if (cat.includes('tipo') && cat.includes('visita')) {
    if (t === 'prima') return 'È una prima visita?';
    if (t === 'controllo') return 'È una visita di controllo?';
  }

  return `Per ${categoryName}, si tratta di «${token}»?`;
}

/** @deprecated Use formatImplicitSlotConfirmHint */
export const formatSingleOptionConfirmHint = formatImplicitSlotConfirmHint;

/** Builds a spoken hint for attribute disambiguation (≥2 options). */
export function buildAttributeSpokenHint(
  categoryName: string,
  options: string[],
): string {
  if (options.length === 2) {
    return `Per ${categoryName}, preferisce ${options[0]} o ${options[1]}?`;
  }
  if (options.length > 2) {
    const listed = options.slice(0, -1).join(', ');
    return `Per ${categoryName}, preferisce ${listed} o ${options[options.length - 1]}?`;
  }
  return `Può specificare ${categoryName}?`;
}
