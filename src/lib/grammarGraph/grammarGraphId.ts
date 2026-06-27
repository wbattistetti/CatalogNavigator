/**
 * Safe UUID generation for grammar graph entities.
 */

export function generateGrammarId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `g-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
