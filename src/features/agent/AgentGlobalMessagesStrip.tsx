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

function GlobalMessageFieldRow({
  label,
  value,
  placeholder,
  disabled,
  onSave,
}: {
  label: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onSave: (value: string) => void;
}) {
  return (
    <label className="flex flex-1 items-center gap-2 min-w-0">
      <span className="flex-shrink-0 w-[8.5rem] font-mono text-xs text-emerald-300/80 uppercase tracking-wide">
        {label}
      </span>
      <textarea
        defaultValue={value}
        key={`${label}-${value}`}
        rows={1}
        disabled={disabled}
        placeholder={placeholder}
        onBlur={(e) => {
          const next = e.target.value.trim();
          if (next !== value.trim()) onSave(next);
        }}
        className={`${DICT_FORM_TEXTAREA} flex-1 min-w-0 py-1.5 resize-none focus:border-emerald-400/50 disabled:opacity-45 disabled:cursor-not-allowed`}
      />
    </label>
  );
}

/** Compact single-row strip for project-wide agent phrases. */
export function AgentGlobalMessagesStrip({
  startQuestion,
  confirmationPreamble,
  disabled = false,
  onUpdate,
}: AgentGlobalMessagesStripProps) {
  const preambleValue = normalizeConfirmationPreamble(confirmationPreamble);

  return (
    <section
      className="flex-shrink-0 flex items-center gap-6 px-4 py-2 bg-[#0a1510]/60 min-w-0"
      aria-label="Messaggi globali agente"
    >
      <GlobalMessageFieldRow
        label="Domanda apertura"
        value={startQuestion ?? ''}
        placeholder="Es. Buongiorno, quale esame desidera prenotare?"
        disabled={disabled}
        onSave={(v) => onUpdate({ start_question: v || null })}
      />
      <GlobalMessageFieldRow
        label="Preambolo conferma"
        value={preambleValue}
        placeholder={DEFAULT_CONFIRMATION_PREAMBLE}
        disabled={disabled}
        onSave={(v) => onUpdate({
          confirmation_preamble: v ? normalizeConfirmationPreamble(v) : null,
        })}
      />
    </section>
  );
}
