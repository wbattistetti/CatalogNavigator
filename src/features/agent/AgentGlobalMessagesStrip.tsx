/**
 * Global agent dialogue copy: opening question and leaf confirmation preamble.
 */
import { DICT_FORM_TEXTAREA } from '../dictionaries/dictionaryFormStyles';
import {
  DEFAULT_CONFIRMATION_PREAMBLE,
  normalizeConfirmationPreamble,
} from '../../lib/confirmationPrompts';

export interface AgentGlobalMessagesStripProps {
  startQuestion: string | null;
  confirmationPreamble: string | null;
  disabled?: boolean;
  onUpdate: (updates: {
    start_question?: string | null;
    confirmation_preamble?: string | null;
  }) => void;
}

function GlobalMessageField({
  label,
  hint,
  value,
  placeholder,
  disabled,
  rows,
  onSave,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  rows: number;
  onSave: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="font-mono text-sm text-emerald-300/80 uppercase tracking-wide">{label}</span>
      {hint && (
        <span className="font-mono text-xs text-emerald-400/55 leading-snug">{hint}</span>
      )}
      <textarea
        defaultValue={value}
        key={`${label}-${value}`}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        onBlur={(e) => {
          const next = e.target.value.trim();
          if (next !== value.trim()) onSave(next);
        }}
        className={`${DICT_FORM_TEXTAREA} resize-none focus:border-emerald-400/50 disabled:opacity-45 disabled:cursor-not-allowed`}
      />
    </label>
  );
}

/** Fixed strip above disambiguation rows for project-wide agent phrases. */
export function AgentGlobalMessagesStrip({
  startQuestion,
  confirmationPreamble,
  disabled = false,
  onUpdate,
}: AgentGlobalMessagesStripProps) {
  const preambleValue = normalizeConfirmationPreamble(confirmationPreamble);
  const startFilled = !!startQuestion?.trim();
  const preambleFilled = !!preambleValue.trim();

  return (
    <section
      className="flex-shrink-0 mx-4 mt-3 rounded border border-sky-400/25 bg-sky-400/5 overflow-hidden"
      aria-label="Messaggi globali agente"
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-sky-400/20 bg-[#0a1510]/80">
        <div>
          <h3 className="font-mono text-sm font-semibold text-sky-200/90 uppercase tracking-wide">
            Messaggi globali agente
          </h3>
          <p className="font-mono text-xs text-emerald-400/55 mt-0.5">
            Apertura e preambolo conferma — distinti dai messaggi di disambiguazione
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 font-mono text-xs">
          <StatusChip label="Apertura" filled={startFilled} />
          <StatusChip label="Conferma" filled={preambleFilled} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-3 py-3">
        <GlobalMessageField
          label="Domanda di apertura"
          hint="Prima frase del dialogo, prima di ogni disambiguazione."
          value={startQuestion ?? ''}
          placeholder="Es. Buongiorno, quale esame o prestazione desidera prenotare?"
          disabled={disabled}
          rows={2}
          onSave={(v) => onUpdate({ start_question: v || null })}
        />
        <GlobalMessageField
          label="Preambolo conferma"
          hint={`Prefisso fisso prima della descrizione visita (catalogo leggibile). Default: «${DEFAULT_CONFIRMATION_PREAMBLE}»`}
          value={preambleValue}
          placeholder={DEFAULT_CONFIRMATION_PREAMBLE}
          disabled={disabled}
          rows={2}
          onSave={(v) => onUpdate({
            confirmation_preamble: v ? normalizeConfirmationPreamble(v) : null,
          })}
        />
      </div>
    </section>
  );
}

function StatusChip({ label, filled }: { label: string; filled: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${
        filled
          ? 'border-emerald-400/35 text-emerald-300/85 bg-emerald-400/10'
          : 'border-orange-400/30 text-orange-300/80 bg-orange-400/8'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${filled ? 'bg-emerald-400/80' : 'bg-orange-400/70'}`}
        aria-hidden
      />
      {label}
    </span>
  );
}
