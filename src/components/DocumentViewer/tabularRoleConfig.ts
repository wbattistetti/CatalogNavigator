/**
 * Column role styling for tabular preview headers and cells.
 */
import type { ColumnRole } from '../../lib/supabase';

export interface TabularRoleConfig {
  label: string;
  thBg: string;
  thText: string;
  tdBg: string;
  dot: string;
  btnActive: string;
  btnInactive: string;
}

export const TABULAR_ROLE_CONFIG: Record<ColumnRole, TabularRoleConfig> = {
  selector: {
    label: 'Selector',
    thBg: 'bg-orange-900/20',
    thText: 'text-orange-200/80',
    tdBg: 'bg-orange-900/[0.07]',
    dot: 'bg-orange-400',
    btnActive: 'bg-orange-500/25 text-orange-300 border-orange-500/40',
    btnInactive: 'text-orange-400/40 hover:text-orange-300/80 border-[#1a3a2a] hover:bg-orange-900/20',
  },
  data: {
    label: 'Data',
    thBg: 'bg-sky-900/20',
    thText: 'text-sky-200/80',
    tdBg: 'bg-sky-900/[0.07]',
    dot: 'bg-sky-400',
    btnActive: 'bg-sky-500/25 text-sky-300 border-sky-500/40',
    btnInactive: 'text-sky-400/40 hover:text-sky-300/80 border-[#1a3a2a] hover:bg-sky-900/20',
  },
  description: {
    label: 'Descrizione',
    thBg: 'bg-amber-900/20',
    thText: 'text-amber-200/80',
    tdBg: 'bg-amber-900/[0.07]',
    dot: 'bg-amber-400',
    btnActive: 'bg-amber-500/25 text-amber-300 border-amber-500/40',
    btnInactive: 'text-amber-400/40 hover:text-amber-300/80 border-[#1a3a2a] hover:bg-amber-900/20',
  },
  ignore: {
    label: 'Ignore',
    thBg: 'bg-gray-700/15',
    thText: 'text-gray-400/40',
    tdBg: 'bg-gray-700/[0.07]',
    dot: 'bg-gray-500',
    btnActive: 'bg-gray-600/25 text-gray-300 border-gray-500/40',
    btnInactive: 'text-gray-400/35 hover:text-gray-300/60 border-[#1a3a2a] hover:bg-gray-700/20',
  },
  ontology: {
    label: 'Descrizione',
    thBg: 'bg-amber-900/20',
    thText: 'text-amber-200/80',
    tdBg: 'bg-amber-900/[0.07]',
    dot: 'bg-amber-400',
    btnActive: 'bg-amber-500/25 text-amber-300 border-amber-500/40',
    btnInactive: 'text-amber-400/40 hover:text-amber-300/80 border-[#1a3a2a] hover:bg-amber-900/20',
  },
};

export const TABULAR_ROLES: ColumnRole[] = ['description', 'selector', 'data', 'ignore'];
