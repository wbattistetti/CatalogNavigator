import { describe, expect, it } from 'vitest';
import { applyCategoryGrammars } from './categoryGrammar';
import { buildCategoryGrammarBulkIndex, matchAllCategoryGrammarValuesBulk } from './categoryGrammarBulkIndex';
import type { TokenCategory } from './dictionaryTree';
import type { TokenEntry } from './tokenDictionary';

describe('categoryGrammarBulkIndex', () => {
  it('matches same values as slow path for category grammar', () => {
    const categories: TokenCategory[] = [
      { id: 'c1', name: 'specialità', order: 0, tokenTexts: ['cardiologica'], type: 'attributo' },
      { id: 'c2', name: 'tipo visita', order: 1, tokenTexts: ['prima'], type: 'attributo' },
    ];
    const tokens: TokenEntry[] = [
      { text: 'cardiologica', enabled: true },
      { text: 'prima', enabled: true },
    ];
    const withGrammar = applyCategoryGrammars(categories, tokens, true);
    const index = buildCategoryGrammarBulkIndex(withGrammar, tokens);
    const text = 'visita cardiologica prima';

    const bulk = matchAllCategoryGrammarValuesBulk(text, index.categories[0]!, undefined);
    const bulk2 = matchAllCategoryGrammarValuesBulk(text, index.categories[1]!, undefined);

    expect(bulk).toContain('cardiologica');
    expect(bulk2).toContain('prima');
  });
});
