/**

 * Detail editor for one disambiguation signature row.

 */

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { DICT_FORM_TEXTAREA } from '../../features/dictionaries/dictionaryFormStyles';
import type { DisambiguationEditorRow } from '../../lib/disambiguationPlanMessages';
import {
  buildDisambiguationPathsLabel,
  formatDisambiguationParentLines,
} from '../../lib/disambiguationParents';

import type { TokenCategory } from '../../lib/dictionaryTree';

import { DisambiguationContextSummary } from './DisambiguationContextSummary';

import { DisambiguationAnswerGrammarEditor } from './DisambiguationAnswerGrammarEditor';

import { VincoloPipelinePanel } from './VincoloPipelinePanel';



type DetailTab = 'messaggi' | 'grammatiche';



interface DisambiguationMessagePanelProps {

  row: DisambiguationEditorRow | null;

  vincoloCategory?: TokenCategory | null;

  focusGrammar?: boolean;

  runtimeOptions?: string[];

  onSave: (signature: string, patch: Partial<DisambiguationEditorRow>) => void;

}



export function DisambiguationMessagePanel({

  row,

  vincoloCategory = null,

  focusGrammar = false,

  runtimeOptions,

  onSave,

}: DisambiguationMessagePanelProps) {

  const [activeTab, setActiveTab] = useState<DetailTab>('messaggi');
  const [contextOpen, setContextOpen] = useState(true);

  const showGrammatiche = row?.style !== 'ask_age';

  useEffect(() => {
    if (!row) return;
    setActiveTab(focusGrammar && row.style !== 'ask_age' ? 'grammatiche' : 'messaggi');
  }, [row?.signature, focusGrammar, row?.style]);

  useEffect(() => {
    if (!row) return;
    setContextOpen(activeTab === 'messaggi');
  }, [row?.signature, activeTab, row]);



  if (!row) {

    return (

      <div className="flex items-center justify-center h-full font-mono text-sm text-emerald-300/75 p-6 text-center">

        Seleziona una riga per modificare domanda e re-prompt

      </div>

    );

  }



  return (

    <div className="flex flex-col h-full min-h-0">

      <div className="flex-shrink-0 px-4 pt-4 pb-3">
        <div className="rounded border border-[#1a3a2a] bg-[#0d1510] overflow-hidden">
          <button
            type="button"
            onClick={() => setContextOpen((v) => !v)}
            className="flex w-full items-start gap-1.5 px-3 py-2 font-mono text-sm text-emerald-300/85 hover:text-emerald-200 hover:bg-emerald-400/5 transition-colors text-left"
            aria-expanded={contextOpen}
          >
            <ChevronDown
              className={`w-3 h-3 flex-shrink-0 mt-0.5 transition-transform ${contextOpen ? '' : '-rotate-90'}`}
            />
            <span className="text-emerald-200/80 break-words min-w-0">
              {buildContextAccordionLabel(row)}
            </span>
          </button>
          {contextOpen && (
            <div className="px-3 pb-2 border-t border-[#1a3a2a]/60">
              <DisambiguationContextSummary
                categoryName={row.categoryName}
                parentInfo={row.parentInfo}
                contextVariants={row.contextVariants}
                candidatePaths={row.candidatePaths}
                options={row.options}
                style={row.style}
                defaultPathsOpen={row.parentInfo.scope === 'multiple'}
              />
            </div>
          )}
        </div>
      </div>



      {showGrammatiche && (

        <div

          className="flex-shrink-0 flex items-center gap-1 px-4 border-b border-[#1a3a2a]"

          role="tablist"

          aria-label="Sezioni messaggio disambiguazione"

        >

          <DetailTabButton

            id="disambiguation-tab-messaggi"

            active={activeTab === 'messaggi'}

            onClick={() => setActiveTab('messaggi')}

          >

            Messaggi

          </DetailTabButton>

          <DetailTabButton

            id="disambiguation-tab-grammatiche"

            active={activeTab === 'grammatiche'}

            onClick={() => setActiveTab('grammatiche')}

          >

            Grammatiche

          </DetailTabButton>

        </div>

      )}



      <div
        className={`flex-1 min-h-0 px-4 py-3 ${
          activeTab === 'grammatiche' && showGrammatiche
            ? 'overflow-hidden flex flex-col'
            : 'overflow-auto'
        }`}
        role="tabpanel"
        aria-labelledby={activeTab === 'grammatiche' ? 'disambiguation-tab-grammatiche' : 'disambiguation-tab-messaggi'}
      >

        {activeTab === 'messaggi' || !showGrammatiche ? (

          <MessaggiTabContent

            row={row}

            vincoloCategory={vincoloCategory}

            onSave={onSave}

          />

        ) : (

          <DisambiguationAnswerGrammarEditor

            options={row.options}

            style={row.style}

            grammar={row.answer_grammar}

            runtimeOptions={runtimeOptions}

            autoFocus={focusGrammar}

            onSave={(grammar) => onSave(row.signature, {

              answer_grammar: grammar,

              source: 'manual',

              status: null,

            })}

          />

        )}

      </div>

    </div>

  );

}



function DetailTabButton({

  id,

  active,

  onClick,

  children,

}: {

  id: string;

  active: boolean;

  onClick: () => void;

  children: string;

}) {

  return (

    <button

      id={id}

      type="button"

      role="tab"

      aria-selected={active}

      onClick={onClick}

      className={`px-3 py-1.5 font-mono text-sm rounded-t border border-b-0 transition-colors ${

        active

          ? 'bg-[#0f3524] border-emerald-400/40 text-emerald-50 -mb-px'

          : 'bg-transparent border-transparent text-emerald-300/80 hover:text-emerald-200 hover:bg-emerald-400/5'

      }`}

    >

      {children}

    </button>

  );

}



function MessaggiTabContent({

  row,

  vincoloCategory,

  onSave,

}: {

  row: DisambiguationEditorRow;

  vincoloCategory: TokenCategory | null;

  onSave: DisambiguationMessagePanelProps['onSave'];

}) {

  return (

    <div className="flex flex-col gap-4">

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

        <p className="font-mono text-sm text-emerald-300/75">

          Sorgente: {row.source}

          {row.status === 'approved' && ' · approvato'}

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

      <span className="font-mono text-sm text-emerald-300/80 uppercase tracking-wide">{label}</span>

      <textarea

        defaultValue={value}

        key={`${label}-${value}`}

        rows={rows}

        onBlur={(e) => {

          const next = e.target.value.trim();

          if (next !== value.trim()) onSave(next);

        }}

        className={`${DICT_FORM_TEXTAREA} resize-none focus:border-emerald-400/50`}

      />

    </label>

  );

}

function buildContextAccordionLabel(row: DisambiguationEditorRow): string {
  const contextLines = formatDisambiguationParentLines(row.parentInfo);
  if (contextLines?.value) {
    return `${contextLines.label}: ${contextLines.value}`;
  }
  const category = row.categoryName.trim();
  if (category) {
    return buildDisambiguationPathsLabel(category);
  }
  return 'Contesto disambiguazione';
}
