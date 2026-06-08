import React, { useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { ColumnRole } from '../../lib/supabase';
import type { ParsedTabular } from '../../lib/parseTabular';

interface TabularPreviewProps {
  tabular: ParsedTabular;
  docId: string;
  initialRoles?: Record<string, ColumnRole>;
}

const ROLE_CONFIG: Record<ColumnRole, {
  label: string;
  thBg: string;
  thText: string;
  tdBg: string;
  dot: string;
  btnActive: string;
  btnInactive: string;
}> = {
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
};

const ROLES: ColumnRole[] = ['description', 'selector', 'data', 'ignore'];

export function TabularPreview({ tabular, docId, initialRoles = {} }: TabularPreviewProps) {
  const { headers, rows } = tabular;
  const [filter, setFilter] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [columnRoles, setColumnRoles] = useState<Record<string, ColumnRole>>(initialRoles);

  const visibleIndices = headers.reduce<number[]>((acc, h, i) => {
    if (!showAll && columnRoles[h] === 'ignore') return acc;
    acc.push(i);
    return acc;
  }, []);

  const filtered = filter
    ? rows.filter((row) =>
        visibleIndices.some((ci) => row[ci]?.toLowerCase().includes(filter.toLowerCase()))
      )
    : rows;

  const sortColIdx = useMemo(() => {
    const byRole = headers.findIndex((h) => columnRoles[h] === 'description');
    if (byRole >= 0) return byRole;
    const byName = headers.findIndex((h) => /descri/i.test(h));
    if (byName >= 0) return byName;
    return visibleIndices[0] ?? 0;
  }, [headers, columnRoles, visibleIndices]);

  const sortedRows = useMemo(
    () =>
      [...filtered].sort((a, b) =>
        (a[sortColIdx] ?? '').localeCompare(b[sortColIdx] ?? '', 'it', { sensitivity: 'base' }),
      ),
    [filtered, sortColIdx],
  );

  const ignoredCount = headers.filter((h) => columnRoles[h] === 'ignore').length;

  const handleRoleChange = async (colName: string, role: ColumnRole) => {
    const newRoles = { ...columnRoles };
    if (newRoles[colName] === role) {
      delete newRoles[colName];
    } else {
      if (role === 'description') {
        for (const h of Object.keys(newRoles)) {
          if (h !== colName && newRoles[h] === 'description') delete newRoles[h];
        }
      }
      newRoles[colName] = role;
    }
    setColumnRoles(newRoles);
    await supabase.from('kb_documents').update({ column_roles: newRoles }).eq('id', docId);
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* Filter bar */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-[#1a3a2a] bg-[#0a1510]">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter rows…"
          className="flex-1 min-w-0 bg-transparent border border-[#1a3a2a] rounded px-2 py-0.5 font-mono text-xs text-emerald-300 placeholder-emerald-400/30 focus:outline-none focus:border-emerald-400/50"
        />
        {ignoredCount > 0 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono text-xs transition-colors ${
              showAll
                ? 'border-emerald-400/40 text-emerald-300 bg-emerald-400/10'
                : 'border-[#1a3a2a] text-emerald-400/40 hover:text-emerald-400/70'
            }`}
          >
            {showAll ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showAll ? 'Nascondi escluse' : `+${ignoredCount} escluse`}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
        <table className="text-left border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[#1a3a2a]">
              {visibleIndices.map((ci) => {
                const h = headers[ci]!;
                const role = columnRoles[h];
                const cfg = role ? ROLE_CONFIG[role] : null;

                return (
                  <th
                    key={ci}
                    className={`group relative px-4 pt-2 pb-1.5 font-mono text-xs font-semibold uppercase tracking-wider whitespace-nowrap border-r border-[#1a3a2a] last:border-r-0 select-none transition-colors ${
                      cfg ? `${cfg.thBg} ${cfg.thText}` : 'bg-[#0a1510] text-emerald-400/70'
                    }`}
                  >
                    {/* Header row */}
                    <div className="flex items-center justify-between gap-2 mb-1.5 w-full min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {cfg && (
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                        )}
                        <span className="truncate">{h}</span>
                      </div>
                      {ci === visibleIndices[0] && (
                        <span className="flex-shrink-0 font-mono text-[9px] font-normal normal-case tracking-normal text-emerald-400/40 tabular-nums">
                          {filter ? `${filtered.length}/${rows.length}` : rows.length} righe
                        </span>
                      )}
                    </div>

                    {/* Role toolbar — always rendered, visible on group-hover */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-150">
                      {ROLES.map((r) => {
                        const rcfg = ROLE_CONFIG[r];
                        const isActive = role === r;
                        return (
                          <button
                            key={r}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleRoleChange(h, r);
                            }}
                            className={`px-1.5 py-0.5 font-mono text-[10px] rounded border transition-all ${
                              isActive ? rcfg.btnActive : rcfg.btnInactive
                            }`}
                          >
                            {rcfg.label}
                          </button>
                        );
                      })}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, ri) => (
              <tr
                key={ri}
                className={`border-b border-[#111] hover:brightness-110 transition-colors ${
                  ri % 2 === 0 ? 'bg-[#0d0d0d]' : 'bg-[#0f0f0f]'
                }`}
              >
                {visibleIndices.map((ci) => {
                  const h = headers[ci]!;
                  const role = columnRoles[h];
                  const cfg = role ? ROLE_CONFIG[role] : null;
                  return (
                    <td
                      key={ci}
                      className={`px-4 py-1.5 font-mono text-xs whitespace-nowrap border-r border-[#111] last:border-r-0 transition-colors ${
                        cfg ? cfg.tdBg : ''
                      } ${role === 'ignore' ? 'text-gray-400/35' : 'text-emerald-300/80'}`}
                    >
                      {row[ci] ?? ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="flex items-center justify-center py-12 text-emerald-400/30 font-mono text-sm">
            no matching rows
          </div>
        )}
      </div>
    </div>
  );
}
