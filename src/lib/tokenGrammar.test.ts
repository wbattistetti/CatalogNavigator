import { describe, expect, it } from 'vitest';
import {
  applyTemplateGrammarsToTokens,
  findTokensMissingGrammar,
  isTokenGrammarComplete,
} from './tokenGrammar';
import type { TokenEntry } from './tokenDictionary';

describe('findTokensMissingGrammar', () => {
  it('matches dictionary tokens case-insensitively against lowercase tree segments', () => {
    const tokens: TokenEntry[] = [
      {
        text: 'Cardiologia',
        enabled: true,
        grammar: {
          regex: '(?<cardiologia>cardiologia|Cardiologia)',
          mappings: { cardiologia: 'Cardiologia' },
        },
      },
    ];
    const slots = ['cardiologia', 'cardiologia.ecg'];

    expect(findTokensMissingGrammar(slots, tokens)).toEqual([]);
  });

  it('counts missing grammar when token exists but grammar is absent', () => {
    const tokens: TokenEntry[] = [{ text: 'cardiologia', enabled: true }];
    expect(findTokensMissingGrammar(['cardiologia'], tokens)).toEqual(['cardiologia']);
  });

  it('applyTemplateGrammarsToTokens clears missing count for case-mismatched tokens', () => {
    const tokens: TokenEntry[] = [{ text: 'Cardiologia', enabled: true }];
    const next = applyTemplateGrammarsToTokens(tokens, false);
    expect(isTokenGrammarComplete(next[0]!)).toBe(true);
    expect(findTokensMissingGrammar(['cardiologia'], next)).toEqual([]);
  });
});
