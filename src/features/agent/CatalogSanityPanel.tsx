/**
 * Catalog integrity report UI with item / segment exclusion actions.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Ban, ChevronDown, MinusCircle } from 'lucide-react';
import type { CatalogSanityReport } from '../../lib/catalogSanity';
import type { CorpusItemExclusions } from '../../lib/corpusItemPaths';

export interface CatalogSanityPanelProps {
  report: CatalogSanityReport | null | undefined;
  itemExclusions: CorpusItemExclusions;
  onExcludeItem: (sourceText: string) => void;
  onRestoreItem: (sourceText: string) => void;
  onExcludeAllSegments: (sourceText: string, segmentText: string) => void;
  onExcludeSegmentOccurrence: (
    sourceText: string,
    segmentText: string,
    occurrenceIndex1Based: number,
  ) => void;
  /** compact = embedded strip; page = full report tab */
  variant?: 'compact' | 'page';
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function PathLine({ path, isPage }: { path: string; isPage: boolean }) {
  const value = isPage ? path.trim() : truncate(path, 80);
  if (isPage) {
    return (
      <div className="rounded bg-[#061008] border border-emerald-400/25 px-3 py-2">
        <span className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">
          Path catalogo
        </span>
        <span className="block font-mono text-sm leading-relaxed text-cyan-100 break-all">
          {value}
        </span>
      </div>
    );
  }
  return (
    <span className="font-mono text-xs text-cyan-200/90 break-all">{value}</span>
  );
}

function SourceLine({ text, excluded, isPage }: { text: string; excluded: boolean; isPage: boolean }) {
  const value = isPage ? text.trim() : truncate(text, 100);
  if (isPage) {
    return (
      <div>
        <span className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">
          Descrizione corpus
        </span>
        <span
          className={`block font-mono text-sm leading-relaxed break-all ${
            excluded ? 'text-emerald-500/60 line-through' : 'text-emerald-50'
          }`}
        >
          {value}
        </span>
      </div>
    );
  }
  return (
    <span className={`min-w-0 break-all ${excluded ? 'text-emerald-500/60 line-through' : 'text-emerald-100'}`}>
      {value}
    </span>
  );
}

const actionBtnPage = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded border font-mono text-sm transition-colors';
const actionBtnCompact = 'inline-flex items-center gap-0.5 font-mono text-xs';

