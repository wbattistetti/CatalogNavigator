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
  formatHumanOptions,
  isVincoloAskSignature,
} from '../../lib/disambiguationPlanMessages';
import type { DisambiguationQuestionStyle } from '../../lib/disambiguationPlanTypes';
import {
  buildDisambiguationPathsLabel,
  hasMultipleDisambiguationContexts,
  resolveDisambiguationContextVariants,
  type DisambiguationContextVariant,
  type DisambiguationParentInfo,
} from '../../lib/disambiguationParents';
import {
  resolveDisambiguationDisplayContext,
  type DisambiguationDisplayContext,
} from '../../lib/disambiguationContextDisplay';
import type { TokenCategory } from '../../lib/dictionaryTree';

const META = 'font-mono text-sm leading-relaxed';
const CONTEXT_LABEL = `${META} text-emerald-300/80`;
const CONTEXT_VALUE = `${META} text-emerald-200/85 break-all`;
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
  /** Example acquired dialog slots for this signature (editor). */
  sampleAcquired?: Record<string, string>;
  /** Dictionary categories for labeled slot display. */
  categories?: TokenCategory[];
  /** Hide acquired-context block when the parent header already shows it (editor panel). */
  hideAcquiredContext?: boolean;
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
  sampleAcquired,
  categories = [],
  hideAcquiredContext = false,
  technicalMeta,
}: DisambiguationContextSummaryProps) {
  const variants = resolveDisambiguationContextVariants(
    parentInfo,
    contextVariants,
    candidatePaths,
    sampleAcquired,
  );
  const multipleContexts = hasMultipleDisambiguationContexts(parentInfo, variants);
  const sortedPaths = sortPaths(candidatePaths.filter((p) => p.trim()));
  const resolvedStyle = inferOptionsStyle(signature, style);
  const isOpenMulti = !!signature && isMultiChoiceCopySignature(signature);
  const showOptionBullets = visibleOptions(options).length > 0
    && visibleOptions(options).length <= DISAMBIGUATION_MULTI_CHOICE_THRESHOLD
    && resolvedStyle !== 'ask_age';

  const showTriggerBlock = variants.length > 0
    && (!hideAcquiredContext || variants.length > 1);

  return (
    <div className="space-y-2 mt-2">
      {showTriggerBlock && (
        <DisambiguationTriggerBlock
          variants={variants}
          multipleContexts={multipleContexts || variants.length > 1}
          categories={categories}
          compactOnly={hideAcquiredContext}
        />
      )}

      {options.length > 0 && resolvedStyle !== 'ask_age' && (
        <>
          <p className={OPTIONS_LABEL}>{buildDisambiguationPathsLabel(categoryName)}</p>
          <DisambiguationOptionsList
            options={options}
            style={resolvedStyle}
            isOpenMulti={isOpenMulti}
            showBullets={showOptionBullets}
          />
        </>
      )}

      {sortedPaths.length > 0 && (
        <DisambiguationPathsList
          paths={sortedPaths}
          defaultOpen={defaultPathsOpen}
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

function DisambiguationTriggerBlock({
  variants,
  multipleContexts,
  categories,
  compactOnly = false,
}: {
  variants: DisambiguationContextVariant[];
  multipleContexts: boolean;
  categories: TokenCategory[];
  compactOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const showAccordion = multipleContexts && variants.length > 3;

  if (!multipleContexts || variants.length === 1) {
    if (compactOnly) return null;
    const display = resolveDisambiguationDisplayContext(variants[0]!, categories);
    return <DisambiguationAcquiredContextCompact display={display} />;
  }

  return (
    <div className="space-y-0.5">
      <p className={CONTEXT_LABEL}>
        Contesti ({variants.length})
      </p>

      {showAccordion ? (
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
            Mostra contesti
          </button>
          {open && (
            <DisambiguationTriggerVariantList variants={variants} categories={categories} />
          )}
        </>
      ) : (
        <DisambiguationTriggerVariantList variants={variants} categories={categories} />
      )}

      <p className={HINT}>
        Stessa disambiguazione in situazioni diverse: evita un riferimento fisso nel testo
        o usa formulazione generica.
      </p>
    </div>
  );
}

/** One-line acquired summary for chat / standalone views (no parent header). */
function DisambiguationAcquiredContextCompact({
  display,
}: {
  display: DisambiguationDisplayContext;
}) {
  const [pathOpen, setPathOpen] = useState(false);
  const hasInline = display.inlineLabel !== '—';
  const hasPath = !!display.pathPrefix;

  if (!hasInline && !hasPath) return null;

  return (
    <div className="space-y-1">
      {hasInline && (
        <p className={CONTEXT_LABEL}>
          Già acquisito:{' '}
          <span className={CONTEXT_VALUE}>{display.inlineLabel}</span>
        </p>
      )}

      {hasPath && (
        <div>
          <button
            type="button"
            onClick={() => setPathOpen((v) => !v)}
            className={`flex items-center gap-1.5 ${TECH} hover:text-emerald-200 w-full text-left`}
            aria-expanded={pathOpen}
          >
            <ChevronDown
              className={`w-3 h-3 flex-shrink-0 transition-transform ${pathOpen ? '' : '-rotate-90'}`}
            />
            Percorso catalogo
          </button>
          {pathOpen && (
            <p className={`${TECH} mt-1 pl-[18px] break-all`}>{display.pathPrefix}</p>
          )}
        </div>
      )}
    </div>
  );
}

function DisambiguationTriggerVariantList({
  variants,
  categories,
}: {
  variants: DisambiguationContextVariant[];
  categories: TokenCategory[];
}) {
  return (
    <ul className={`space-y-1 ${CONTEXT_VALUE} list-disc pl-[18px]`}>
      {variants.map((variant) => {
        const display = resolveDisambiguationDisplayContext(variant, categories);
        const label = display.inlineLabel !== '—'
          ? display.inlineLabel
          : (display.pathPrefix ?? '—');
        return (
          <li key={`${variant.pathPrefix}||${label}`} className="break-words">
            {label}
          </li>
        );
      })}
    </ul>
  );
}

function DisambiguationPathsList({
  paths,
  defaultOpen,
}: {
  paths: string[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

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
          Path candidati nel catalogo
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
  const sorted = [...visible].sort((a, b) => a.localeCompare(b, 'it'));
  const hasNone = options.includes('none');

  if (showBullets) {
    return (
      <div className="space-y-1">
        <p className={OPTIONS_LABEL}>
          Opzioni tra cui scegliere ({visible.length})
        </p>
        <ul className={`space-y-0.5 ${OPTIONS_ITEM} list-disc pl-4`}>
          {sorted.map((opt) => (
            <li key={opt}>{opt}</li>
          ))}
          {hasNone && (
            <li className="text-sky-400/45">none (assente nel path)</li>
          )}
        </ul>
        {isOpenMulti && <OpenMultiChoiceHint />}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <OpenMultiChoiceOptionsAccordion
        options={sorted}
        hasNone={hasNone}
        summaryLabel={formatHumanOptions(options, style)}
      />
      {isOpenMulti && <OpenMultiChoiceHint />}
    </div>
  );
}

function OpenMultiChoiceHint() {
  return (
    <p className={HINT}>
      Scelta aperta: puoi decidere se citare tutte le opzioni nel testo o lasciare una domanda generica.
    </p>
  );
}

function OpenMultiChoiceOptionsAccordion({
  options,
  hasNone,
  summaryLabel,
}: {
  options: string[];
  hasNone: boolean;
  summaryLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-start gap-1.5 ${OPTIONS_LABEL} hover:text-sky-400/90 w-full text-left`}
        aria-expanded={open}
      >
        <ChevronDown
          className={`w-3 h-3 flex-shrink-0 mt-0.5 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        <span>{summaryLabel}</span>
      </button>
      {open && (
        <ul className={`mt-1 max-h-36 overflow-y-auto space-y-0.5 ${OPTIONS_ITEM} list-disc pl-[18px]`}>
          {options.map((opt) => (
            <li key={opt}>{opt}</li>
          ))}
          {hasNone && (
            <li className="text-sky-400/45">none (assente nel path)</li>
          )}
        </ul>
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
