import { describe, expect, it } from 'vitest';
import { EDITOR_TAB_IDS } from './editorTabIds';
import {
  createSplitLayout,
  normalizeSplitLayout,
} from './documentEditorSplitLayout';

describe('documentEditorSplitLayout', () => {
  it('creates split with clamped ratio', () => {
    expect(createSplitLayout(
      EDITOR_TAB_IDS.document,
      EDITOR_TAB_IDS.agent,
      10,
    )).toEqual({
      type: 'split',
      primary: EDITOR_TAB_IDS.document,
      secondary: EDITOR_TAB_IDS.agent,
      ratio: 20,
    });
  });

  it('collapses invalid split layouts', () => {
    const visible = new Set([EDITOR_TAB_IDS.document, EDITOR_TAB_IDS.agent]);
    expect(normalizeSplitLayout({
      type: 'split',
      primary: EDITOR_TAB_IDS.document,
      secondary: EDITOR_TAB_IDS.ontology,
      ratio: 50,
    }, visible)).toEqual({ type: 'single' });
  });
});
