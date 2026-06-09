/**
 * Tokenization workflow: corpus selection → manual tokens (in memory).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Loader2, AlertCircle, Check } from 'lucide-react';
import type { KbDocument } from '../../lib/supabase';
import type { ParsedTabular } from '../../lib/parseTabular';
import { supabase } from '../../lib/supabase';
import { serializeDictionarySnapshot } from '../../lib/serializeTokens';
import type { TokenCategory } from '../../lib/dictionaryTree';
import { loadSavedCategories, syncCategoriesWithTokens } from '../../lib/dictionaryTree';
import {
  getActiveTokens,
  loadSavedTokens,
  type TokenDictionary,
  type TokenEntry,
} from '../../lib/tokenDictionary';
import { CorpusTokenEditor } from './CorpusTokenEditor';

export interface DictionaryPanelState {
  dirty: boolean;
  canSave: boolean;
  activeTokenCount: number;
  descriptionColumn: string | null;
  save: () => Promise<void>;
  discard: () => void;
  getDictionary: () => TokenDictionary | null;
  getDescriptions: () => string[];
}

interface DictionaryPanelProps {
  doc: KbDocument;
  tabular: ParsedTabular;
  onDocUpdated: (doc: KbDocument) => void;
  onStateChange: (state: DictionaryPanelState) => void;
  error: string | null;
}

function guessDescriptionColumn(headers: string[], roles: Record<string, string>): string | null {
  const byRole = headers.find((h) => roles[h] === 'description');
  if (byRole) return byRole;
  const byName = headers.find((h) => /descri/i.test(h));
  return byName ?? null;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function DictionaryPanel({
  doc,
  tabular,
  onDocUpdated,
  onStateChange,
  error,
}: DictionaryPanelProps) {
  const [descriptionColumn, setDescriptionColumn] = useState<string | null>(
    () => guessDescriptionColumn(tabular.headers, doc.column_roles ?? {}),
  );
  const [tokens, setTokens] = useState<TokenEntry[]>([]);
  const [categories, setCategories] = useState<TokenCategory[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [localError, setLocalError] = useState<string | null>(null);
  const savedSnapshot = useRef('');

  const descriptions = useMemo(() => {
    if (!descriptionColumn) return [];
    const idx = tabular.headers.indexOf(descriptionColumn);
    if (idx < 0) return [];
    return tabular.rows.map((r) => r[idx] ?? '');
  }, [tabular, descriptionColumn]);

  const syncFromDoc = (column: string | null, dictionary = doc.token_dictionary) => {
    if (!column) {
      setTokens([]);
      setCategories([]);
      savedSnapshot.current = serializeDictionarySnapshot([], []);
      setDirty(false);
      return;
    }
    const loaded = loadSavedTokens(dictionary, column);
    const loadedCategories = syncCategoriesWithTokens(
      loadSavedCategories(dictionary),
      loaded,
    );
    setTokens(loaded);
    setCategories(loadedCategories);
    savedSnapshot.current = serializeDictionarySnapshot(loaded, loadedCategories);
    setDirty(false);
  };

  useEffect(() => {
    syncFromDoc(descriptionColumn);
  }, [descriptionColumn, doc.token_dictionary]);

  const handleSave = async () => {
    if (!descriptionColumn) return;
    setSaveStatus('saving');
    setLocalError(null);

    const payload = {
      descriptionColumn,
      categories: categories.map(({ id, name, order, tokenTexts }) => ({
        id, name, order, tokenTexts,
      })),
      tokens: tokens.map(({ text, enabled, suppressedBy }) => ({
        text, enabled, suppressedBy,
      })),
    };

    const newRoles = { ...doc.column_roles, [descriptionColumn]: 'description' as const };
    for (const h of tabular.headers) {
      if (h !== descriptionColumn && newRoles[h] === 'description') delete newRoles[h];
    }

    const { error: err } = await supabase
      .from('kb_documents')
      .update({ token_dictionary: payload, column_roles: newRoles })
      .eq('id', doc.id);

    if (err) {
      setSaveStatus('error');
      setLocalError(err.message);
      return;
    }

    const { data: fresh, error: fetchErr } = await supabase
      .from('kb_documents')
      .select('*')
      .eq('id', doc.id)
      .single();

    if (fetchErr || !fresh) {
      setSaveStatus('error');
      setLocalError(fetchErr?.message ?? 'Documento non ricaricato dopo il salvataggio');
      return;
    }

    onDocUpdated(fresh as KbDocument);
    savedSnapshot.current = serializeDictionarySnapshot(tokens, categories);
    setDirty(false);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 2000);
  };

  const handleDiscard = () => {
    syncFromDoc(descriptionColumn);
    setLocalError(null);
    setSaveStatus('idle');
  };

  const handleColumnChange = (col: string) => {
    if (dirty && !window.confirm('Modifiche non salvate. Cambiare colonna e perdere le modifiche?')) {
      return;
    }
    setDescriptionColumn(col || null);
    setLocalError(null);
    setSaveStatus('idle');
  };

  const markDirty = (nextTokens: TokenEntry[], nextCategories: TokenCategory[]) => {
    setDirty(serializeDictionarySnapshot(nextTokens, nextCategories) !== savedSnapshot.current);
    setSaveStatus('idle');
  };

  const handleTokensChange = (next: TokenEntry[]) => {
    const syncedCategories = syncCategoriesWithTokens(categories, next);
    setTokens(next);
    setCategories(syncedCategories);
    markDirty(next, syncedCategories);
  };

  const handleCategoriesChange = (next: TokenCategory[]) => {
    setCategories(next);
    markDirty(tokens, next);
  };

  const activeCount = getActiveTokens(tokens).length;
  const rowCount = descriptions.filter((d) => d.trim()).length;

  const getDictionary = (): TokenDictionary | null => {
    if (!descriptionColumn) return null;
    return { descriptionColumn, tokens, categories };
  };

  useEffect(() => {
    onStateChange({
      dirty,
      canSave: dirty && saveStatus !== 'saving',
      activeTokenCount: activeCount,
      descriptionColumn,
      save: handleSave,
      discard: handleDiscard,
      getDictionary,
      getDescriptions: () => descriptions,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, saveStatus, activeCount, descriptionColumn, tokens, categories, descriptions, onStateChange]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 px-4 py-3 border-b border-[#1a3a2a] bg-[#070d09] space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <BookOpen className="w-4 h-4 text-amber-400/70" />
          <span className="font-mono text-sm font-semibold text-emerald-300">Ontologia</span>
          {dirty && (
            <span className="font-mono text-[10px] text-amber-400/90 px-1.5 py-0.5 rounded border border-amber-400/30 bg-amber-400/10">
              modifiche non salvate
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-400">
              <Check className="w-3 h-3" /> salvato
            </span>
          )}
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-400/60">
              <Loader2 className="w-3 h-3 animate-spin" /> salvataggio…
            </span>
          )}
        </div>
        <p className="font-mono text-[11px] text-emerald-400/50 leading-relaxed">
          Definisci i token e verifica la segmentazione. Salva dal pulsante in alto, poi passa ad Agente Virtuale.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="font-mono text-[10px] text-emerald-400/50 uppercase tracking-wider">
            Colonna descrizione
          </label>
          <select
            value={descriptionColumn ?? ''}
            onChange={(e) => handleColumnChange(e.target.value)}
            className="bg-[#0a1510] border border-[#1a3a2a] rounded px-2 py-1 font-mono text-xs text-emerald-200 focus:outline-none focus:border-emerald-400/40"
          >
            <option value="">— seleziona —</option>
            {tabular.headers.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          {descriptionColumn && (
            <span className="font-mono text-[10px] text-emerald-400/40">
              {rowCount} righe · {tokens.length} token · {categories.length} cat. · {activeCount} attivi
            </span>
          )}
        </div>
      </div>

      {(error || localError) && (
        <div className="flex-shrink-0 flex items-center gap-2 mx-4 mt-2 px-3 py-2 rounded border border-red-400/30 bg-red-400/5 text-red-400 font-mono text-xs">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error ?? localError}
        </div>
      )}

      {!descriptionColumn ? (
        <div className="flex-1 flex items-center justify-center text-emerald-400/25 font-mono text-sm px-8 text-center">
          Seleziona la colonna che contiene la descrizione dell&apos;esame.
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col p-4 overflow-hidden">
          <CorpusTokenEditor
            descriptions={descriptions}
            tokens={tokens}
            categories={categories}
            onTokensChange={handleTokensChange}
            onCategoriesChange={handleCategoriesChange}
          />
        </div>
      )}
    </div>
  );
}
