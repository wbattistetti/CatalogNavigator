/**
 * Taxonomy refinement panel — IA adjusts leaf paths from user notes.
 */
import { useState } from 'react';
import { Loader2, Wand2, X } from 'lucide-react';

const AFFINA_SUGGESTIONS = [
  'Spezza di più: separa entità e attributo in livelli distinti (es. "ginocchio destro" → ginocchio.destro)',
  'Unisci due nodi che sono la stessa dimensione',
  'Manca il percorso …',
  'Troppo fine: unisci i livelli X e Y',
  'Aggiungi i figli mancanti per …',
];

export interface AffinaTaxonomyPanelProps {
  onClose: () => void;
  onSubmit: (notes: string) => void;
  generating: boolean;
  hasTaxonomy: boolean;
}

export function AffinaTaxonomyPanel({
  onClose,
  onSubmit,
  generating,
  hasTaxonomy,
}: AffinaTaxonomyPanelProps) {
  const [notes, setNotes] = useState('');
  const canSubmit = notes.trim().length >= 3 && !generating;

  const appendSuggestion = (text: string) => {
    setNotes((prev) => (prev.trim() ? `${prev.trim()}\n${text}` : text));
  };

  return (
    <div className="flex-shrink-0 border-b border-[#1a3a2a] bg-[#070d09] px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wand2 className="w-3.5 h-3.5 text-amber-400/70" />
          <span className="font-mono text-sm text-amber-400/80 font-semibold">Affina tassonomia</span>
        </div>
        <button type="button" onClick={onClose} className="text-emerald-400/30 hover:text-emerald-400/70 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="font-mono text-sm text-emerald-400/50 leading-relaxed">
        Descrivi come modificare la <strong className="text-emerald-400/70 font-normal">struttura ad albero</strong>.
        L&apos;affinamento usa solo i path esistenti — <strong className="text-emerald-400/70 font-normal">non rilegge il documento</strong>.
        {hasTaxonomy && (
          <span className="text-amber-400/60"> Dopo l&apos;affinamento ricalcola il piano messaggi.</span>
        )}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {AFFINA_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => appendSuggestion(s)}
            className="px-2 py-0.5 rounded border border-[#1a3a2a] bg-[#0a1510] font-mono text-sm text-emerald-400/50 hover:text-emerald-400/80 hover:border-emerald-400/30 transition-colors text-left"
          >
            {s.length > 52 ? `${s.slice(0, 52)}…` : s}
          </button>
        ))}
      </div>
      <textarea
        autoFocus
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Es: spezza di più ginocchio destro in ginocchio + destro; manca esami.ecografie.addome completo…"
        rows={4}
        className="w-full bg-[#0a1510] border border-[#1a3a2a] rounded px-3 py-2 font-mono text-sm text-emerald-200/80 placeholder-emerald-400/20 resize-none focus:outline-none focus:border-emerald-400/40 transition-colors"
      />
      <button
        type="button"
        onClick={() => onSubmit(notes)}
        disabled={!canSubmit}
        className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-sm font-semibold text-emerald-900 bg-emerald-400 rounded hover:bg-emerald-300 transition-colors disabled:opacity-40"
      >
        {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
        {generating ? 'Affinamento in corso…' : 'Applica affinamento'}
      </button>
    </div>
  );
}
