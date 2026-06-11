/**
 * Shared Tailwind class tokens for dictionary workspace UI (tabs, buttons, forms).
 */
export const DICT_UI_TEXT = 'font-mono text-xs';
/** @deprecated Use DICT_UI_TEXT */
export const DICT_FORM_UI_TEXT = DICT_UI_TEXT;

export const DICT_UI_BTN = `${DICT_UI_TEXT} rounded border px-2 flex items-center gap-1 whitespace-nowrap h-[26px] leading-none`;

export const DICT_FORM_FIELD =
  'w-full bg-[#080e0a] border border-[#1a3a2a] rounded px-2 py-1.5 font-mono text-xs text-emerald-200 focus:outline-none focus:border-sky-400/50';
export const DICT_FORM_LABEL = 'font-mono text-xs text-emerald-300';
export const DICT_FORM_ROW = 'grid grid-cols-[5.5rem_1fr] gap-x-3 items-center';
export const DICT_FORM_ROW_TOP = 'grid grid-cols-[5.5rem_1fr] gap-x-3 items-start';
