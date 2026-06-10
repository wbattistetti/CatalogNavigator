/**
 * Dictionary library panel (compact): delegates to shared library actions.
 */
import type { UseProjectDictionariesResult } from '../../hooks/useProjectDictionaries';
import { DictionaryLibraryActions } from '../../features/dictionaries/DictionaryLibraryActions';

interface DictionariesPanelProps {
  dicts: UseProjectDictionariesResult;
  variant?: 'compact' | 'full';
}

export function DictionariesPanel({ dicts, variant = 'compact' }: DictionariesPanelProps) {
  const isFull = variant === 'full';
  const pad = isFull ? 'px-4 py-4' : 'px-3 py-2';

  return (
    <div className={isFull ? 'h-full' : 'flex-shrink-0 border-b border-[#1a3a2a] bg-[#070d09]'}>
      <div className={`${pad} space-y-2`}>
        {!isFull && (
          <span className="font-mono text-xs uppercase tracking-wider text-amber-300 font-semibold">
            Dizionari
          </span>
        )}
        <DictionaryLibraryActions dicts={dicts} compact={!isFull} />
      </div>
    </div>
  );
}
