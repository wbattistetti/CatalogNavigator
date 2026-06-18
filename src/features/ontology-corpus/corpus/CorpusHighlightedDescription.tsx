/**
 * Description text with highlighted dictionary token spans.
 */
import { memo, useMemo, type ReactNode } from 'react';
import type { TokenCategory } from '../../../lib/dictionaryTree';
import type { HighlightSpan, MatchPhrase } from '../../../lib/tokenDictionary';
import { findHighlightSpansFromPhrases } from '../../../lib/tokenDictionary';
import type { LoadedDictionaryRef } from '../../../lib/multiDictionarySegment';
import { resolveChipAppearance } from '../../../lib/categoryIconCatalog';
import { SelectableCorpusChip } from './SelectableCorpusChip';

function CorpusHighlightedDescription({
  text,
  matchPhrases,
  liveLoadedRefs,
  editingDictionaryId,
  editingCategories,
  onRemoveSpan,
  editableCanonicalSet,
}: {
  text: string;
  matchPhrases: MatchPhrase[];
  liveLoadedRefs: LoadedDictionaryRef[];
  editingDictionaryId: string | null;
  editingCategories: TokenCategory[];
  onRemoveSpan: (span: HighlightSpan) => void;
  editableCanonicalSet: ReadonlySet<string>;
}) {
  const spans = useMemo(
    () => findHighlightSpansFromPhrases(text, matchPhrases),
    [text, matchPhrases],
  );

  if (spans.length === 0) {
    return (
      <span className="text-emerald-300/80" data-source-start={0} data-source-end={text.length}>
        {text}
      </span>
    );
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  spans.forEach((span, i) => {
    if (span.start > cursor) {
      parts.push(
        <span key={`t-${i}`} data-source-start={cursor} data-source-end={span.start}>
          {text.slice(cursor, span.start)}
        </span>,
      );
    }
    const canonical = span.canonical;
    const categorizable = editableCanonicalSet.has(canonical);
    const appearance = resolveChipAppearance(
      canonical,
      liveLoadedRefs,
      editingDictionaryId,
      editingCategories,
    );
    parts.push(
      <span key={`h-${i}`} className="inline-block mx-0.5 my-0.5 align-baseline">
        <SelectableCorpusChip
          canonical={canonical}
          categorizable={categorizable}
          label={text.slice(span.start, span.end)}
          sourceStart={span.start}
          sourceEnd={span.end}
          showAliasHint={false}
          variant={span.isAlias ? 'alias' : 'token'}
          aliasOf={span.isAlias ? span.canonical : undefined}
          iconKey={appearance.iconKey}
          iconColor={appearance.iconColor}
          categoryColor={appearance.categoryColor}
          iconTitle={appearance.title}
          dictScope={appearance.scope}
          onRemove={() => onRemoveSpan(span)}
        />
      </span>,
    );
    cursor = span.end;
  });
  if (cursor < text.length) {
    parts.push(
      <span key="tail" data-source-start={cursor} data-source-end={text.length}>
        {text.slice(cursor)}
      </span>,
    );
  }

  return <span className="text-emerald-300/80 leading-relaxed">{parts}</span>;
}

export const MemoCorpusHighlightedDescription = memo(
  CorpusHighlightedDescription,
  (prev, next) =>
    prev.text === next.text
    && prev.matchPhrases === next.matchPhrases
    && prev.liveLoadedRefs === next.liveLoadedRefs
    && prev.editingDictionaryId === next.editingDictionaryId
    && prev.editingCategories === next.editingCategories
    && prev.onRemoveSpan === next.onRemoveSpan
    && prev.editableCanonicalSet === next.editableCanonicalSet,
);
