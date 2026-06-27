/**
 * Semantic set / value tree with drag payloads for canvas binding.
 */
import { Box, Pencil } from 'lucide-react';
import type { GrammarGraph, SemanticValue } from '../../lib/grammarGraph/grammarGraphTypes';
import { useGrammarEditorStore } from './grammarStoreContext';

const MIME = 'application/json';

function dragPayload(type: 'semantic-set' | 'semantic-value', id: string, label: string) {
  return JSON.stringify({ type, setId: type === 'semantic-set' ? id : undefined, valueId: type === 'semantic-value' ? id : undefined, label });
}

function ValueRow({
  value,
  highlighted,
  onSelect,
}: {
  value: SemanticValue;
  highlighted: boolean;
  onSelect?: () => void;
}) {
  return (
    <div
      draggable
      role="button"
      tabIndex={0}
      className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-grab hover:bg-emerald-900/40 border border-transparent hover:border-amber-500/30 ${highlighted ? 'ring-1 ring-sky-400/60' : ''}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect?.();
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData(MIME, dragPayload('semantic-value', value.id, value.value));
        e.dataTransfer.effectAllowed = 'copy';
      }}
    >
      <Pencil className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
      <span className="font-mono text-xs text-emerald-100 truncate" title={value.value}>{value.value}</span>
      {value.synonyms.length > 0 ? (
        <span className="text-[10px] text-emerald-400/70 ml-auto">{value.synonyms.length} sin.</span>
      ) : null}
    </div>
  );
}

export function SemanticPanel({
  highlightValueId,
  onValueSelect,
}: {
  highlightValueId?: string | null;
  onValueSelect?: (valueId: string, optionToken: string) => void;
}) {
  const grammar = useGrammarEditorStore((s) => s.grammar);

  if (grammar.semanticSets.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-3 font-mono text-xs text-emerald-300/60">
        Nessun set semantico
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0d1218] border-l border-emerald-500/20">
      <div className="flex-shrink-0 px-3 py-2 border-b border-emerald-500/20 font-mono text-xs text-emerald-300/90 uppercase tracking-wide">
        Semantica
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-2 space-y-3">
        {grammar.semanticSets.map((set) => (
          <div key={set.id}>
            <div
              draggable
              className="flex items-center gap-2 px-2 py-1.5 mb-1 rounded cursor-grab hover:bg-amber-900/20"
              onDragStart={(e) => {
                e.dataTransfer.setData(MIME, dragPayload('semantic-set', set.id, set.name));
                e.dataTransfer.effectAllowed = 'copy';
              }}
            >
              <Box className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-mono text-xs font-semibold text-amber-200">{set.name}</span>
            </div>
            <div className="pl-2 space-y-0.5">
              {set.values.map((value) => (
                <ValueRow
                  key={value.id}
                  value={value}
                  highlighted={highlightValueId === value.id}
                  onSelect={() => onValueSelect?.(value.id, value.value)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function parseSemanticDragPayload(raw: string): { type: string; setId?: string; valueId?: string; label: string } | null {
  try {
    const parsed = JSON.parse(raw) as { type?: string; setId?: string; valueId?: string; label?: string };
    if (!parsed.type || !parsed.label) return null;
    return { type: parsed.type, setId: parsed.setId, valueId: parsed.valueId, label: parsed.label };
  } catch {
    return null;
  }
}

export function wordsEditorForSelectedNode(graph: GrammarGraph, nodeId: string | null): string[] {
  if (!nodeId) return [];
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return [];
  const words = [node.label, ...node.synonyms].filter(Boolean);
  const vb = node.bindings.find((b) => b.type === 'semantic-value');
  if (vb?.valueId) {
    for (const set of graph.semanticSets) {
      const value = set.values.find((v) => v.id === vb.valueId);
      if (value) {
        for (const s of [value.value, ...value.synonyms]) {
          if (s && !words.some((w) => w.toLowerCase() === s.toLowerCase())) words.push(s);
        }
      }
    }
  }
  return words;
}
