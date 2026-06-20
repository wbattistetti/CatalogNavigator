/**
 * Shared Tailwind class tokens for dictionary workspace UI (tabs, buttons, forms).
 */
export const DICT_UI_TEXT = 'font-mono text-xs';
/** @deprecated Use DICT_UI_TEXT */
export const DICT_FORM_UI_TEXT = DICT_UI_TEXT;

export const DICT_UI_BTN = `${DICT_UI_TEXT} rounded border px-2 flex items-center gap-1 whitespace-nowrap h-[26px] leading-none`;

export const DICT_FORM_FIELD =
  'w-full bg-[#080e0a] border border-[#1a3a2a] rounded px-2 py-1.5 font-mono text-xs text-emerald-200 focus:outline-none focus:border-sky-400/50';
/** Same size as DICT_FORM_FIELD — alias for tree / grammar inputs. */
export const DICT_INPUT_FIELD = DICT_FORM_FIELD;
export const DICT_FORM_LABEL = 'font-mono text-xs text-emerald-300';
/** Multi-line fields (messaggi, grammatica): stesso corpo visivo del resto editor. */
export const DICT_FORM_TEXTAREA =
  'w-full bg-[#0a1510] border border-[#1a3a2a] rounded px-2 py-1.5 font-sans text-sm text-emerald-100 resize-y focus:outline-none focus:border-emerald-400/50 leading-relaxed';
export const DICT_FORM_ROW = 'grid grid-cols-[5.5rem_1fr] gap-x-3 items-center';
export const DICT_FORM_ROW_TOP = 'grid grid-cols-[5.5rem_1fr] gap-x-3 items-start';
