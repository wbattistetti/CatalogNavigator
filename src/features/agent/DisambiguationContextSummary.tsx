/**
 * Author-facing context for a disambiguation step: acquired path, candidates, options.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { isMultiChoiceCopySignature } from '../../lib/compileDisambiguationPlan';
import {
  DISAMBIGUATION_MULTI_CHOICE_THRESHOLD,
} from '../../lib/disambiguationPlanTypes';
import {
  formatAcquiredContext,
  formatHumanOptions,
  isVincoloAskSignature,
} from '../../lib/disambiguationPlanMessages';
import type { DisambiguationQuestionStyle } from '../../lib/disambiguationPlanTypes';
import {
  buildDisambiguationPathsLabel,
  formatDisambiguationParentLines,
  hasMultipleDisambiguationContexts,
  resolveDisambiguationContextVariants,
  type DisambiguationContextVariant,
  type DisambiguationParentInfo,
} from '../../lib/disambiguationParents';

const META = 'font-mono text-sm leading-relaxed';
const CONTEXT_LABEL = `${META} text-emerald-300/80`;
const CONTEXT_VALUE = `${META} text-emerald-200/85 break-all`;
const CONTEXT_ACQUIRED = `${META} text-emerald-300/75 break-words pl-4`;
const PATHS_LABEL = `${META} text-emerald-300/80`;
const PATHS_ITEM = `${META} text-emerald-200/80 break-all`;
const OPTIONS_LABEL = `${META} text-sky-300/85`;
const OPTIONS_ITEM = `${META} text-sky-200/90 break-words`;
const HINT = `${META} text-amber-300/85`;
const TECH = `${META} text-emerald-300/75 break-all`;
const DIVERSE_LINK = `${META} text-amber-300/85 underline underline-offset-2 hover:text-amber-200 cursor-pointer`;

function sortPaths(paths: string[]): string[] {
  return [...paths].sort((a, b) => a.localeCompare(b, 'it'));
}

function visibleOptions(options: string[]): string[] {
  return options.filter((o) => o !== 'none');
}

function inferOptionsStyle(
  signature: string | undefined,
  style: DisambiguationQuestionStyle | undefined,
): DisambiguationQuestionStyle {
  if (style) return style;
  if (signature && isVincoloAskSignature(signature)) return 'ask_age';
  return 'choice';
}

export interface DisambiguationContextSummaryProps {
  categoryName: string;
  parentInfo?: DisambiguationParentInfo | null;
  contextVariants?: DisambiguationContextVariant[];
  candidatePaths?: string[];
  options?: string[];
  style?: DisambiguationQuestionStyle;
  signature?: string;
  defaultPathsOpen?: boolean;
  /** Collapsed debug metadata (editor panel). */
  technicalMeta?: {
    styleLabel: string;
    contextCount: number;
    sampleAcquired: string;
    signature?: string;
  };
}

export function DisambiguationContextSummary({
  categoryName,
  parentInfo,
  contextVariants,
  candidatePaths = [],
  options = [],
  style,
  signature,
  defaultPathsOpen = false,
  technicalMeta,
}: DisambiguationContextSummaryProps) {
  const contextLines = parentInfo ? formatDisambiguationParentLines(parentInfo) : null;
  const variants = resolveDisambiguationContextVariants(parentInfo, contextVariants);
  const multipleContexts = hasMultipleDisambiguationContexts(parentInfo, variants);
  const sortedPaths = sortPaths(candidatePaths.filter((p) => p.trim()));
  const resolvedStyle = inferOptionsStyle(signature, style);
  const visible = visibleOptions(options);
  const isOpenMulti = !!signature && isMultiChoiceCopySignature(signature);
  const showOptionBullets = visible.length > 0
    && visible.length <= DISAMBIGUATION_MULTI_CHOICE_THRESHOLD
    && resolvedStyle !== 'ask_age';

  return (
    <div className="space-y-2 mt-2">
      {(contextLines || multipleContexts) && (
        <DisambiguationContextBlock
          contextLines={contextLines}
          variants={variants}
          multipleContexts={multipleContexts}
        />
      )}

      {sortedPaths.length > 0 && (
        <DisambiguationPathsList
          categoryName={categoryName}
          paths={sortedPaths}
          defaultOpen={defaultPathsOpen}
        />
      )}

      {options.length > 0 && resolvedStyle !== 'ask_age' && (
        <DisambiguationOptionsList
          options={options}
          style={resolvedStyle}
          isOpenMulti={isOpenMulti}
          showBullets={showOptionBullets}
        />
      )}

      {resolvedStyle === 'ask_age' && options.length > 0 && (
        <VincoloOptionsAccordion options={options} />
      )}

      {technicalMeta && (
        <TechnicalDetailsAccordion meta={technicalMeta} />
      )}

      {signature && !technicalMeta && (
        <TechnicalSignatureAccordion signature={signature} />
      )}
    </div>
  );
}

