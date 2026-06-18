/**
 * Description filter: draft input vs applied query (apply on Enter).
 */
import { useCallback, useState } from 'react';

export interface CorpusDescriptionFilter {
  input: string;
  applied: string;
  isActive: boolean;
  setInput: (value: string) => void;
  apply: () => void;
  clear: () => void;
}

export function useCorpusDescriptionFilter(): CorpusDescriptionFilter {
  const [input, setInputState] = useState('');
  const [applied, setApplied] = useState('');

  const setInput = useCallback((value: string) => {
    setInputState(value);
    if (value.trim() === '') {
      setApplied('');
    }
  }, []);

  const apply = useCallback(() => {
    setApplied(input);
  }, [input]);

  const clear = useCallback(() => {
    setInputState('');
    setApplied('');
  }, []);

  return {
    input,
    applied,
    isActive: applied.trim().length > 0,
    setInput,
    apply,
    clear,
  };
}
