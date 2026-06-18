/**
 * Viewer and test harness for vincolo resolution pipelines (design-time contract).
 */
import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { TokenCategory } from '../../lib/dictionaryTree';
import {
  compileVincoloResolutionPipeline,
  runResolutionPipelineForTest,
  validateResolutionPipeline,
  type ResolutionStep,
  type VincoloResolutionPipeline,
} from '../../lib/vincoloResolutionPipeline';

const PANEL_TEXT = 'font-mono text-xs leading-relaxed';

interface VincoloPipelinePanelProps {
  category: TokenCategory | null;
}

function stepSummary(step: ResolutionStep): string {
  switch (step.type) {
    case 'regex_capture':
      return `regex → valore gruppo ${step.valueGroup}${step.unitGroup ? `, unità gruppo ${step.unitGroup}` : ''}`;
    case 'word_unit_capture':
      return `parola+unità → gruppo ${step.wordGroup}`;
    case 'word_map':
      return `mappa parole (${step.entries.length} voci)`;
    case 'bare_number':
      return `solo numero (default ${step.defaultUnit})`;
    default:
      return step.type;
  }
}

function stepDetail(step: ResolutionStep): string | null {
  if ('pattern' in step && step.pattern) return step.pattern;
  if (step.type === 'word_map' && step.entries.length > 0) {
    return step.entries
      .slice(0, 24)
      .map((e) => `${e.word}→${e.value}${e.unit}`)
      .join(' · ')
      + (step.entries.length > 24 ? ` · … (+${step.entries.length - 24})` : '');
  }
  return null;
}

function PipelineStepAccordion({
  index,
  step,
}: {
  index: number;
  step: ResolutionStep;
}) {
  const [open, setOpen] = useState(false);
  const detail = stepDetail(step);

  return (
    <li className="rounded border border-[#1a3a2a] bg-[#0a1510]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-start gap-1.5 px-2 py-1.5 text-left text-emerald-200/80 hover:text-emerald-100 ${PANEL_TEXT}`}
        aria-expanded={open}
      >
        <ChevronDown
          className={`w-3 h-3 flex-shrink-0 mt-0.5 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        <span>
          Step {index + 1}: {step.type}
          {' · '}
          {stepSummary(step)}
        </span>
      </button>
      {open && detail && (
        <div className={`px-2 pb-2 pl-[22px] ${PANEL_TEXT} text-emerald-400/70 max-h-32 overflow-y-auto break-all`}>
          {detail}
        </div>
      )}
    </li>
  );
}

export function VincoloPipelinePanel({ category }: VincoloPipelinePanelProps) {
  const [contractOpen, setContractOpen] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);

  const pipeline = useMemo((): VincoloResolutionPipeline | null => {
    if (!category || category.type !== 'vincolo') return null;
    return category.resolution ?? compileVincoloResolutionPipeline(category);
  }, [category]);

  const validationError = useMemo(
    () => (pipeline ? validateResolutionPipeline(pipeline) : null),
    [pipeline],
  );

  if (!category || category.type !== 'vincolo') return null;

  const runTest = () => {
    if (!pipeline || !testInput.trim()) {
      setTestResult(null);
      return;
    }
    const result = runResolutionPipelineForTest(pipeline, testInput.trim());
    if (!result) {
      setTestResult('Nessun match');
      return;
    }
    setTestResult(`${result.value} ${result.unit}`);
  };

  const contractLabel = pipeline
    ? `Contratto grammatica · ${pipeline.valueKind} · ${pipeline.steps.length} step`
    : 'Contratto grammatica / pipeline';

  return (
    <div className="rounded border border-sky-400/25 bg-sky-400/5">
      <button
        type="button"
        onClick={() => setContractOpen((v) => !v)}
        className={`flex w-full items-start gap-1.5 px-3 py-2.5 text-left text-sky-300/85 hover:text-sky-200 ${PANEL_TEXT}`}
        aria-expanded={contractOpen}
      >
        <ChevronDown
          className={`w-3 h-3 flex-shrink-0 mt-0.5 transition-transform ${contractOpen ? '' : '-rotate-90'}`}
        />
        <span>{contractLabel}</span>
      </button>

      {contractOpen && (
        <div className="px-3 pb-3 space-y-3 border-t border-sky-400/15">
          <p className={`${PANEL_TEXT} text-emerald-400/55 pt-2`}>
            Estrae il valore grezzo dalla risposta del paziente (non i token catalogo).
          </p>

          {pipeline ? (
            <>
              {validationError && (
                <p className={`${PANEL_TEXT} text-amber-300/90`}>{validationError}</p>
              )}

              <ol className="space-y-1.5">
                {pipeline.steps.map((step, index) => (
                  <PipelineStepAccordion key={`${step.type}-${index}`} index={index} step={step} />
                ))}
              </ol>

              <div className="space-y-1.5 pt-1 border-t border-[#1a3a2a]/80">
                <label className={`${PANEL_TEXT} text-emerald-400/55 uppercase tracking-wide`}>
                  Prova risposta
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runTest()}
                    placeholder='es. "ho 30 anni"'
                    className={`flex-1 bg-[#0a1510] border border-[#1a3a2a] rounded px-2 py-1 font-sans ${PANEL_TEXT} text-emerald-100 focus:outline-none focus:border-sky-400/40`}
                  />
                  <button
                    type="button"
                    onClick={runTest}
                    className={`px-2 py-1 rounded border border-sky-400/30 text-sky-300 ${PANEL_TEXT} hover:bg-sky-400/10`}
                  >
                    Test
                  </button>
                </div>
                {testResult != null && (
                  <p className={`${PANEL_TEXT} text-emerald-300/80`}>
                    → {testResult}
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className={`${PANEL_TEXT} text-amber-300/80`}>
              Pipeline non disponibile. Usa &quot;Genera grammatiche&quot; nel dizionario.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
