/**
 * Detail editor for one disambiguation signature row.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { DisambiguationEditorRow } from '../../lib/disambiguationPlanMessages';
import {
  formatAcquiredContext,
  formatHumanOptions,
  formatTechnicalOptions,
  styleLabel,
} from '../../lib/disambiguationPlanMessages';
import type { TokenCategory } from '../../lib/dictionaryTree';
import { VincoloPipelinePanel } from './VincoloPipelinePanel';

const META_TEXT = 'font-mono text-xs leading-relaxed';

interface DisambiguationMessagePanelProps {
  row: DisambiguationEditorRow | null;
  vincoloCategory?: TokenCategory | null;
  onSave: (signature: string, patch: Partial<DisambiguationEditorRow>) => void;
}

export function DisambiguationMessagePanel({
  row,
  vincoloCategory = null,
  onSave,
}: DisambiguationMessagePanelProps) {
  if (!row) {
    return (
      <div className="flex items-center justify-center h-full font-mono text-sm text-emerald-400/30 p-6 text-center">
        Seleziona una riga per modificare domanda e re-prompt
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto p-4 gap-4">
      <div className="rounded border border-[#1a3a2a] bg-[#0d1510] px-3 py-2 space-y-1">
        <p className={`${META_TEXT} text-emerald-400/50`}>
          Categoria: <span className="text-emerald-300/80">{row.categoryName}</span>
        </p>
        {row.style === 'ask_age' ? (
          <VincoloTokensAccordion options={row.options} />
        ) : (
          <p className={`${META_TEXT} text-emerald-400/50`}>
            Opzioni:{' '}
            <span className="text-emerald-200/80">{formatHumanOptions(row.options, row.style)}</span>
            {row.options.length > 0 && (
              <span className={`block ${META_TEXT} text-emerald-400/55 mt-0.5`}>
                {formatTechnicalOptions(row.options)}
              </span>
            )}
          </p>
        )}
        <p className={`${META_TEXT} text-emerald-400/50`}>
          Tipo: <span className="text-emerald-200/80">{styleLabel(row.style)}</span>
          {' · '}
          {row.contextCount ?? 1} contesti
        </p>
        <p className={`${META_TEXT} text-emerald-400/50`}>
          Esempio contesto: <span className="text-emerald-200/70">{formatAcquiredContext(row.sampleAcquired)}</span>
        </p>
      </div>

      {row.style === 'ask_age' && (
        <VincoloPipelinePanel category={vincoloCategory} />
      )}

      <Field
        label="Domanda"
        value={row.question ?? ''}
        onSave={(v) => onSave(row.signature, { question: v || null, source: 'manual', status: null })}
        rows={3}
      />
      <Field
        label="No match 1"
        value={row.no_match_1 ?? ''}
        onSave={(v) => onSave(row.signature, { no_match_1: v || null, source: 'manual' })}
        rows={2}
      />
      <Field
        label="No match 2"
        value={row.no_match_2 ?? ''}
        onSave={(v) => onSave(row.signature, { no_match_2: v || null, source: 'manual' })}
        rows={2}
      />
      <Field
        label="No match 3"
        value={row.no_match_3 ?? ''}
        onSave={(v) => onSave(row.signature, { no_match_3: v || null, source: 'manual' })}
        rows={2}
      />

      {row.source && (
        <p className="font-mono text-xs text-emerald-400/40">
          Sorgente: {row.source}
          {row.status === 'approved' && ' · approvato'}
        </p>
      )}
    </div>
  );
}

function VincoloTokensAccordion({ options }: { options: string[] }) {
  const [open, setOpen] = useState(false);
  const sorted = formatTechnicalOptions(options);

  if (options.length === 0) {
    return (
      <p className={`${META_TEXT} text-emerald-400/50`}>
        Token vincolo: <span className="text-emerald-200/70">nessuno</span>
      </p>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 ${META_TEXT} text-emerald-400/50 hover:text-emerald-400/70 w-full text-left`}
        aria-expanded={open}
      >
        <ChevronDown
          className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        Token vincolo ({options.length})
      </button>
      {open && (
        <p className={`${META_TEXT} text-emerald-200/80 mt-1.5 pl-[18px] max-h-28 overflow-y-auto break-words`}>
          {sorted}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onSave,
  rows,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
  rows: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-xs text-emerald-400/60 uppercase tracking-wide">{label}</span>
      <textarea
        defaultValue={value}
        key={`${label}-${value}`}
        rows={rows}
        onBlur={(e) => {
          const next = e.target.value.trim();
          if (next !== value.trim()) onSave(next);
        }}
        className="w-full bg-[#0a1510] border border-[#1a3a2a] rounded px-2 py-1.5 font-sans text-sm text-emerald-100 resize-none focus:outline-none focus:border-emerald-400/50"
      />
    </label>
  );
}
