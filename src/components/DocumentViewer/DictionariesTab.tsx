/**
 * Full-page Dictionaries tab: create and load dictionaries.
 */
import type { UseProjectDictionariesResult } from '../../hooks/useProjectDictionaries';
import { DictionariesPanel } from './DictionariesPanel';

interface DictionariesTabProps {
  dicts: UseProjectDictionariesResult;
}

export function DictionariesTab({ dicts }: DictionariesTabProps) {
  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto bg-[#070d09]">
      <DictionariesPanel dicts={dicts} variant="full" />
    </div>
  );
}
