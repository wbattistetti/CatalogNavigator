/**
 * Bridge between dictionary pointer-drag and corpus extra-column drop handling.
 * TokenTreeEditor uses mouse events (not HTML5 DnD); CorpusGlideGrid registers the drop target.
 */
import { logCorpusExtraDrop } from './corpusExtraDropDebug';

export type CorpusExtraDropHandler = (
  clientX: number,
  clientY: number,
  tokens: readonly string[],
) => boolean;

let registeredHandler: CorpusExtraDropHandler | null = null;

export function registerCorpusExtraDropHandler(handler: CorpusExtraDropHandler | null): void {
  registeredHandler = handler;
  logCorpusExtraDrop('bridge.register', { active: handler != null });
}

export function tryCorpusExtraTokenDrop(
  clientX: number,
  clientY: number,
  tokens: readonly string[],
): boolean {
  logCorpusExtraDrop('bridge.tryDrop', {
    clientX,
    clientY,
    tokens: [...tokens],
    hasHandler: registeredHandler != null,
  });
  if (!registeredHandler || tokens.length === 0) return false;
  return registeredHandler(clientX, clientY, tokens);
}