function DisambiguationContextBlock({
  contextLines,
  variants,
  multipleContexts,
}: {
  contextLines: { label: string; value: string } | null;
  variants: DisambiguationContextVariant[];
  multipleContexts: boolean;
}) {
  const [open, setOpen] = useState(false);
  const primary = variants[0] ?? (contextLines ? { pathPrefix: contextLines.value, acquired: {} } : null);

  if (!primary) return null;

  const label = contextLines?.label ?? 'Contesto';
  const diverseCount = variants.length > 1 ? variants.length : 0;

  return (
    <div className="space-y-0.5">
      <p className={CONTEXT_LABEL}>
        {label}:{' '}
        <span className={CONTEXT_VALUE}>{primary.pathPrefix}</span>
      </p>

      {multipleContexts && diverseCount > 1 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={`flex items-center gap-1.5 ${DIVERSE_LINK} w-full text-left`}
            aria-expanded={open}
          >
            <ChevronDown
              className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
            />
            Contesti diversi ({diverseCount})
          </button>
          {open && (
            <div className="space-y-2 mt-1 pl-[18px]">
              <p className={HINT}>
                Stessa disambiguazione in situazioni diverse: evita un riferimento fisso nel testo
                o usa formulazione generica.
              </p>
              <ul className={`space-y-2 ${CONTEXT_VALUE} list-none`}>
                {variants.map((variant) => {
                  const acquiredLabel = formatAcquiredContext(variant.acquired);
                  const hasAcquired = acquiredLabel !== '—';
                  return (
                    <li key={`${variant.pathPrefix}||${acquiredLabel}`} className="space-y-0.5">
                      <p>{variant.pathPrefix}</p>
                      {hasAcquired && (
                        <p className={CONTEXT_ACQUIRED}>{acquiredLabel}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DisambiguationPathsList({
  categoryName,
  paths,
  defaultOpen,
}: {
  categoryName: string;
  paths: string[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const label = buildDisambiguationPathsLabel(categoryName);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-start gap-1.5 ${PATHS_LABEL} hover:text-emerald-200 w-full text-left`}
        aria-expanded={open}
      >
        <ChevronDown
          className={`w-3 h-3 flex-shrink-0 mt-0.5 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        <span>
          {label}
          {' '}
          <span className="text-emerald-300/70">({paths.length})</span>
        </span>
      </button>
      {open && (
        <ul className={`mt-1 max-h-36 overflow-y-auto space-y-0.5 ${PATHS_ITEM} list-disc pl-[18px]`}>
          {paths.map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DisambiguationOptionsList({
  options,
  style,
  isOpenMulti,
  showBullets,
}: {
  options: string[];
  style: DisambiguationQuestionStyle;
  isOpenMulti: boolean;
  showBullets: boolean;
}) {
  const visible = visibleOptions(options);

  return (
    <div className="space-y-1">
      <p className={OPTIONS_LABEL}>
        {showBullets
          ? `Opzioni tra cui scegliere (${visible.length})`
          : formatHumanOptions(options, style)}
      </p>
      {showBullets && (
        <ul className={`space-y-0.5 ${OPTIONS_ITEM} list-disc pl-4`}>
          {visible.map((opt) => (
            <li key={opt}>{opt}</li>
          ))}
          {options.includes('none') && (
            <li className="text-sky-400/45">none (assente nel path)</li>
          )}
        </ul>
      )}
      {isOpenMulti && (
        <p className={HINT}>
          Scelta aperta: puoi decidere se citare tutte le opzioni nel testo o lasciare una domanda generica.
        </p>
      )}
    </div>
  );
}

function VincoloOptionsAccordion({ options }: { options: string[] }) {
  const [open, setOpen] = useState(false);
  const sorted = [...options].sort((a, b) => a.localeCompare(b, 'it'));

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 ${OPTIONS_LABEL} hover:text-sky-400/90 w-full text-left`}
        aria-expanded={open}
      >
        <ChevronDown
          className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        Token vincolo ({options.length})
      </button>
      {open && (
        <p className={`${OPTIONS_ITEM} mt-1 pl-[18px] max-h-28 overflow-y-auto`}>
          {sorted.join(' · ')}
        </p>
      )}
    </div>
  );
}

function TechnicalSignatureAccordion({ signature }: { signature: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pt-1 border-t border-[#1a3a2a]/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 ${TECH} hover:text-emerald-200 w-full text-left`}
        aria-expanded={open}
      >
        <ChevronDown
          className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        Dettagli tecnici
      </button>
      {open && (
        <p className={`${TECH} mt-1 pl-[18px]`}>{signature}</p>
      )}
    </div>
  );
}

function TechnicalDetailsAccordion({
  meta,
}: {
  meta: NonNullable<DisambiguationContextSummaryProps['technicalMeta']>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pt-1 border-t border-[#1a3a2a]/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 ${TECH} hover:text-emerald-200 w-full text-left`}
        aria-expanded={open}
      >
        <ChevronDown
          className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        Dettagli tecnici
      </button>
      {open && (
        <div className={`mt-1 pl-[18px] space-y-0.5 ${TECH}`}>
          {meta.signature && <p>Firma: {meta.signature}</p>}
          <p>
            Tipo: {meta.styleLabel}
            {' · '}
            {meta.contextCount} contesti dialogo
          </p>
          <p>Esempio acquisito: {meta.sampleAcquired}</p>
        </div>
      )}
    </div>
  );
}
