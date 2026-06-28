/**
 * Build VB session state from category+token pairs injected before chat starts.
 */
import type { AgentConcept, AgentSessionState } from './agentBundleTypes';
import { initAgentSession } from './agentBundleTypes';
import type { TokenCategory } from './dictionaryTree';

export interface InjectedConceptPair {
  categoryName: string;
  token: string;
}

/** Categories eligible for injection (must have at least one token). */
export function injectableCategories(categories: TokenCategory[]): TokenCategory[] {
  return categories.filter((c) => c.tokenTexts.length > 0);
}

/** Replace any existing pair for the same category, then append. */
export function upsertInjectedPair(
  pairs: InjectedConceptPair[],
  pair: InjectedConceptPair,
): InjectedConceptPair[] {
  const categoryName = pair.categoryName.trim();
  const token = pair.token.trim();
  if (!categoryName || !token) return pairs;
  return [
    ...pairs.filter((p) => p.categoryName !== categoryName),
    { categoryName, token },
  ];
}

/** Maps injected pairs to a pre-loaded AgentSessionState for the VB engine. */
export function buildSessionFromInjectedPairs(
  pairs: InjectedConceptPair[],
  categories: TokenCategory[],
): AgentSessionState {
  if (pairs.length === 0) return initAgentSession();

  const byName = new Map(categories.map((c) => [c.name, c]));
  const acquiredConcepts: AgentConcept[] = [];
  const exactAttributoCategories: string[] = [];

  for (const pair of pairs) {
    const cat = byName.get(pair.categoryName);
    const kind = cat?.type === 'vincolo' ? 'vincolo' as const : 'attributo' as const;
    acquiredConcepts.push({
      category: pair.categoryName,
      values: [pair.token],
      kind,
    });
    if (kind === 'attributo') {
      exactAttributoCategories.push(pair.categoryName);
    }
  }

  return {
    ...initAgentSession(),
    acquiredConcepts,
    exactAttributoCategories,
  };
}