function ReportAccordion({
  id,
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [id, defaultOpen]);

  return (
    <div className="rounded-lg border border-amber-400/35 bg-amber-950/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={`report-panel-${id}`}
        className="w-full flex items-start gap-2 px-4 py-3 text-left hover:bg-amber-400/8 transition-colors"
      >
        <ChevronDown
          className={`w-4 h-4 flex-shrink-0 mt-0.5 text-amber-300 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <span className="block text-sm font-semibold text-amber-50">{title}</span>
          {subtitle && (
            <span className={`block text-sm text-amber-200/95 break-all ${open ? 'line-clamp-2' : ''}`}>
              {subtitle}
            </span>
          )}
        </div>
      </button>
      {open && (
        <div id={`report-panel-${id}`} className="px-4 pb-4 pt-0 space-y-3 border-t border-amber-400/20">
          {children}
        </div>
      )}
    </div>
  );
}

export function CatalogSanityPanel({
  report,
  itemExclusions,
  onExcludeItem,
  onRestoreItem,
  onExcludeAllSegments,
  onExcludeSegmentOccurrence,
  variant = 'compact',
}: CatalogSanityPanelProps) {
  if (!report) return null;
  const hasIssues = report.duplicates.length > 0 || report.repeatedTokens.length > 0;
  if (!hasIssues) return null;

  const isPage = variant === 'page';

  return (
    <div className={`${isPage ? 'min-h-0' : 'flex-shrink-0 border-t border-amber-400/25 bg-amber-400/5'}`}>
      {!isPage && (
        <div className="px-3 py-2 flex items-center gap-2 border-b border-amber-400/15">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-300 flex-shrink-0" />
          <span className="font-mono text-xs font-semibold text-amber-100 uppercase tracking-wide">
            Integrità catalogo
          </span>
          <span className="font-mono text-xs text-amber-200/90">
            {report.duplicates.length} duplicati · {report.repeatedTokens.length} token ripetuti
          </span>
        </div>
      )}

      <div className={`${isPage ? 'px-5 py-5 space-y-8' : 'max-h-48 overflow-auto px-3 py-2 space-y-3'} font-mono ${isPage ? 'text-sm' : 'text-xs'}`}>
        {report.duplicates.length > 0 && (
          <section className={isPage ? 'space-y-5' : 'space-y-3'}>
            {isPage && (
              <h3 className="text-base font-bold uppercase tracking-wide text-amber-100 border-b border-amber-400/35 pb-2">
                Duplicati ({report.duplicates.length})
              </h3>
            )}
            {report.duplicates.map((group, groupIndex) => {
              const groupBody = (
                <>
                  <div className="rounded bg-black/25 border border-amber-400/20 px-3 py-2">
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-amber-300 mb-1">
                      Firma segmentazione
                    </span>
                    <span className="block text-sm leading-relaxed text-amber-50 break-all">
                      {group.fingerprint}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-amber-100/95">
                    Questi item hanno la stessa segmentazione nel catalogo: l&apos;agente non può distinguerli.
                    Escludi quelli non rilevanti o correggi il dizionario.
                  </p>
                  <ul className="space-y-3">
                    {group.items.map((item) => {
                      const excluded = itemExclusions.has(item.sourceText.trim());
                      return (
                        <li
                          key={`${group.fingerprint}:${item.path}`}
                          className="rounded-lg border border-emerald-400/30 bg-[#0a1510] p-4 flex flex-col gap-3"
                        >
                          <SourceLine text={item.sourceText} excluded={excluded} isPage={isPage} />
                          <PathLine path={item.path} isPage={isPage} />
                          {excluded ? (
                            <button
                              type="button"
                              onClick={() => onRestoreItem(item.sourceText)}
                              className="self-start text-sky-300 hover:text-sky-100 underline text-sm"
                            >
                              Ripristina item
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onExcludeItem(item.sourceText)}
                              className={`self-start ${actionBtnPage} border-amber-400/50 text-amber-50 hover:bg-amber-400/15`}
                            >
                              <Ban className="w-4 h-4" />
                              Escludi item
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              );

              if (!isPage) {
                return (
                  <div key={group.fingerprint} className="space-y-1">
                    <p className="text-amber-200/85">
                      {`Duplicati (${group.items.length})`}
                      {' — firma: '}
                      <span className="text-amber-100 break-all">{truncate(group.fingerprint, 120)}</span>
                    </p>
                    <ul className="space-y-3 pl-2 border-l border-amber-400/20">
                      {group.items.map((item) => {
                        const excluded = itemExclusions.has(item.sourceText.trim());
                        return (
                          <li key={`${group.fingerprint}:${item.path}`} className="flex flex-wrap items-center gap-2">
                            <SourceLine text={item.sourceText} excluded={excluded} isPage={false} />
                            <PathLine path={item.path} isPage={false} />
                            {excluded ? (
                              <button type="button" onClick={() => onRestoreItem(item.sourceText)} className="text-sky-300 hover:text-sky-100 underline text-xs">
                                Ripristina item
                              </button>
                            ) : (
                              <button type="button" onClick={() => onExcludeItem(item.sourceText)} className={`${actionBtnCompact} border-amber-400/50 text-amber-50`}>
                                <Ban className="w-3 h-3" />
                                Escludi item
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              }

              return (
                <ReportAccordion
                  key={group.fingerprint}
                  id={group.fingerprint}
                  title={`Gruppo · ${group.items.length} item indistinguibili`}
                  subtitle={group.fingerprint}
                  defaultOpen={groupIndex === 0}
                >
                  {groupBody}
                </ReportAccordion>
              );
            })}
          </section>
        )}

        {report.repeatedTokens.length > 0 && (
          <section className={isPage ? 'space-y-5' : 'space-y-3'}>
            {isPage && (
              <h3 className="text-base font-bold uppercase tracking-wide text-amber-100 border-b border-amber-400/35 pb-2">
                Token ripetuti ({report.repeatedTokens.length})
              </h3>
            )}
            {report.repeatedTokens.map((row, rowIndex) => {
              const rowKey = `${row.path}:${row.categoryName}:${row.segmentText}`;
              const excluded = itemExclusions.has(row.sourceText.trim());
              const rowTitle = `Token «${row.segmentText}» · ${row.categoryName}`;
              const rowSubtitle = `${row.collapsedCatalogKey} · ${row.path}`;

              const rowBody = (
                <>
                  <p className="text-sm leading-relaxed text-amber-100/95">
                    Occorrenze nel path: <strong className="text-amber-50">{row.occurrenceIndices.join(', ')}</strong>.
                    Escludi una singola occorrenza per differenziare le voci.
                  </p>
                  <SourceLine text={row.sourceText} excluded={excluded} isPage={isPage} />
                  <PathLine path={row.path} isPage={isPage} />
                  {!excluded && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {row.occurrenceIndices.map((idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => onExcludeSegmentOccurrence(row.sourceText, row.segmentText, idx)}
                          className={`${isPage ? actionBtnPage : actionBtnCompact} border-amber-400/50 text-amber-50 hover:bg-amber-400/15`}
                        >
                          <MinusCircle className={isPage ? 'w-4 h-4' : 'w-3 h-3'} />
                          Escludi «{row.segmentText}» #{idx}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => onExcludeAllSegments(row.sourceText, row.segmentText)}
                        className={`${isPage ? actionBtnPage : actionBtnCompact} border-amber-400/40 text-amber-100 hover:bg-amber-400/15`}
                      >
                        <MinusCircle className={isPage ? 'w-4 h-4' : 'w-3 h-3'} />
                        Escludi tutte le occorrenze
                      </button>
                      <button
                        type="button"
                        onClick={() => onExcludeItem(row.sourceText)}
                        className={`${isPage ? actionBtnPage : actionBtnCompact} border-amber-400/35 text-amber-100 hover:bg-amber-400/15`}
                      >
                        <Ban className={isPage ? 'w-4 h-4' : 'w-3 h-3'} />
                        Escludi item intero
                      </button>
                    </div>
                  )}
                  {excluded && (
                    <button
                      type="button"
                      onClick={() => onRestoreItem(row.sourceText)}
                      className={`text-sky-300 hover:text-sky-100 underline ${isPage ? 'text-sm' : 'text-xs'}`}
                    >
                      Ripristina item
                    </button>
                  )}
                </>
              );

              if (!isPage) {
                return (
                  <div key={rowKey} className="space-y-1">
                    <p className={`text-amber-200/85 ${excluded ? 'line-through opacity-60' : ''}`}>
                      {rowTitle}
                      {' → '}catalogo «{row.collapsedCatalogKey}»
                    </p>
                    {rowBody}
                  </div>
                );
              }

              return (
                <ReportAccordion
                  key={rowKey}
                  id={rowKey}
                  title={rowTitle}
                  subtitle={rowSubtitle}
                  defaultOpen={rowIndex === 0 && report.duplicates.length === 0}
                >
                  {rowBody}
                </ReportAccordion>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
