import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles, Loader2, AlertCircle, ChevronRight, ChevronDown,
  List, GitBranch, Wand2, X, ThumbsUp, ThumbsDown, HelpCircle,
  Pencil, Check, Zap, FlaskConical, Trash2, RefreshCw, Braces, Plus,
  Layers, Bot, Save, RotateCcw,
} from 'lucide-react';
import type { useAnalysis, AnalysisRow, RowStatus } from '../../hooks/useAnalysis';
import type { KbDocument } from '../../lib/supabase';
import { ChatPanel } from './ChatPanel';
import { SlotLabelDisplay, SlotPathDisplay } from './SlotPathDisplay';
import {
  collectDirectChildSlots,
  isLeafSlot,
  isSlotHiddenByCollapse,
  orderAnalysisRowsDepthFirst,
  slotsWithDirectChildren,
} from '../../lib/analysisTree';

export type AnalysisApi = ReturnType<typeof useAnalysis>;

interface AnalysisViewProps {
  doc: KbDocument;
  documentText: string | null;
  analysisApi: AnalysisApi;
  onHasData?: (v: boolean) => void;
  generateTrigger?: number;
  /** When true, action buttons live in MainPanel toolbar. */
  externalToolbar?: boolean;
  affinaOpen?: boolean;
  onAffinaOpenChange?: (open: boolean) => void;
  testOpen?: boolean;
  onTestOpenChange?: (open: boolean) => void;
  /** Corpus descriptions keyed by leaf path (for IA confirmation generation). */
  leafDescriptionMap?: Map<string, string> | null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type EditField = 'question' | 'no_match_1' | 'no_match_2' | 'no_match_3' | 'confirmation_text';

// ── Status helpers ────────────────────────────────────────────────────────────

function statusBorderClass(status: RowStatus | undefined) {
  if (status === 'approved') return 'border-l-emerald-400';
  if (status === 'rejected') return 'border-l-red-500';
  if (status === 'uncertain') return 'border-l-amber-400';
  return 'border-l-transparent';
}

function statusBgClass(status: RowStatus | undefined) {
  if (status === 'approved') return 'bg-emerald-400/[0.06]';
  if (status === 'rejected') return 'bg-red-500/[0.06]';
  if (status === 'uncertain') return 'bg-amber-400/[0.06]';
  return '';
}

// ── Grammar modal ─────────────────────────────────────────────────────────────

function GrammarModal({ grammar, onClose }: {
  grammar: import('../../hooks/useAnalysis').GrammarEntry;
  onClose: () => void;
}) {
  const mappingEntries = Object.entries(grammar.mappings);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-lg bg-[#070d09] border border-[#1a3a2a] rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1a3a2a]">
          <div className="flex items-center gap-2 text-emerald-400/70">
            <Braces className="w-3.5 h-3.5" />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-widest">Grammatica</span>
          </div>
          <button onClick={onClose} className="text-emerald-400/30 hover:text-emerald-400/70 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-emerald-400/40 mb-1.5">Regex</p>
            <pre className="bg-[#0a1510] border border-[#1a3a2a] rounded px-3 py-2.5 font-mono text-[11px] text-emerald-300/80 whitespace-pre-wrap break-all leading-relaxed">{grammar.regex}</pre>
          </div>
          {mappingEntries.length > 0 && (
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-emerald-400/40 mb-1.5">Mappings</p>
              <table className="w-full border-collapse">
                <tbody>
                  {mappingEntries.map(([gn, path]) => (
                    <tr key={gn} className="border-b border-[#1a3a2a] last:border-0">
                      <td className="px-2 py-1.5 font-mono text-[11px] text-amber-300/80 bg-[#0a1510] border-r border-[#1a3a2a] w-1/3">{gn}</td>
                      <td className="px-2 py-1.5 font-mono text-[11px] text-emerald-300/70 bg-[#080e0a]">{path}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Cell overlay toolbar ──────────────────────────────────────────────────────

type HoverAction = 'approve' | 'reject' | 'uncertain' | null;

function cellTextColor(status: RowStatus | undefined, hover: HoverAction): string {
  const effective = hover ?? status;
  if (effective === 'approved') return 'text-emerald-300/90';
  if (effective === 'rejected') return 'text-red-300/80';
  if (effective === 'uncertain') return 'text-amber-300/80';
  return 'text-orange-300/75';
}

function CellActions({
  status,
  canEdit,
  grammar,
  isDirty,
  isRegening,
  onApprove,
  onReject,
  onUncertain,
  onEdit,
  onDelete,
  onShowGrammar,
  onAddChild,
  onAddSibling,
  onRegen,
  onHoverChange,
}: {
  status: RowStatus | undefined;
  canEdit: boolean;
  grammar?: import('../../hooks/useAnalysis').GrammarEntry | null;
  isDirty?: boolean;
  isRegening?: boolean;
  onApprove: () => void;
  onReject: () => void;
  onUncertain: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onShowGrammar?: () => void;
  onAddChild?: () => void;
  onAddSibling?: () => void;
  onRegen?: () => void;
  onHoverChange?: (a: HoverAction) => void;
}) {
  return (
    <div className="absolute top-1/2 right-2 -translate-y-1/2 z-40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto flex items-center gap-0.5 bg-[#060c08]/95 border border-[#1a3a2a] rounded px-1.5 py-1 shadow-2xl">
      <button
        onMouseDown={(e) => { e.preventDefault(); onApprove(); }}
        onMouseEnter={() => onHoverChange?.('approve')}
        onMouseLeave={() => onHoverChange?.(null)}
        title="Valida"
        className={`p-0.5 rounded transition-colors ${status === 'approved' ? 'text-emerald-400' : 'text-emerald-400/40 hover:text-emerald-400'}`}
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>
      <button
        onMouseDown={(e) => { e.preventDefault(); onReject(); }}
        onMouseEnter={() => onHoverChange?.('reject')}
        onMouseLeave={() => onHoverChange?.(null)}
        title="Rifiuta"
        className={`p-0.5 rounded transition-colors ${status === 'rejected' ? 'text-red-400' : 'text-red-400/40 hover:text-red-400'}`}
      >
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>
      <button
        onMouseDown={(e) => { e.preventDefault(); onUncertain(); }}
        onMouseEnter={() => onHoverChange?.('uncertain')}
        onMouseLeave={() => onHoverChange?.(null)}
        title="Incerto"
        className={`p-0.5 rounded transition-colors ${status === 'uncertain' ? 'text-amber-400' : 'text-amber-400/40 hover:text-amber-400'}`}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {canEdit && onEdit && (
        <>
          <div className="w-px h-3 bg-[#1a3a2a] mx-0.5" />
          <button
            onMouseDown={(e) => { e.preventDefault(); onEdit(); }}
            title="Modifica"
            className="p-0.5 rounded text-emerald-400/40 hover:text-emerald-400 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </>
      )}
      {grammar && onShowGrammar && (
        <>
          <div className="w-px h-3 bg-[#1a3a2a] mx-0.5" />
          <button
            onMouseDown={(e) => { e.preventDefault(); onShowGrammar(); }}
            title="Mostra grammatica"
            className="p-0.5 rounded text-sky-400/40 hover:text-sky-400 transition-colors"
          >
            <Braces className="w-3.5 h-3.5" />
          </button>
        </>
      )}
      {onAddChild && (
        <>
          <div className="w-px h-3 bg-[#1a3a2a] mx-0.5" />
          <button
            onMouseDown={(e) => { e.preventDefault(); onAddChild(); }}
            title="Aggiungi figlio"
            className="p-0.5 rounded text-emerald-400/40 hover:text-emerald-400 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </>
      )}
      {onAddSibling && (
        <button
          onMouseDown={(e) => { e.preventDefault(); onAddSibling(); }}
          title="Aggiungi sibling"
          className="p-0.5 rounded text-emerald-400/25 hover:text-emerald-400/70 transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
      )}
      {(isDirty || isRegening) && onRegen && (
        <>
          <div className="w-px h-3 bg-[#1a3a2a] mx-0.5" />
          <button
            onMouseDown={(e) => { e.preventDefault(); onRegen(); }}
            disabled={isRegening}
            title="Ricalcola domanda e grammatica"
            className={`p-0.5 rounded transition-colors ${isRegening ? 'text-amber-400/40 cursor-not-allowed' : 'text-amber-400/70 hover:text-amber-400'}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRegening ? 'animate-spin' : ''}`} />
          </button>
        </>
      )}
      {onDelete && (
        <>
          <div className="w-px h-3 bg-[#1a3a2a] mx-0.5" />
          <button
            onMouseDown={(e) => { e.preventDefault(); onDelete(); }}
            title="Elimina nodo e figli"
            className="p-0.5 rounded text-red-400/40 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

// ── Editable data cell ────────────────────────────────────────────────────────

function DataCell({
  field,
  value,
  editingField,
  draftValue,
  onDraftChange,
  onSave,
  onCancel,
  onStartEdit,
  tdClass,
}: {
  field: EditField;
  value: string | null;
  editingField: EditField | null;
  draftValue: string;
  onDraftChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onStartEdit: (f: EditField) => void;
  tdClass?: string;
}) {
  const [cellStatus, setCellStatus] = useState<RowStatus>(null);
  const [hoverAction, setHoverAction] = useState<HoverAction>(null);
  const isEditing = editingField === field;

  const toggleStatus = (s: RowStatus) =>
    setCellStatus((prev) => (prev === s ? null : s));

  if (isEditing) {
    return (
      <td className={`px-3 py-2 border-r border-[#1a3a2a] align-top ${tdClass ?? ''}`}>
        <textarea
          autoFocus
          value={draftValue}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSave(); }
            if (e.key === 'Escape') onCancel();
          }}
          rows={2}
          className="w-full bg-[#0a1510] border border-emerald-400/40 rounded px-2 py-1 font-sans text-xs text-emerald-200 placeholder-emerald-400/20 resize-none focus:outline-none focus:border-emerald-400/70 transition-colors"
        />
        <div className="flex items-center gap-1 mt-1">
          <button
            onClick={onSave}
            className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-400/20 border border-emerald-400/40 rounded text-emerald-400 hover:bg-emerald-400/30 transition-colors font-mono text-[10px]"
          >
            <Check className="w-3 h-3" />Salva
          </button>
          <button onClick={onCancel} className="p-0.5 text-emerald-400/30 hover:text-emerald-400/60 transition-colors">
            <X className="w-3 h-3" />
          </button>
        </div>
      </td>
    );
  }

  const textColor = cellTextColor(cellStatus, hoverAction);

  return (
    <td className={`group relative px-3 py-1.5 border-r border-[#1a3a2a] align-middle ${tdClass ?? ''}`}>
      {value
        ? <p className={`font-sans text-xs leading-relaxed pr-8 transition-colors ${textColor}`}>{value}</p>
        : <span className="text-emerald-400/15 font-mono text-[10px]">—</span>
      }
      {editingField === null && (
        <CellActions
          status={cellStatus}
          canEdit={true}
          onApprove={() => toggleStatus('approved')}
          onReject={() => toggleStatus('rejected')}
          onUncertain={() => toggleStatus('uncertain')}
          onEdit={() => onStartEdit(field)}
          onHoverChange={setHoverAction}
        />
      )}
    </td>
  );
}

// ── Path editor ───────────────────────────────────────────────────────────────

function PathEditor({
  value,
  onChange,
  onConfirm,
  onCancel,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onConfirm();
          if (e.key === 'Escape') onCancel();
        }}
        title="Modifica il path — usa . per spezzare i livelli"
        placeholder="es. esami.funzionali.spirometria.broncodilatatore"
        className="bg-[#0a1510] border border-emerald-400/50 rounded px-1.5 py-0.5 font-mono text-xs text-emerald-200 focus:outline-none focus:border-emerald-400/80 min-w-[200px] w-full max-w-lg transition-colors"
      />
      <div className="flex items-center gap-1">
        <button onClick={onConfirm} className="p-0.5 text-emerald-400/60 hover:text-emerald-400 transition-colors" title="Conferma">
          <Check className="w-3 h-3" />
        </button>
        <button onClick={onCancel} className="p-0.5 text-emerald-400/30 hover:text-emerald-400/60 transition-colors" title="Annulla">
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ── Tree node ─────────────────────────────────────────────────────────────────

const TreeNode = memo(function TreeNode({
  row,
  originalIndex,
  hasChildren,
  isCollapsed,
  isHidden,
  isStart,
  onToggleCollapse,
  onUpdateRow,
  onDeleteRow,
  onAddRow,
  onRestructurePath,
  isDirty,
  isRegening,
  onRegenRoot,
}: {
  row: AnalysisRow;
  originalIndex: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  isHidden: boolean;
  isStart: boolean;
  onToggleCollapse: (slot: string) => void;
  onUpdateRow: (idx: number, updates: Partial<AnalysisRow>) => void;
  onDeleteRow: (idx: number) => void;
  onAddRow: (slot: string) => void;
  onRestructurePath: (idx: number, newPath: string) => void;
  isDirty: boolean;
  isRegening: boolean;
  onRegenRoot: (root: string) => void;
}) {
  const depth = row.slot_filling.split('.').length - 1;
  const parentSlot = row.slot_filling.split('.').slice(0, -1).join('.');
  const isRoot = depth === 0;

  const [editingField, setEditingField] = useState<EditField | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [grammarOpen, setGrammarOpen] = useState(false);
  const [addMode, setAddMode] = useState<'child' | 'sibling' | null>(null);
  const [addDraft, setAddDraft] = useState('');
  const [editingPath, setEditingPath] = useState(false);
  const [pathDraft, setPathDraft] = useState('');

  const confirmPathEdit = () => {
    const trimmed = pathDraft.trim();
    if (trimmed) onRestructurePath(originalIndex, trimmed);
    setEditingPath(false);
  };

  const confirmAdd = () => {
    const name = addDraft.trim().toLowerCase();
    if (!name || !addMode) return;
    const targetParent = addMode === 'child' ? row.slot_filling : parentSlot;
    onAddRow(targetParent ? `${targetParent}.${name}` : name);
    setAddMode(null);
    setAddDraft('');
  };

  const startEdit = (field: EditField) => {
    const val = field === 'question' ? row.question
      : field === 'no_match_1' ? row.no_match_1
      : field === 'no_match_2' ? row.no_match_2
      : row.no_match_3;
    setDraftValue(val ?? '');
    setEditingField(field);
  };

  const saveEdit = () => {
    if (!editingField) return;
    onUpdateRow(originalIndex, { [editingField]: draftValue || null, status: null });
    setEditingField(null);
  };

  const cancelEdit = () => setEditingField(null);

  const handleValidation = (status: RowStatus) =>
    onUpdateRow(originalIndex, { status: row.status === status ? null : status });

  const [slotHover, setSlotHover] = useState<HoverAction>(null);
  const slotTextColor = isStart ? 'text-amber-300 font-bold' : cellTextColor(row.status, slotHover) + (isRoot ? ' font-semibold' : '');

  const rowBg = isStart
    ? 'bg-[#0d1a0a] border-l-2 border-l-amber-400/70'
    : row.status
      ? `${statusBgClass(row.status)} border-l-2 ${statusBorderClass(row.status)}`
      : isRoot
        ? 'bg-[#0a1a10] border-l-2 border-l-transparent'
        : 'bg-[#0d0d0d] border-l-2 border-l-transparent';

  return (
    <tr className={`${isHidden ? 'hidden' : ''} hover:brightness-110 ${rowBg}`} aria-hidden={isHidden}>
      {/* Slot filling */}
      <td className="group relative px-3 py-1.5 border-r border-[#1a3a2a] align-top min-w-[220px]">
        <div
          className="flex items-center gap-1.5 pr-8"
          style={{ paddingLeft: `${depth * 18}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => onToggleCollapse(row.slot_filling)}
              className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-emerald-400/50 hover:text-emerald-400"
              aria-label={isCollapsed ? 'Espandi' : 'Collassa'}
            >
              {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}
          {editingPath ? (
            <PathEditor
              value={pathDraft}
              onChange={setPathDraft}
              onConfirm={confirmPathEdit}
              onCancel={() => setEditingPath(false)}
            />
          ) : (
            <SlotLabelDisplay path={row.slot_filling} className={slotTextColor} />
          )}
          {!editingPath && isStart && (
            <span className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-400/15 border border-amber-400/30 text-amber-300 font-mono text-[9px] font-bold uppercase tracking-wider">
              <Zap className="w-2.5 h-2.5" />START
            </span>
          )}
          {!editingPath && row.status === 'approved' && <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          {!editingPath && row.status === 'rejected' && <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-red-500" />}
          {!editingPath && row.status === 'uncertain' && <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" />}
          {!editingPath && (isDirty || isRegening) && (
            <button
              onClick={() => onRegenRoot(row.slot_filling)}
              disabled={isRegening}
              title="La struttura dell'albero è cambiata. Ricalcola domande e grammatiche."
              className={`flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded border font-mono text-[9px] font-bold uppercase tracking-wider transition-colors ${
                isRegening
                  ? 'border-amber-400/30 bg-amber-400/10 text-amber-400/60 cursor-not-allowed'
                  : 'border-amber-400/50 bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 animate-pulse'
              }`}
            >
              <RefreshCw className={`w-2.5 h-2.5 ${isRegening ? 'animate-spin' : ''}`} />
              {isRegening ? 'Ricalcolo…' : 'Ricalcola'}
            </button>
          )}
        </div>
        {!editingPath && editingField === null && (
          <CellActions
            status={row.status}
            canEdit={true}
            grammar={row.grammar}
            isDirty={isDirty}
            isRegening={isRegening}
            onApprove={() => handleValidation('approved')}
            onReject={() => handleValidation('rejected')}
            onUncertain={() => handleValidation('uncertain')}
            onEdit={() => { setPathDraft(row.slot_filling); setEditingPath(true); }}
            onDelete={() => onDeleteRow(originalIndex)}
            onShowGrammar={row.grammar ? () => setGrammarOpen(true) : undefined}
            onAddChild={() => { setAddMode('child'); setAddDraft(''); }}
            onAddSibling={depth > 0 ? () => { setAddMode('sibling'); setAddDraft(''); } : undefined}
            onRegen={() => onRegenRoot(row.slot_filling)}
            onHoverChange={setSlotHover}
          />
        )}
        {addMode && (
          <div className="flex items-center gap-1 mt-1 pl-1">
            <input
              autoFocus
              value={addDraft}
              onChange={(e) => setAddDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmAdd();
                if (e.key === 'Escape') { setAddMode(null); setAddDraft(''); }
              }}
              placeholder={addMode === 'child' ? 'nome figlio…' : 'nome sibling…'}
              className="bg-[#0a1510] border border-emerald-400/40 rounded px-1.5 py-0.5 font-mono text-xs text-emerald-200 placeholder-emerald-400/20 focus:outline-none focus:border-emerald-400/70 w-36 transition-colors"
            />
            <button onClick={confirmAdd} className="p-0.5 text-emerald-400/60 hover:text-emerald-400 transition-colors">
              <Check className="w-3 h-3" />
            </button>
            <button onClick={() => { setAddMode(null); setAddDraft(''); }} className="p-0.5 text-emerald-400/30 hover:text-emerald-400/60 transition-colors">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        {grammarOpen && row.grammar && (
          <GrammarModal grammar={row.grammar} onClose={() => setGrammarOpen(false)} />
        )}
      </td>

      <DataCell
        field="question"
        value={row.question}
        editingField={editingField}
        draftValue={draftValue}
        onDraftChange={setDraftValue}
        onSave={saveEdit}
        onCancel={cancelEdit}
        onStartEdit={startEdit}
      />
      <DataCell
        field="no_match_1"
        value={row.no_match_1}
        editingField={editingField}
        draftValue={draftValue}
        onDraftChange={setDraftValue}
        onSave={saveEdit}
        onCancel={cancelEdit}
        onStartEdit={startEdit}
      />
      <DataCell
        field="no_match_2"
        value={row.no_match_2}
        editingField={editingField}
        draftValue={draftValue}
        onDraftChange={setDraftValue}
        onSave={saveEdit}
        onCancel={cancelEdit}
        onStartEdit={startEdit}
      />
      <DataCell
        field="no_match_3"
        value={row.no_match_3}
        editingField={editingField}
        draftValue={draftValue}
        onDraftChange={setDraftValue}
        onSave={saveEdit}
        onCancel={cancelEdit}
        onStartEdit={startEdit}
      />
    </tr>
  );
});

// ── Tree table ────────────────────────────────────────────────────────────────

const COL_HEADERS = ['Albero', 'Domanda', '1° no match', '2° no match', '3° no match'];

function TreeTable({
  rows,
  onUpdateRow,
  onDeleteRow,
  onAddRow,
  onRestructurePath,
  dirtyRoots,
  regeningRoots,
  onRegenRoot,
}: {
  rows: AnalysisRow[];
  onUpdateRow: (idx: number, updates: Partial<AnalysisRow>) => void;
  onDeleteRow: (idx: number) => void;
  onAddRow: (slot: string) => void;
  onRestructurePath: (idx: number, newPath: string) => void;
  dirtyRoots: string[];
  regeningRoots: string[];
  onRegenRoot: (root: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const collapsedKey = useMemo(() => [...collapsed].sort().join('\0'), [collapsed]);

  const orderedRows = useMemo(() => orderAnalysisRowsDepthFirst(rows), [rows]);
  const indexBySlot = useMemo(
    () => new Map(rows.map((r, i) => [r.slot_filling, i])),
    [rows],
  );
  const parentSlots = useMemo(() => slotsWithDirectChildren(rows), [rows]);

  const rootNodes = useMemo(
    () => rows.filter((r) => !r.slot_filling.includes('.')),
    [rows],
  );
  const singleRoot = rootNodes.length === 1 ? rootNodes[0]!.slot_filling : null;

  const onToggleCollapse = useCallback((slot: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
  }, []);

  const displayRows = useMemo(() => {
    const collapsedSet = new Set(collapsedKey ? collapsedKey.split('\0') : []);
    const forestLevel = singleRoot !== null ? 1 : 0;
    let firstForestIdx = -1;

    return orderedRows.map((row, orderIdx) => {
      const originalIndex = indexBySlot.get(row.slot_filling) ?? -1;
      const depth = row.slot_filling.split('.').length - 1;
      const isHidden = isSlotHiddenByCollapse(row.slot_filling, collapsedSet);
      const isCollapsed = collapsedSet.has(row.slot_filling);
      const hasChildren = parentSlots.has(row.slot_filling);

      if (depth === forestLevel && firstForestIdx < 0) {
        firstForestIdx = orderIdx;
      }
      const needsSeparator = depth === forestLevel && orderIdx !== firstForestIdx && !isHidden;

      return {
        row,
        originalIndex,
        hasChildren,
        isCollapsed,
        isHidden,
        needsSeparator,
      };
    });
  }, [orderedRows, indexBySlot, parentSlots, collapsedKey, singleRoot]);

  return (
    <table className="w-full border-collapse text-left">
      <thead className="sticky top-0 z-10 bg-[#080e0a]">
        <tr className="border-b border-[#1a3a2a]">
          {COL_HEADERS.map((h, i) => (
            <th
              key={i}
              className={`px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-emerald-400/50 ${i < COL_HEADERS.length - 1 ? 'border-r border-[#1a3a2a]' : ''}`}
              style={i === 0 ? { minWidth: 280 } : i === 1 ? { minWidth: 200 } : i > 1 ? { minWidth: 150 } : undefined}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {displayRows.map((item) => (
          <Fragment key={item.originalIndex}>
            {item.needsSeparator && (
              <tr aria-hidden="true">
                <td colSpan={5} className="p-0 h-px bg-[#1a3a2a]" />
              </tr>
            )}
            <TreeNode
              row={item.row}
              originalIndex={item.originalIndex}
              hasChildren={item.hasChildren}
              isCollapsed={item.isCollapsed}
              isHidden={item.isHidden}
              isStart={item.row.slot_filling === singleRoot}
              onToggleCollapse={onToggleCollapse}
              onUpdateRow={onUpdateRow}
              onDeleteRow={onDeleteRow}
              onAddRow={onAddRow}
              onRestructurePath={onRestructurePath}
              isDirty={dirtyRoots.includes(item.row.slot_filling)}
              isRegening={regeningRoots.includes(item.row.slot_filling)}
              onRegenRoot={onRegenRoot}
            />
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

// ── Split layout: tree left · messages right ─────────────────────────────────

const MSG_HEADERS = ['Domanda', '1° no match', '2° no match', '3° no match', 'Conferma selezione'];

const SplitMessageRow = memo(function SplitMessageRow({
  row,
  originalIndex,
  isHighlighted,
  isStart,
  isLeaf,
  onUpdateRow,
  onDeleteRow,
  onAddRow,
  onRestructurePath,
  isDirty,
  isRegening,
  onRegenRoot,
}: {
  row: AnalysisRow;
  originalIndex: number;
  isHighlighted: boolean;
  isStart: boolean;
  isLeaf: boolean;
  onUpdateRow: (idx: number, updates: Partial<AnalysisRow>) => void;
  onDeleteRow: (idx: number) => void;
  onAddRow: (slot: string) => void;
  onRestructurePath: (idx: number, newPath: string) => void;
  isDirty: boolean;
  isRegening: boolean;
  onRegenRoot: (root: string) => void;
}) {
  const depth = row.slot_filling.split('.').length - 1;
  const parentSlot = row.slot_filling.split('.').slice(0, -1).join('.');
  const [editingField, setEditingField] = useState<EditField | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [grammarOpen, setGrammarOpen] = useState(false);
  const [slotHover, setSlotHover] = useState<HoverAction>(null);

  const startEdit = (field: EditField) => {
    const val = field === 'question' ? row.question
      : field === 'no_match_1' ? row.no_match_1
      : field === 'no_match_2' ? row.no_match_2
      : field === 'no_match_3' ? row.no_match_3
      : row.confirmation_text;
    setDraftValue(val ?? '');
    setEditingField(field);
  };

  const saveEdit = () => {
    if (!editingField) return;
    onUpdateRow(originalIndex, { [editingField]: draftValue || null, status: null });
    setEditingField(null);
  };

  const handleValidation = (status: RowStatus) =>
    onUpdateRow(originalIndex, { status: row.status === status ? null : status });

  const rowBg = isHighlighted
    ? 'bg-sky-400/[0.08]'
    : isStart
      ? 'bg-[#0d1a0a]'
      : row.status
        ? statusBgClass(row.status)
        : 'bg-[#0d0d0d]';

  return (
    <tr className={`${rowBg} hover:brightness-110`}>
      <td className="group relative px-3 py-1.5 border-r border-[#1a3a2a] align-top min-w-[200px]">
        {editingField === 'question' ? (
          <textarea
            autoFocus
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); }
              if (e.key === 'Escape') setEditingField(null);
            }}
            rows={2}
            className="w-full bg-[#0a1510] border border-emerald-400/40 rounded px-2 py-1 font-sans text-xs text-emerald-200 resize-none focus:outline-none focus:border-emerald-400/70"
          />
        ) : row.question ? (
          <p className={`font-sans text-xs leading-relaxed pr-8 ${cellTextColor(row.status, slotHover)}`}>{row.question}</p>
        ) : (
          <span className="text-emerald-400/15 font-mono text-[10px]">—</span>
        )}
        {editingField === null && (
          <CellActions
            status={row.status}
            canEdit={true}
            grammar={row.grammar}
            isDirty={isDirty}
            isRegening={isRegening}
            onApprove={() => handleValidation('approved')}
            onReject={() => handleValidation('rejected')}
            onUncertain={() => handleValidation('uncertain')}
            onEdit={() => startEdit('question')}
            onShowGrammar={row.grammar ? () => setGrammarOpen(true) : undefined}
            onRegen={() => onRegenRoot(row.slot_filling)}
            onHoverChange={setSlotHover}
          />
        )}
        {grammarOpen && row.grammar && (
          <GrammarModal grammar={row.grammar} onClose={() => setGrammarOpen(false)} />
        )}
      </td>
      <DataCell field="no_match_1" value={row.no_match_1} editingField={editingField} draftValue={draftValue} onDraftChange={setDraftValue} onSave={saveEdit} onCancel={() => setEditingField(null)} onStartEdit={startEdit} />
      <DataCell field="no_match_2" value={row.no_match_2} editingField={editingField} draftValue={draftValue} onDraftChange={setDraftValue} onSave={saveEdit} onCancel={() => setEditingField(null)} onStartEdit={startEdit} />
      <DataCell field="no_match_3" value={row.no_match_3} editingField={editingField} draftValue={draftValue} onDraftChange={setDraftValue} onSave={saveEdit} onCancel={() => setEditingField(null)} onStartEdit={startEdit} />
      {isLeaf ? (
        <DataCell field="confirmation_text" value={row.confirmation_text} editingField={editingField} draftValue={draftValue} onDraftChange={setDraftValue} onSave={saveEdit} onCancel={() => setEditingField(null)} onStartEdit={startEdit} tdClass="border-r-0" />
      ) : (
        <td className="px-3 py-1.5 border-r-0 align-middle">
          <span className="text-emerald-400/10 font-mono text-[10px]">—</span>
        </td>
      )}
    </tr>
  );
});

function AgentConfigBar({
  startQuestion,
  confirmationPreamble,
  onStartQuestionChange,
  onPreambleChange,
  onGenerateConfirmations,
  generatingConfirmations,
  canGenerate,
}: {
  startQuestion: string;
  confirmationPreamble: string;
  onStartQuestionChange: (v: string) => void;
  onPreambleChange: (v: string) => void;
  onGenerateConfirmations: () => void;
  generatingConfirmations: boolean;
  canGenerate: boolean;
}) {
  return (
    <div className="flex-shrink-0 px-4 py-3 border-b border-[#1a3a2a] bg-[#0a1510] grid grid-cols-1 lg:grid-cols-2 gap-3">
      <label className="flex flex-col gap-1 min-w-0">
        <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-400/50">Domanda di start</span>
        <textarea
          value={startQuestion}
          onChange={(e) => onStartQuestionChange(e.target.value)}
          placeholder="Es: Buongiorno, di quale esame ha bisogno?"
          rows={2}
          className="w-full bg-[#0a1510] border border-[#1a3a2a] rounded px-3 py-2 font-sans text-xs text-emerald-200 placeholder-emerald-400/20 resize-none focus:outline-none focus:border-emerald-400/40"
        />
      </label>
      <div className="flex flex-col gap-2 min-w-0">
        <label className="flex flex-col gap-1 min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-400/50">Preambolo di conferma</span>
          <input
            type="text"
            value={confirmationPreamble}
            onChange={(e) => onPreambleChange(e.target.value)}
            placeholder="Quindi confermo:"
            className="w-full bg-[#0a1510] border border-[#1a3a2a] rounded px-3 py-2 font-sans text-xs text-emerald-200 placeholder-emerald-400/20 focus:outline-none focus:border-emerald-400/40"
          />
        </label>
        <button
          type="button"
          onClick={onGenerateConfirmations}
          disabled={!canGenerate || generatingConfirmations}
          className="self-start flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] font-semibold text-emerald-900 bg-amber-400 rounded hover:bg-amber-300 transition-colors disabled:opacity-40"
        >
          {generatingConfirmations ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
          {generatingConfirmations ? 'Generazione conferme…' : 'Genera conferme IA'}
        </button>
      </div>
    </div>
  );
}

function SplitAgentTable({
  rows,
  onUpdateRow,
  onDeleteRow,
  onAddRow,
  onRestructurePath,
  dirtyRoots,
  regeningRoots,
  onRegenRoot,
}: {
  rows: AnalysisRow[];
  onUpdateRow: (idx: number, updates: Partial<AnalysisRow>) => void;
  onDeleteRow: (idx: number) => void;
  onAddRow: (slot: string) => void;
  onRestructurePath: (idx: number, newPath: string) => void;
  dirtyRoots: string[];
  regeningRoots: string[];
  onRegenRoot: (root: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const collapsedKey = useMemo(() => [...collapsed].sort().join('\0'), [collapsed]);

  const orderedRows = useMemo(() => orderAnalysisRowsDepthFirst(rows), [rows]);
  const indexBySlot = useMemo(() => new Map(rows.map((r, i) => [r.slot_filling, i])), [rows]);
  const parentSlots = useMemo(() => slotsWithDirectChildren(rows), [rows]);
  const rootNodes = useMemo(() => rows.filter((r) => !r.slot_filling.includes('.')), [rows]);
  const singleRoot = rootNodes.length === 1 ? rootNodes[0]!.slot_filling : null;
  const allSlots = useMemo(() => rows.map((r) => r.slot_filling), [rows]);

  const highlightSlots = useMemo(() => {
    if (!hoveredSlot) return new Set<string>();
    return collectDirectChildSlots(rows, hoveredSlot);
  }, [hoveredSlot, rows]);

  const onToggleCollapse = useCallback((slot: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
  }, []);

  const displayRows = useMemo(() => {
    const collapsedSet = new Set(collapsedKey ? collapsedKey.split('\0') : []);
    return orderedRows.map((row) => {
      const originalIndex = indexBySlot.get(row.slot_filling) ?? -1;
      const depth = row.slot_filling.split('.').length - 1;
      return {
        row,
        originalIndex,
        depth,
        isHidden: isSlotHiddenByCollapse(row.slot_filling, collapsedSet),
        isCollapsed: collapsedSet.has(row.slot_filling),
        hasChildren: parentSlots.has(row.slot_filling),
      };
    });
  }, [orderedRows, indexBySlot, parentSlots, collapsedKey]);

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="w-[260px] flex-shrink-0 flex flex-col border-r border-[#1a3a2a] bg-[#080e0a]">
        <div className="flex-shrink-0 px-3 py-2 border-b border-[#1a3a2a] font-mono text-[10px] uppercase tracking-widest text-emerald-400/50 sticky top-0 bg-[#080e0a] z-10">
          Albero
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {displayRows.map((item) => {
            if (item.isHidden) return null;
            const isHovered = hoveredSlot === item.row.slot_filling;
            const isChildHighlight = highlightSlots.has(item.row.slot_filling);
            return (
              <div
                key={item.originalIndex}
                className={`flex items-center gap-1 px-2 py-1.5 border-b border-[#111] min-h-[2.75rem] cursor-default transition-colors ${
                  isChildHighlight ? 'bg-sky-400/15' : isHovered ? 'bg-emerald-400/10' : 'hover:bg-[#0f1a12]'
                }`}
                style={{ paddingLeft: `${8 + item.depth * 14}px` }}
                onMouseEnter={() => setHoveredSlot(item.row.slot_filling)}
                onMouseLeave={() => setHoveredSlot(null)}
              >
                {item.hasChildren ? (
                  <button
                    type="button"
                    onClick={() => onToggleCollapse(item.row.slot_filling)}
                    className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-emerald-400/50 hover:text-emerald-400"
                  >
                    {item.isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                ) : (
                  <span className="w-4 flex-shrink-0" />
                )}
                <SlotLabelDisplay
                  path={item.row.slot_filling}
                  className={item.row.slot_filling === singleRoot ? 'font-bold text-amber-300' : ''}
                />
                {item.row.slot_filling === singleRoot && (
                  <Zap className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[#080e0a]">
            <tr className="border-b border-[#1a3a2a]">
              {MSG_HEADERS.map((h, i) => (
                <th
                  key={h}
                  className={`px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-emerald-400/50 ${i < MSG_HEADERS.length - 1 ? 'border-r border-[#1a3a2a]' : ''}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((item) => (
              <Fragment key={item.originalIndex}>
                {!item.isHidden && (
                  <SplitMessageRow
                    row={item.row}
                    originalIndex={item.originalIndex}
                    isHighlighted={highlightSlots.has(item.row.slot_filling)}
                    isStart={item.row.slot_filling === singleRoot}
                    isLeaf={isLeafSlot(allSlots, item.row.slot_filling)}
                    onUpdateRow={onUpdateRow}
                    onDeleteRow={onDeleteRow}
                    onAddRow={onAddRow}
                    onRestructurePath={onRestructurePath}
                    isDirty={dirtyRoots.includes(item.row.slot_filling)}
                    isRegening={regeningRoots.includes(item.row.slot_filling)}
                    onRegenRoot={onRegenRoot}
                  />
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Flat row ──────────────────────────────────────────────────────────────────

function FlatRow({
  row,
  rowIndex,
  isStart,
  needsSeparator,
  onUpdate,
  onDelete,
  onAddRow,
  onRestructurePath,
  isDirty,
  isRegening,
  onRegen,
}: {
  row: AnalysisRow;
  rowIndex: number;
  isStart: boolean;
  needsSeparator: boolean;
  onUpdate: (updates: Partial<AnalysisRow>) => void;
  onDelete: () => void;
  onAddRow: (slot: string) => void;
  onRestructurePath: (newPath: string) => void;
  isDirty: boolean;
  isRegening: boolean;
  onRegen: () => void;
}) {
  const depth = row.slot_filling.split('.').length - 1;
  const parentSlot = row.slot_filling.split('.').slice(0, -1).join('.');
  const [editingField, setEditingField] = useState<EditField | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [slotHover, setSlotHover] = useState<HoverAction>(null);
  const [grammarOpen, setGrammarOpen] = useState(false);
  const [editingPath, setEditingPath] = useState(false);
  const [pathDraft, setPathDraft] = useState('');

  const confirmPathEdit = () => {
    const trimmed = pathDraft.trim();
    if (trimmed) onRestructurePath(trimmed);
    setEditingPath(false);
  };
  const [addMode, setAddMode] = useState<'child' | 'sibling' | null>(null);
  const [addDraft, setAddDraft] = useState('');

  const confirmAdd = () => {
    const name = addDraft.trim().toLowerCase();
    if (!name || !addMode) return;
    const targetParent = addMode === 'child' ? row.slot_filling : parentSlot;
    onAddRow(targetParent ? `${targetParent}.${name}` : name);
    setAddMode(null);
    setAddDraft('');
  };

  const startEdit = (field: EditField) => {
    const val = field === 'question' ? row.question
      : field === 'no_match_1' ? row.no_match_1
      : field === 'no_match_2' ? row.no_match_2
      : row.no_match_3;
    setDraftValue(val ?? '');
    setEditingField(field);
  };

  const saveEdit = () => {
    if (!editingField) return;
    onUpdate({ [editingField]: draftValue || null, status: null });
    setEditingField(null);
  };

  const cancelEdit = () => setEditingField(null);

  const handleValidation = (status: RowStatus) =>
    onUpdate({ status: row.status === status ? null : status });

  const slotTextColor = isStart ? 'text-amber-300 font-bold' : cellTextColor(row.status, slotHover);

  const rowBg = isStart
    ? 'bg-[#0d1a0a] border-l-2 border-l-amber-400/70'
    : row.status
      ? `${statusBgClass(row.status)} border-l-2 ${statusBorderClass(row.status)}`
      : `${rowIndex % 2 === 0 ? 'bg-[#0d0d0d]' : 'bg-[#0f0f0f]'} border-l-2 border-l-transparent`;

  return (
    <Fragment>
      {needsSeparator && (
        <tr aria-hidden="true">
          <td colSpan={5} className="p-0 h-px bg-[#1a3a2a]" />
        </tr>
      )}
      <tr className={`transition-colors hover:brightness-110 ${rowBg}`}>
        <td className="group relative px-3 py-1.5 border-r border-[#1a3a2a] align-middle whitespace-nowrap">
          <div className="flex items-center gap-1.5 pr-8">
            {editingPath ? (
              <PathEditor
                value={pathDraft}
                onChange={setPathDraft}
                onConfirm={confirmPathEdit}
                onCancel={() => setEditingPath(false)}
                className="w-full max-w-lg"
              />
            ) : (
              <SlotPathDisplay path={row.slot_filling} className={slotTextColor} emphasizeLeaf />
            )}
            {!editingPath && isStart && (
              <span className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-400/15 border border-amber-400/30 text-amber-300 font-mono text-[9px] font-bold uppercase tracking-wider">
                <Zap className="w-2.5 h-2.5" />START
              </span>
            )}
            {!editingPath && (isDirty || isRegening) && (
              <button
                onClick={onRegen}
                disabled={isRegening}
                title="La struttura dell'albero è cambiata. Ricalcola domande e grammatiche."
                className={`flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded border font-mono text-[9px] font-bold uppercase tracking-wider transition-colors ${
                  isRegening
                    ? 'border-amber-400/30 bg-amber-400/10 text-amber-400/60 cursor-not-allowed'
                    : 'border-amber-400/50 bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 animate-pulse'
                }`}
              >
                <RefreshCw className={`w-2.5 h-2.5 ${isRegening ? 'animate-spin' : ''}`} />
                {isRegening ? 'Ricalcolo…' : 'Ricalcola'}
              </button>
            )}
          </div>
          {!editingPath && editingField === null && (
            <CellActions
              status={row.status}
              canEdit={true}
              grammar={row.grammar}
              isDirty={isDirty}
              isRegening={isRegening}
              onApprove={() => handleValidation('approved')}
              onReject={() => handleValidation('rejected')}
              onUncertain={() => handleValidation('uncertain')}
              onEdit={() => { setPathDraft(row.slot_filling); setEditingPath(true); }}
              onDelete={onDelete}
              onShowGrammar={row.grammar ? () => setGrammarOpen(true) : undefined}
              onAddChild={() => { setAddMode('child'); setAddDraft(''); }}
              onAddSibling={depth > 0 ? () => { setAddMode('sibling'); setAddDraft(''); } : undefined}
              onRegen={onRegen}
              onHoverChange={setSlotHover}
            />
          )}
          {addMode && (
            <div className="flex items-center gap-1 mt-1 pl-1">
              <input
                autoFocus
                value={addDraft}
                onChange={(e) => setAddDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmAdd();
                  if (e.key === 'Escape') { setAddMode(null); setAddDraft(''); }
                }}
                placeholder={addMode === 'child' ? 'nome figlio…' : 'nome sibling…'}
                className="bg-[#0a1510] border border-emerald-400/40 rounded px-1.5 py-0.5 font-mono text-xs text-emerald-200 placeholder-emerald-400/20 focus:outline-none focus:border-emerald-400/70 w-36 transition-colors"
              />
              <button onClick={confirmAdd} className="p-0.5 text-emerald-400/60 hover:text-emerald-400 transition-colors">
                <Check className="w-3 h-3" />
              </button>
              <button onClick={() => { setAddMode(null); setAddDraft(''); }} className="p-0.5 text-emerald-400/30 hover:text-emerald-400/60 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {grammarOpen && row.grammar && (
            <GrammarModal grammar={row.grammar} onClose={() => setGrammarOpen(false)} />
          )}
        </td>
        <DataCell
          field="question"
          value={row.question}
          editingField={editingField}
          draftValue={draftValue}
          onDraftChange={setDraftValue}
          onSave={saveEdit}
          onCancel={cancelEdit}
          onStartEdit={startEdit}
        />
        <DataCell
          field="no_match_1"
          value={row.no_match_1}
          editingField={editingField}
          draftValue={draftValue}
          onDraftChange={setDraftValue}
          onSave={saveEdit}
          onCancel={cancelEdit}
          onStartEdit={startEdit}
        />
        <DataCell
          field="no_match_2"
          value={row.no_match_2}
          editingField={editingField}
          draftValue={draftValue}
          onDraftChange={setDraftValue}
          onSave={saveEdit}
          onCancel={cancelEdit}
          onStartEdit={startEdit}
        />
        <DataCell
          field="no_match_3"
          value={row.no_match_3}
          editingField={editingField}
          draftValue={draftValue}
          onDraftChange={setDraftValue}
          onSave={saveEdit}
          onCancel={cancelEdit}
          onStartEdit={startEdit}
        />
      </tr>
    </Fragment>
  );
}

// ── Flat table ────────────────────────────────────────────────────────────────

function FlatTable({
  rows,
  onUpdateRow,
  onDeleteRow,
  onAddRow,
  onRestructurePath,
  dirtyRoots,
  regeningRoots,
  onRegenRoot,
}: {
  rows: AnalysisRow[];
  onUpdateRow: (idx: number, updates: Partial<AnalysisRow>) => void;
  onDeleteRow: (idx: number) => void;
  onAddRow: (slot: string) => void;
  onRestructurePath: (idx: number, newPath: string) => void;
  dirtyRoots: string[];
  regeningRoots: string[];
  onRegenRoot: (root: string) => void;
}) {
  const orderedRows = orderAnalysisRowsDepthFirst(rows);
  const indexBySlot = new Map(rows.map((r, i) => [r.slot_filling, i]));
  const rootNodes = rows.filter((r) => !r.slot_filling.includes('.'));
  const singleRoot = rootNodes.length === 1 ? rootNodes[0]!.slot_filling : null;

  return (
    <table className="w-full border-collapse text-left">
      <thead className="sticky top-0 z-10 bg-[#080e0a]">
        <tr className="border-b border-[#1a3a2a]">
          {['Path Completo', 'Domanda', '1° no match', '2° no match', '3° no match'].map((h, i) => (
            <th
              key={i}
              className={`px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-emerald-400/50 ${i < 4 ? 'border-r border-[#1a3a2a]' : ''} ${i === 0 ? 'whitespace-nowrap' : ''}`}
              style={i === 1 ? { minWidth: 200 } : i > 1 ? { minWidth: 150 } : undefined}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {(() => {
          const forestLevel = singleRoot !== null ? 1 : 0;
          const firstForestIdx = orderedRows.findIndex(
            (r) => r.slot_filling.split('.').length - 1 === forestLevel,
          );
          return orderedRows.map((row, i) => (
            <FlatRow
              key={row.slot_filling}
              row={row}
              rowIndex={indexBySlot.get(row.slot_filling) ?? i}
              isStart={row.slot_filling === singleRoot}
              needsSeparator={row.slot_filling.split('.').length - 1 === forestLevel && i !== firstForestIdx}
              onUpdate={(updates) => onUpdateRow(i, updates)}
              onDelete={() => onDeleteRow(i)}
              onAddRow={onAddRow}
              onRestructurePath={(newPath) => onRestructurePath(i, newPath)}
              isDirty={dirtyRoots.includes(row.slot_filling)}
              isRegening={regeningRoots.includes(row.slot_filling)}
              onRegen={() => onRegenRoot(row.slot_filling)}
            />
          ));
        })()}
      </tbody>
    </table>
  );
}

// ── Affina panel ──────────────────────────────────────────────────────────────

const AFFINA_SUGGESTIONS = [
  'Spezza di più: separa entità e attributo in livelli distinti (es. "ginocchio destro" → ginocchio.destro)',
  'Unisci due nodi che sono la stessa dimensione',
  'Manca il percorso …',
  'Troppo fine: unisci i livelli X e Y',
  'Aggiungi i figli mancanti per …',
];

function AffinaPanel({
  onClose,
  onSubmit,
  generating,
  hasAgent,
}: {
  onClose: () => void;
  onSubmit: (notes: string) => void;
  generating: boolean;
  hasAgent: boolean;
}) {
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
          <span className="font-mono text-xs text-amber-400/80 font-semibold">Affina tassonomia</span>
        </div>
        <button onClick={onClose} className="text-emerald-400/30 hover:text-emerald-400/70 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="font-mono text-[11px] text-emerald-400/50 leading-relaxed">
        Descrivi come modificare la <strong className="text-emerald-400/70 font-normal">struttura ad albero</strong>.
        L&apos;affinamento usa solo i path esistenti — <strong className="text-emerald-400/70 font-normal">non rilegge il documento</strong>.
        {hasAgent && (
          <span className="text-amber-400/60"> Dopo l&apos;affinamento dovrai rigenerare l&apos;agente.</span>
        )}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {AFFINA_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => appendSuggestion(s)}
            className="px-2 py-0.5 rounded border border-[#1a3a2a] bg-[#0a1510] font-mono text-[10px] text-emerald-400/50 hover:text-emerald-400/80 hover:border-emerald-400/30 transition-colors text-left"
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
        className="w-full bg-[#0a1510] border border-[#1a3a2a] rounded px-3 py-2 font-mono text-xs text-emerald-200/80 placeholder-emerald-400/20 resize-none focus:outline-none focus:border-emerald-400/40 transition-colors"
      />
      <button
        onClick={() => onSubmit(notes)}
        disabled={!canSubmit}
        className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs font-semibold text-emerald-900 bg-emerald-400 rounded hover:bg-emerald-300 transition-colors disabled:opacity-40"
      >
        {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
        {generating ? 'Affinamento in corso…' : 'Applica affinamento'}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type ViewMode = 'tree' | 'flat';

export function AnalysisView({
  doc,
  documentText,
  analysisApi,
  onHasData,
  generateTrigger = 0,
  externalToolbar = false,
  affinaOpen: affinaOpenProp,
  onAffinaOpenChange,
  testOpen: testOpenProp,
  onTestOpenChange,
  leafDescriptionMap = null,
}: AnalysisViewProps) {
  const {
    analysis, loading, saving, analysisDirty, generating, generatingPhase, agentGenProgress,
    generatingConfirmations, error, regenError, agentReady,
    generateTaxonomy, generateAgent, refineTaxonomy, saveAnalysis, discardAnalysisChanges,
    updateAgentConfig, generateConfirmations,
    updateRow, deleteRow, addRow, restructurePath, dirtyRoots, regeningRoots, regenSubtree,
  } = analysisApi;
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const [affinaOpenLocal, setAffinaOpenLocal] = useState(false);
  const [testOpenLocal, setTestOpenLocal] = useState(false);
  const affinaOpen = affinaOpenProp ?? affinaOpenLocal;
  const setAffinaOpen = onAffinaOpenChange ?? setAffinaOpenLocal;
  const testOpen = testOpenProp ?? testOpenLocal;
  const setTestOpen = onTestOpenChange ?? setTestOpenLocal;

  const rows: AnalysisRow[] = analysis?.rows ?? [];
  const hasData = rows.length > 0;

  useEffect(() => {
    onHasData?.(hasData);
  }, [hasData, onHasData]);

  const lastTrigger = useRef(0);

  const initiateTaxonomy = () => {
    if (!documentText) return;
    generateTaxonomy(documentText, doc.name);
  };

  const handleGenerateAgent = () => {
    if (!documentText) return;
    generateAgent(documentText, doc.name);
  };

  useEffect(() => {
    if (generateTrigger > 0 && generateTrigger !== lastTrigger.current && !generating) {
      lastTrigger.current = generateTrigger;
      initiateTaxonomy();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateTrigger, generating]);

  const handleAffina = (notes: string) => {
    refineTaxonomy(notes);
    setAffinaOpen(false);
  };

  const handleRegenRoot = (root: string) => {
    regenSubtree(root, documentText ?? '', doc.name);
  };

  const canRun = !!documentText && !generating;
  const taxonomyOnly = hasData && !agentReady;

  const generatingLabel =
    generatingPhase === 'taxonomy'
      ? 'Sto costruendo la tassonomia…'
      : generatingPhase === 'agent'
        ? 'Sto generando domande e grammatiche…'
        : 'Caricamento…';

  // ── Stats ──────────────────────────────────────────────────────────────────
  const approvedCount = rows.filter((r) => r.status === 'approved').length;
  const rejectedCount = rows.filter((r) => r.status === 'rejected').length;
  const uncertainCount = rows.filter((r) => r.status === 'uncertain').length;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-2 border-b border-[#1a3a2a] bg-[#0a1510]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400/60" />
            <span className="font-mono text-xs text-emerald-400/60">
              {hasData
                ? `${rows.length} nodi · ${new Date(analysis!.created_at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}`
                : 'Nessuna analisi'}
            </span>
          </div>
          {analysisDirty && (
            <span className="font-mono text-[10px] text-amber-400/90 px-1.5 py-0.5 rounded border border-amber-400/30 bg-amber-400/10">
              modifiche non salvate
            </span>
          )}
          {hasData && (
            <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[9px] font-bold uppercase tracking-wider border ${
              agentReady
                ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400'
                : 'border-amber-400/40 bg-amber-400/10 text-amber-400'
            }`}>
              {agentReady ? <><Bot className="w-2.5 h-2.5" /> Agente</> : <><Layers className="w-2.5 h-2.5" /> Tassonomia</>}
            </span>
          )}
          {hasData && (approvedCount > 0 || rejectedCount > 0 || uncertainCount > 0) && (
            <div className="flex items-center gap-2 font-mono text-[10px]">
              {approvedCount > 0 && <span className="text-emerald-400/70">{approvedCount} validati</span>}
              {rejectedCount > 0 && <span className="text-red-400/70">{rejectedCount} rifiutati</span>}
              {uncertainCount > 0 && <span className="text-amber-400/70">{uncertainCount} incerti</span>}
            </div>
          )}
        </div>

        {!externalToolbar && (
          <div className="flex items-center gap-2">
            {hasData && (
              <>
                <button
                  type="button"
                  onClick={() => void saveAnalysis()}
                  disabled={!analysisDirty || saving || generating}
                  className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs font-semibold text-emerald-900 bg-sky-400 rounded hover:bg-sky-300 transition-colors disabled:opacity-40"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {saving ? 'Salvataggio…' : 'Salva analisi'}
                </button>
                {analysisDirty && (
                  <button
                    type="button"
                    onClick={() => void discardAnalysisChanges()}
                    disabled={saving || generating}
                    className="flex items-center gap-1 px-2 py-1.5 font-mono text-[10px] text-emerald-400/60 border border-[#1a3a2a] rounded hover:border-emerald-400/30 hover:text-emerald-400/90 transition-colors disabled:opacity-30"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Annulla
                  </button>
                )}
              </>
            )}
            {hasData && !externalToolbar && (
              <div className="flex items-center border border-[#1a3a2a] rounded overflow-hidden">
                <button
                  onClick={() => setViewMode('tree')}
                  title="Vista ad albero"
                  className={`px-2 py-1 transition-colors ${viewMode === 'tree' ? 'bg-emerald-400/15 text-emerald-400' : 'text-emerald-400/40 hover:text-emerald-400/70'}`}
                >
                  <GitBranch className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setViewMode('flat')}
                  title="Lista piatta"
                  className={`px-2 py-1 border-l border-[#1a3a2a] transition-colors ${viewMode === 'flat' ? 'bg-emerald-400/15 text-emerald-400' : 'text-emerald-400/40 hover:text-emerald-400/70'}`}
                >
                  <List className="w-3 h-3" />
                </button>
              </div>
            )}
            {hasData && (
              <button
                onClick={() => setAffinaOpen(!affinaOpen)}
                disabled={generating}
                className="flex items-center gap-1 px-2 py-1 font-mono text-[10px] text-amber-400/60 border border-amber-400/25 rounded hover:border-amber-400/50 hover:text-amber-400/90 transition-colors disabled:opacity-30"
              >
                <Wand2 className="w-3 h-3" />Affina
              </button>
            )}
            {taxonomyOnly && (
              <button
                onClick={handleGenerateAgent}
                disabled={!canRun}
                className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs font-semibold text-emerald-900 bg-emerald-400 rounded hover:bg-emerald-300 transition-colors disabled:opacity-40"
              >
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                {generatingPhase === 'agent' ? 'Generazione…' : 'Genera Agente'}
              </button>
            )}
            {hasData && !taxonomyOnly && (
              <button
                onClick={initiateTaxonomy}
                disabled={!canRun}
                title="Rigenera la tassonomia da zero (cancella l'agente)"
                className="flex items-center gap-1 px-2 py-1 font-mono text-[10px] text-emerald-400/50 border border-[#1a3a2a] rounded hover:border-emerald-400/30 hover:text-emerald-400/80 transition-colors disabled:opacity-30"
              >
                <Layers className="w-3 h-3" />Rigenera tassonomia
              </button>
            )}
            {hasData && (
              <button
                onClick={() => setTestOpen(!testOpen)}
                className={`flex items-center gap-1 px-2 py-1 font-mono text-[10px] border rounded transition-colors ${
                  testOpen
                    ? 'text-emerald-300 border-emerald-400/50 bg-emerald-400/10'
                    : 'text-emerald-400/60 border-emerald-400/25 hover:border-emerald-400/50 hover:text-emerald-400/90'
                }`}
              >
                <FlaskConical className="w-3 h-3" />Test
              </button>
            )}
            {!hasData && (
              <button
                onClick={initiateTaxonomy}
                disabled={!canRun}
                className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs font-semibold text-emerald-900 bg-emerald-400 rounded hover:bg-emerald-300 transition-colors disabled:opacity-40"
              >
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
                {generatingPhase === 'taxonomy' ? 'Generazione…' : 'Genera tassonomia'}
              </button>
            )}
          </div>
        )}
      </div>

      {affinaOpen && hasData && (
        <AffinaPanel
          onClose={() => setAffinaOpen(false)}
          onSubmit={handleAffina}
          generating={generating}
          hasAgent={agentReady}
        />
      )}

      {taxonomyOnly && !generating && !affinaOpen && !externalToolbar && (
        <div className="flex-shrink-0 px-4 py-2 border-b border-amber-400/20 bg-amber-400/5 font-mono text-[11px] text-amber-400/80">
          Tassonomia pronta ({rows.length} nodi). Usa <strong className="font-normal">Affina</strong> per raffinare la struttura, poi <strong className="font-normal">Genera Agente</strong> per domande e grammatiche.
        </div>
      )}

      {(loading || (generating && generatingPhase === 'taxonomy' && !hasData)) && (
        <div className="flex items-center justify-center gap-2 py-8 text-emerald-400/60">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="font-mono text-sm">{generating ? generatingLabel : 'Caricamento…'}</span>
        </div>
      )}

      {generating && generatingPhase === 'agent' && hasData && externalToolbar && (
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-emerald-400/15 bg-emerald-400/5 font-mono text-[10px] text-emerald-400/70">
          <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
          {agentGenProgress
            ? `Popolamento NLU — ramo ${agentGenProgress.current}/${agentGenProgress.total}`
            : 'Preparazione messaggi e grammatiche…'}
        </div>
      )}

      {error && !generating && (
        <div className="flex items-center gap-2 mx-4 mt-3 px-3 py-2 rounded border border-red-400/30 bg-red-400/5 text-red-400 font-mono text-xs">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
      {regenError && (
        <div className="flex items-center gap-2 mx-4 mt-2 px-3 py-2 rounded border border-amber-400/30 bg-amber-400/5 text-amber-400 font-mono text-xs">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          Ricalcolo fallito: {regenError}
        </div>
      )}

      {!loading && !generating && !hasData && !error && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-emerald-400/20">
          <Bot className="w-10 h-10" />
          <p className="font-mono text-sm text-center px-8">
            {externalToolbar
              ? 'Premi "Genera agente" in alto per costruire albero, messaggi e grammatiche.'
              : documentText
                ? 'Premi "Genera tassonomia" per estrarre la struttura dal documento.'
                : 'Caricamento documento in corso…'}
          </p>
        </div>
      )}

      {!loading && hasData && (!generating || generatingPhase === 'agent') && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {externalToolbar && agentReady && (
            <AgentConfigBar
              startQuestion={analysis?.start_question ?? ''}
              confirmationPreamble={analysis?.confirmation_preamble ?? 'Quindi confermo:'}
              onStartQuestionChange={(v) => updateAgentConfig({ start_question: v || null })}
              onPreambleChange={(v) => updateAgentConfig({ confirmation_preamble: v || null })}
              onGenerateConfirmations={() => void generateConfirmations(leafDescriptionMap)}
              generatingConfirmations={generatingConfirmations}
              canGenerate={!generating && !generatingConfirmations}
            />
          )}
          <div className="flex-1 min-h-0 flex overflow-hidden">
          <div className="flex-1 min-h-0 overflow-auto">
            {externalToolbar ? (
              <SplitAgentTable
                rows={rows}
                onUpdateRow={updateRow}
                onDeleteRow={deleteRow}
                onAddRow={addRow}
                onRestructurePath={restructurePath}
                dirtyRoots={dirtyRoots}
                regeningRoots={regeningRoots}
                onRegenRoot={handleRegenRoot}
              />
            ) : viewMode === 'tree' ? (
              <TreeTable rows={rows} onUpdateRow={updateRow} onDeleteRow={deleteRow} onAddRow={addRow} onRestructurePath={restructurePath} dirtyRoots={dirtyRoots} regeningRoots={regeningRoots} onRegenRoot={handleRegenRoot} />
            ) : (
              <FlatTable rows={rows} onUpdateRow={updateRow} onDeleteRow={deleteRow} onAddRow={addRow} onRestructurePath={restructurePath} dirtyRoots={dirtyRoots} regeningRoots={regeningRoots} onRegenRoot={handleRegenRoot} />
            )}
          </div>
          {testOpen && (
            <ChatPanel
              rows={rows}
              agentConfig={{
                start_question: analysis?.start_question ?? null,
                confirmation_preamble: analysis?.confirmation_preamble ?? null,
              }}
              onClose={() => setTestOpen(false)}
            />
          )}
          </div>
        </div>
      )}
    </div>
  );
}
