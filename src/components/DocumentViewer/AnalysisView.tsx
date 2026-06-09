import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles, Loader2, AlertCircle, ChevronRight, ChevronDown,
  List, GitBranch, Wand2, X, ThumbsUp, ThumbsDown, HelpCircle,
  Pencil, Check, Zap, FlaskConical, Trash2, RefreshCw, Braces, Plus,
  Layers, Bot, Save, RotateCcw, MessageCircle,
} from 'lucide-react';
import type {
  GrammarEditMode,
  GrammarEditTarget,
  GrammarEntry,
  useAnalysis,
  AnalysisRow,
  RowStatus,
} from '../../hooks/useAnalysis';
import { isTerminalItemSlot, resolveItemPaths } from '../../lib/itemPaths';
import { requiresInteractiveNode } from '../../lib/nluQuestionRules';
import type { KbDocument } from '../../lib/supabase';
import { ChatPanel } from './ChatPanel';
import { InlineGrammarEditor } from './InlineGrammarEditor';
import { SlotLabelDisplay, SlotPathDisplay } from './SlotPathDisplay';
import {
  collectDirectChildSlots,
  isSlotHiddenByCollapse,
  orderAnalysisRowsDepthFirst,
  rowHasMessage,
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
  selectedSlot?: string | null;
  onSelectedSlotChange?: (slot: string | null) => void;
  grammarEditTarget?: GrammarEditTarget | null;
  onGrammarEditTargetChange?: (target: GrammarEditTarget | null) => void;
  /** When true, table shows only rows with a question message. */
  showOnlyMessageNodes?: boolean;
  /** When true, grammar generation overwrites existing regex. */
  grammarOverwrite?: boolean;
  onGrammarOverwriteChange?: (overwrite: boolean) => void;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type EditField = 'question' | 'no_match_1' | 'no_match_2' | 'no_match_3' | 'confirmation_text';

function isGrammarEditOpen(
  target: GrammarEditTarget | null,
  slot: string,
  mode: GrammarEditMode,
): boolean {
  return target?.slot === slot && target.mode === mode;
}

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

/** Glossy bubble icon for nodes that require a question. */
function QuestionNodeIcon({ className = '' }: { className?: string }) {
  return (
    <MessageCircle
      className={`w-3.5 h-3.5 flex-shrink-0 text-sky-300 drop-shadow-[0_0_6px_rgba(56,189,248,0.85)] ${className}`}
      strokeWidth={2.25}
      aria-hidden
    />
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

/** Visual indicator that a node needs recalculation (action is in the hover toolbar). */
function DirtyRegenChip({ isDirty, isRegening }: { isDirty: boolean; isRegening: boolean }) {
  if (!isDirty && !isRegening) return null;
  if (isRegening) {
    return (
      <span className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-400/30 bg-amber-400/10 text-amber-400/60 font-mono text-[9px] font-bold uppercase tracking-wider">
        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
        Ricalcolo…
      </span>
    );
  }
  return (
    <span
      title="Struttura cambiata — usa la toolbar (↻) per ricalcolare domande e grammatiche"
      className="flex-shrink-0 px-1.5 py-0.5 rounded border border-amber-400/50 bg-amber-400/10 text-amber-400 font-mono text-[9px] font-bold uppercase tracking-wider animate-pulse"
    >
      Da ricalcolare
    </span>
  );
}

function CellActions({
  status,
  canEdit,
  grammarOpen,
  isDirty,
  isRegening,
  onApprove,
  onReject,
  onUncertain,
  onEdit,
  onDelete,
  onToggleGrammar,
  onAddChild,
  onAddSibling,
  onRegen,
  onHoverChange,
}: {
  status: RowStatus | undefined;
  canEdit: boolean;
  grammarOpen?: boolean;
  isDirty?: boolean;
  isRegening?: boolean;
  onApprove: () => void;
  onReject: () => void;
  onUncertain: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleGrammar?: () => void;
  onAddChild?: () => void;
  onAddSibling?: () => void;
  onRegen?: () => void;
  onHoverChange?: (a: HoverAction) => void;
}) {
  return (
    <div className="absolute left-full top-2 z-50 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto hover:pointer-events-auto flex items-center gap-0.5 bg-[#060c08]/95 border border-[#1a3a2a] rounded px-1.5 py-1 shadow-2xl whitespace-nowrap">
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
      {canEdit && onToggleGrammar && (
        <>
          <div className="w-px h-3 bg-[#1a3a2a] mx-0.5" />
          <button
            onMouseDown={(e) => { e.preventDefault(); onToggleGrammar(); }}
            title={grammarOpen ? 'Chiudi editor sinonimi' : 'Modifica sinonimi grammatica'}
            className={`p-0.5 rounded transition-colors ${grammarOpen ? 'text-sky-400' : 'text-sky-400/40 hover:text-sky-400'}`}
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
    <td className={`group relative overflow-visible px-3 py-1.5 border-r border-[#1a3a2a] align-middle ${tdClass ?? ''}`}>
      {value
        ? <p className={`font-sans text-xs leading-relaxed transition-colors ${textColor}`}>{value}</p>
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
  isInteractive,
  onToggleCollapse,
  onUpdateRow,
  onDeleteRow,
  onAddRow,
  onRestructurePath,
  isDirty,
  isRegening,
  onRegenRoot,
  grammarEditTarget,
  allSlots,
  itemPaths,
  onToggleGrammarEdit,
  onGrammarSave,
  onGrammarEditCancel,
}: {
  row: AnalysisRow;
  originalIndex: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  isHidden: boolean;
  isStart: boolean;
  isInteractive: boolean;
  grammarEditTarget: GrammarEditTarget | null;
  allSlots: string[];
  itemPaths: string[];
  onToggleGrammarEdit: (slot: string, mode: GrammarEditMode) => void;
  onGrammarSave: (slot: string, mode: GrammarEditMode, grammar: GrammarEntry) => void;
  onGrammarEditCancel: () => void;
  onToggleCollapse: (slot: string) => void;
  onUpdateRow: (idx: number, updates: Partial<AnalysisRow>) => void;
  onDeleteRow: (idx: number) => void;
  onAddRow: (slot: string) => void;
  onRestructurePath: (idx: number, newPath: string) => void;
  isDirty: boolean;
  isRegening: boolean;
  onRegenRoot: (root: string) => void;
}) {
  const isNodeGrammarOpen = isGrammarEditOpen(grammarEditTarget, row.slot_filling, 'node');
  const isAnswerGrammarOpen = isGrammarEditOpen(grammarEditTarget, row.slot_filling, 'answer');
  const depth = row.slot_filling.split('.').length - 1;
  const parentSlot = row.slot_filling.split('.').slice(0, -1).join('.');
  const isRoot = depth === 0;

  const [editingField, setEditingField] = useState<EditField | null>(null);
  const [draftValue, setDraftValue] = useState('');
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
    <tr className={`${isHidden ? 'hidden' : ''} relative hover:z-30 hover:brightness-110 ${rowBg}`} aria-hidden={isHidden}>
      {/* Slot filling */}
      <td className="group relative overflow-visible px-3 py-1.5 border-r border-[#1a3a2a] align-top min-w-[220px]">
        <div
          className="flex items-center gap-1.5"
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
          {!editingPath && isInteractive && (
            <span title="Nodo con domanda" className="flex-shrink-0">
              <QuestionNodeIcon />
            </span>
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
          {!editingPath && <DirtyRegenChip isDirty={isDirty} isRegening={isRegening} />}
        </div>
        {!editingPath && editingField === null && (
          <CellActions
            status={row.status}
            canEdit={true}
            grammarOpen={isNodeGrammarOpen}
            isDirty={isDirty}
            isRegening={isRegening}
            onApprove={() => handleValidation('approved')}
            onReject={() => handleValidation('rejected')}
            onUncertain={() => handleValidation('uncertain')}
            onEdit={() => { setPathDraft(row.slot_filling); setEditingPath(true); }}
            onDelete={() => onDeleteRow(originalIndex)}
            onToggleGrammar={() => onToggleGrammarEdit(row.slot_filling, 'node')}
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
        {isNodeGrammarOpen && (
          <InlineGrammarEditor
            slot={row.slot_filling}
            slots={allSlots}
            itemPaths={itemPaths}
            grammar={row.grammar}
            mode="node"
            onSave={(grammar) => onGrammarSave(row.slot_filling, 'node', grammar)}
            onCancel={onGrammarEditCancel}
          />
        )}
      </td>

      {isInteractive ? (
        <td className="group relative overflow-visible px-3 py-1.5 border-r border-[#1a3a2a] align-top min-w-[200px]">
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
            <p className={`font-sans text-xs leading-relaxed ${cellTextColor(row.status, slotHover)}`}>{row.question}</p>
          ) : (
            <span className="text-emerald-400/15 font-mono text-[10px]">—</span>
          )}
          {editingField === null && (
            <CellActions
              status={row.status}
              canEdit={true}
              grammarOpen={isAnswerGrammarOpen}
              isDirty={isDirty}
              isRegening={isRegening}
              onApprove={() => handleValidation('approved')}
              onReject={() => handleValidation('rejected')}
              onUncertain={() => handleValidation('uncertain')}
              onEdit={() => startEdit('question')}
              onToggleGrammar={() => onToggleGrammarEdit(row.slot_filling, 'answer')}
              onRegen={() => onRegenRoot(row.slot_filling)}
              onHoverChange={setSlotHover}
            />
          )}
          {isAnswerGrammarOpen && (
            <InlineGrammarEditor
              slot={row.slot_filling}
              slots={allSlots}
              itemPaths={itemPaths}
              grammar={row.answer_grammar}
              mode="answer"
              onSave={(grammar) => onGrammarSave(row.slot_filling, 'answer', grammar)}
              onCancel={onGrammarEditCancel}
            />
          )}
        </td>
      ) : (
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
      )}
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
  showOnlyMessageNodes = false,
  onUpdateRow,
  onDeleteRow,
  onAddRow,
  onRestructurePath,
  dirtyRoots,
  regeningRoots,
  onRegenRoot,
  grammarEditTarget,
  itemPaths,
  onToggleGrammarEdit,
  onGrammarSave,
  onGrammarEditCancel,
}: {
  rows: AnalysisRow[];
  showOnlyMessageNodes?: boolean;
  onUpdateRow: (idx: number, updates: Partial<AnalysisRow>) => void;
  onDeleteRow: (idx: number) => void;
  onAddRow: (slot: string) => void;
  onRestructurePath: (idx: number, newPath: string) => void;
  dirtyRoots: string[];
  regeningRoots: string[];
  onRegenRoot: (root: string) => void;
  grammarEditTarget: GrammarEditTarget | null;
  itemPaths: string[];
  onToggleGrammarEdit: (slot: string, mode: GrammarEditMode) => void;
  onGrammarSave: (slot: string, mode: GrammarEditMode, grammar: GrammarEntry) => void;
  onGrammarEditCancel: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const collapsedKey = useMemo(() => [...collapsed].sort().join('\0'), [collapsed]);

  const orderedRows = useMemo(() => {
    const ordered = orderAnalysisRowsDepthFirst(rows);
    return showOnlyMessageNodes ? ordered.filter(rowHasMessage) : ordered;
  }, [rows, showOnlyMessageNodes]);
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
  const allSlots = useMemo(() => rows.map((r) => r.slot_filling), [rows]);

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
    <table className="w-full border-collapse text-left overflow-visible">
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
              isInteractive={requiresInteractiveNode(allSlots, item.row.slot_filling, itemPaths)}
              grammarEditTarget={grammarEditTarget}
              allSlots={allSlots}
              itemPaths={itemPaths}
              onToggleGrammarEdit={onToggleGrammarEdit}
              onGrammarSave={onGrammarSave}
              onGrammarEditCancel={onGrammarEditCancel}
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
  isInteractive,
  isSelected,
  depth,
  hasChildren,
  isCollapsed,
  singleRoot,
  isTreeHovered,
  isTreeChildHighlight,
  onToggleCollapse,
  onTreeHover,
  onSelectSlot,
  onUpdateRow,
  onDeleteRow,
  onAddRow,
  onRestructurePath,
  isDirty,
  isRegening,
  onRegenRoot,
  grammarEditTarget,
  allSlots,
  itemPaths,
  onToggleGrammarEdit,
  onGrammarSave,
  onGrammarEditCancel,
}: {
  row: AnalysisRow;
  originalIndex: number;
  isHighlighted: boolean;
  isStart: boolean;
  isLeaf: boolean;
  isInteractive: boolean;
  isSelected: boolean;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  singleRoot: string | null;
  isTreeHovered: boolean;
  isTreeChildHighlight: boolean;
  onToggleCollapse: (slot: string) => void;
  onTreeHover: (slot: string | null) => void;
  onSelectSlot: (slot: string) => void;
  grammarEditTarget: GrammarEditTarget | null;
  allSlots: string[];
  itemPaths: string[];
  onToggleGrammarEdit: (slot: string, mode: GrammarEditMode) => void;
  onGrammarSave: (slot: string, mode: GrammarEditMode, grammar: GrammarEntry) => void;
  onGrammarEditCancel: () => void;
  onUpdateRow: (idx: number, updates: Partial<AnalysisRow>) => void;
  onDeleteRow: (idx: number) => void;
  onAddRow: (slot: string) => void;
  onRestructurePath: (idx: number, newPath: string) => void;
  isDirty: boolean;
  isRegening: boolean;
  onRegenRoot: (root: string) => void;
}) {
  const isNodeGrammarOpen = isGrammarEditOpen(grammarEditTarget, row.slot_filling, 'node');
  const isAnswerGrammarOpen = isGrammarEditOpen(grammarEditTarget, row.slot_filling, 'answer');
  const parentSlot = row.slot_filling.split('.').slice(0, -1).join('.');
  const [editingField, setEditingField] = useState<EditField | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [slotHover, setSlotHover] = useState<HoverAction>(null);
  const [editingPath, setEditingPath] = useState(false);
  const [pathDraft, setPathDraft] = useState('');
  const [addMode, setAddMode] = useState<'child' | 'sibling' | null>(null);
  const [addDraft, setAddDraft] = useState('');

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

  const handleValidation = (status: RowStatus) =>
    onUpdateRow(originalIndex, { status: row.status === status ? null : status });

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

  const rowBg = isHighlighted
    ? 'bg-sky-400/[0.08]'
    : isStart
      ? 'bg-[#0d1a0a]'
      : row.status
        ? statusBgClass(row.status)
        : 'bg-[#0d0d0d]';

  const treeBg = isTreeChildHighlight
    ? 'bg-sky-400/[0.08]'
    : isTreeHovered
      ? 'bg-emerald-400/[0.06]'
      : '';

  return (
    <tr className={`relative hover:z-30 ${rowBg} hover:brightness-110`}>
      <td
        className={`group relative overflow-visible w-[260px] max-w-[260px] px-2 py-1.5 border-r border-[#1a3a2a] align-top cursor-pointer ${treeBg} ${isSelected ? 'ring-1 ring-inset ring-sky-400/50 bg-sky-400/[0.06]' : ''}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onMouseEnter={() => onTreeHover(row.slot_filling)}
        onMouseLeave={() => onTreeHover(null)}
        onClick={() => onSelectSlot(row.slot_filling)}
      >
        <div className="flex items-center gap-1 min-h-[2rem] flex-wrap">
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleCollapse(row.slot_filling); }}
              className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-emerald-400/50 hover:text-emerald-400"
            >
              {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}
          {!editingPath && isInteractive && (
            <span title="Nodo con domanda" className="flex-shrink-0">
              <QuestionNodeIcon />
            </span>
          )}
          {editingPath ? (
            <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
              <PathEditor
                value={pathDraft}
                onChange={setPathDraft}
                onConfirm={confirmPathEdit}
                onCancel={() => setEditingPath(false)}
              />
            </div>
          ) : (
            <SlotLabelDisplay
              path={row.slot_filling}
              className={row.slot_filling === singleRoot ? 'font-bold text-amber-300' : ''}
            />
          )}
          {!editingPath && row.slot_filling === singleRoot && (
            <Zap className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />
          )}
          {!editingPath && <DirtyRegenChip isDirty={isDirty} isRegening={isRegening} />}
        </div>
        {!editingPath && editingField === null && (
          <CellActions
            status={row.status}
            canEdit={true}
            grammarOpen={isNodeGrammarOpen}
            isDirty={isDirty}
            isRegening={isRegening}
            onApprove={() => handleValidation('approved')}
            onReject={() => handleValidation('rejected')}
            onUncertain={() => handleValidation('uncertain')}
            onEdit={() => { setPathDraft(row.slot_filling); setEditingPath(true); }}
            onDelete={() => onDeleteRow(originalIndex)}
            onToggleGrammar={() => onToggleGrammarEdit(row.slot_filling, 'node')}
            onAddChild={() => { setAddMode('child'); setAddDraft(''); }}
            onAddSibling={depth > 0 ? () => { setAddMode('sibling'); setAddDraft(''); } : undefined}
            onRegen={() => onRegenRoot(row.slot_filling)}
            onHoverChange={setSlotHover}
          />
        )}
        {addMode && (
          <div className="flex items-center gap-1 mt-1 pl-1" onClick={(e) => e.stopPropagation()}>
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
        {isNodeGrammarOpen && (
          <InlineGrammarEditor
            slot={row.slot_filling}
            slots={allSlots}
            itemPaths={itemPaths}
            grammar={row.grammar}
            mode="node"
            onSave={(grammar) => onGrammarSave(row.slot_filling, 'node', grammar)}
            onCancel={onGrammarEditCancel}
          />
        )}
      </td>
      <td className="group relative overflow-visible px-3 py-1.5 border-r border-[#1a3a2a] align-top min-w-[200px]">
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
          <p className={`font-sans text-xs leading-relaxed ${cellTextColor(row.status, slotHover)}`}>{row.question}</p>
        ) : (
          <span className="text-emerald-400/15 font-mono text-[10px]">—</span>
        )}
        {editingField === null && (
          <CellActions
            status={row.status}
            canEdit={true}
            grammarOpen={isAnswerGrammarOpen}
            isDirty={isDirty}
            isRegening={isRegening}
            onApprove={() => handleValidation('approved')}
            onReject={() => handleValidation('rejected')}
            onUncertain={() => handleValidation('uncertain')}
            onEdit={() => startEdit('question')}
            onToggleGrammar={isInteractive ? () => onToggleGrammarEdit(row.slot_filling, 'answer') : undefined}
            onRegen={() => onRegenRoot(row.slot_filling)}
            onHoverChange={setSlotHover}
          />
        )}
        {isAnswerGrammarOpen && isInteractive && (
          <InlineGrammarEditor
            slot={row.slot_filling}
            slots={allSlots}
            itemPaths={itemPaths}
            grammar={row.answer_grammar}
            mode="answer"
            onSave={(grammar) => onGrammarSave(row.slot_filling, 'answer', grammar)}
            onCancel={onGrammarEditCancel}
          />
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
  showOnlyMessageNodes = false,
  selectedSlot,
  onSelectSlot,
  onUpdateRow,
  onDeleteRow,
  onAddRow,
  onRestructurePath,
  dirtyRoots,
  regeningRoots,
  onRegenRoot,
  grammarEditTarget,
  itemPaths,
  onToggleGrammarEdit,
  onGrammarSave,
  onGrammarEditCancel,
}: {
  rows: AnalysisRow[];
  showOnlyMessageNodes?: boolean;
  selectedSlot: string | null;
  onSelectSlot: (slot: string) => void;
  onUpdateRow: (idx: number, updates: Partial<AnalysisRow>) => void;
  onDeleteRow: (idx: number) => void;
  onAddRow: (slot: string) => void;
  onRestructurePath: (idx: number, newPath: string) => void;
  dirtyRoots: string[];
  regeningRoots: string[];
  onRegenRoot: (root: string) => void;
  grammarEditTarget: GrammarEditTarget | null;
  itemPaths: string[];
  onToggleGrammarEdit: (slot: string, mode: GrammarEditMode) => void;
  onGrammarSave: (slot: string, mode: GrammarEditMode, grammar: GrammarEntry) => void;
  onGrammarEditCancel: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const collapsedKey = useMemo(() => [...collapsed].sort().join('\0'), [collapsed]);

  const orderedRows = useMemo(() => {
    const ordered = orderAnalysisRowsDepthFirst(rows);
    return showOnlyMessageNodes ? ordered.filter(rowHasMessage) : ordered;
  }, [rows, showOnlyMessageNodes]);
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
    <div className="flex flex-col h-full min-h-0 min-w-0 bg-[#080e0a]">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
        <table className="w-full border-collapse text-left overflow-visible">
          <thead className="sticky top-0 z-20 bg-[#080e0a]">
            <tr className="border-b border-[#1a3a2a]">
              <th className="w-[260px] min-w-[260px] px-3 py-2 border-r border-[#1a3a2a] font-mono text-[10px] uppercase tracking-widest text-emerald-400/50 text-left">
                Albero
              </th>
              {MSG_HEADERS.map((h, i) => (
                <th
                  key={h}
                  className={`px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-emerald-400/50 whitespace-nowrap ${i < MSG_HEADERS.length - 1 ? 'border-r border-[#1a3a2a]' : ''}`}
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
                    depth={item.depth}
                    hasChildren={item.hasChildren}
                    isCollapsed={item.isCollapsed}
                    singleRoot={singleRoot}
                    isTreeHovered={hoveredSlot === item.row.slot_filling}
                    isTreeChildHighlight={highlightSlots.has(item.row.slot_filling)}
                    onToggleCollapse={onToggleCollapse}
                    onTreeHover={setHoveredSlot}
                    onSelectSlot={onSelectSlot}
                    isHighlighted={highlightSlots.has(item.row.slot_filling)}
                    isStart={item.row.slot_filling === singleRoot}
                    isLeaf={isTerminalItemSlot(item.row.slot_filling, itemPaths)}
                    isInteractive={requiresInteractiveNode(allSlots, item.row.slot_filling, itemPaths)}
                    isSelected={selectedSlot === item.row.slot_filling}
                    onUpdateRow={onUpdateRow}
                    onDeleteRow={onDeleteRow}
                    onAddRow={onAddRow}
                    onRestructurePath={onRestructurePath}
                    isDirty={dirtyRoots.includes(item.row.slot_filling)}
                    isRegening={regeningRoots.includes(item.row.slot_filling)}
                    onRegenRoot={onRegenRoot}
                    grammarEditTarget={grammarEditTarget}
                    allSlots={allSlots}
                    itemPaths={itemPaths}
                    onToggleGrammarEdit={onToggleGrammarEdit}
                    onGrammarSave={onGrammarSave}
                    onGrammarEditCancel={onGrammarEditCancel}
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
  grammarEditTarget,
  allSlots,
  itemPaths,
  onToggleGrammarEdit,
  onGrammarSave,
  onGrammarEditCancel,
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
  grammarEditTarget: GrammarEditTarget | null;
  allSlots: string[];
  itemPaths: string[];
  onToggleGrammarEdit: (slot: string, mode: GrammarEditMode) => void;
  onGrammarSave: (slot: string, mode: GrammarEditMode, grammar: GrammarEntry) => void;
  onGrammarEditCancel: () => void;
}) {
  const isNodeGrammarOpen = isGrammarEditOpen(grammarEditTarget, row.slot_filling, 'node');
  const depth = row.slot_filling.split('.').length - 1;
  const parentSlot = row.slot_filling.split('.').slice(0, -1).join('.');
  const [editingField, setEditingField] = useState<EditField | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [slotHover, setSlotHover] = useState<HoverAction>(null);
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
      <tr className={`relative hover:z-30 transition-colors hover:brightness-110 ${rowBg}`}>
        <td className="group relative overflow-visible px-3 py-1.5 border-r border-[#1a3a2a] align-middle whitespace-nowrap">
          <div className="flex items-center gap-1.5">
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
            {!editingPath && <DirtyRegenChip isDirty={isDirty} isRegening={isRegening} />}
          </div>
          {!editingPath && editingField === null && (
            <CellActions
              status={row.status}
              canEdit={true}
              grammarOpen={isNodeGrammarOpen}
              isDirty={isDirty}
              isRegening={isRegening}
              onApprove={() => handleValidation('approved')}
              onReject={() => handleValidation('rejected')}
              onUncertain={() => handleValidation('uncertain')}
              onEdit={() => { setPathDraft(row.slot_filling); setEditingPath(true); }}
              onDelete={onDelete}
              onToggleGrammar={() => onToggleGrammarEdit(row.slot_filling, 'node')}
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
          {isNodeGrammarOpen && (
            <InlineGrammarEditor
              slot={row.slot_filling}
              slots={allSlots}
              itemPaths={itemPaths}
              grammar={row.grammar}
              mode="node"
              onSave={(grammar) => onGrammarSave(row.slot_filling, 'node', grammar)}
              onCancel={onGrammarEditCancel}
            />
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
  showOnlyMessageNodes = false,
  onUpdateRow,
  onDeleteRow,
  onAddRow,
  onRestructurePath,
  dirtyRoots,
  regeningRoots,
  onRegenRoot,
  grammarEditTarget,
  itemPaths,
  onToggleGrammarEdit,
  onGrammarSave,
  onGrammarEditCancel,
}: {
  rows: AnalysisRow[];
  showOnlyMessageNodes?: boolean;
  onUpdateRow: (idx: number, updates: Partial<AnalysisRow>) => void;
  onDeleteRow: (idx: number) => void;
  onAddRow: (slot: string) => void;
  onRestructurePath: (idx: number, newPath: string) => void;
  dirtyRoots: string[];
  regeningRoots: string[];
  onRegenRoot: (root: string) => void;
  grammarEditTarget: GrammarEditTarget | null;
  itemPaths: string[];
  onToggleGrammarEdit: (slot: string, mode: GrammarEditMode) => void;
  onGrammarSave: (slot: string, mode: GrammarEditMode, grammar: GrammarEntry) => void;
  onGrammarEditCancel: () => void;
}) {
  const orderedRows = (() => {
    const ordered = orderAnalysisRowsDepthFirst(rows);
    return showOnlyMessageNodes ? ordered.filter(rowHasMessage) : ordered;
  })();
  const indexBySlot = new Map(rows.map((r, i) => [r.slot_filling, i]));
  const rootNodes = rows.filter((r) => !r.slot_filling.includes('.'));
  const singleRoot = rootNodes.length === 1 ? rootNodes[0]!.slot_filling : null;
  const allSlots = rows.map((r) => r.slot_filling);

  return (
    <table className="w-full border-collapse text-left overflow-visible">
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
          return orderedRows.map((row, i) => {
            const rowIndex = indexBySlot.get(row.slot_filling) ?? i;
            return (
            <FlatRow
              key={row.slot_filling}
              row={row}
              rowIndex={rowIndex}
              isStart={row.slot_filling === singleRoot}
              needsSeparator={row.slot_filling.split('.').length - 1 === forestLevel && i !== firstForestIdx}
              onUpdate={(updates) => onUpdateRow(rowIndex, updates)}
              onDelete={() => onDeleteRow(rowIndex)}
              onAddRow={onAddRow}
              onRestructurePath={(newPath) => onRestructurePath(rowIndex, newPath)}
              isDirty={dirtyRoots.includes(row.slot_filling)}
              isRegening={regeningRoots.includes(row.slot_filling)}
              onRegen={() => onRegenRoot(row.slot_filling)}
              grammarEditTarget={grammarEditTarget}
              allSlots={allSlots}
              itemPaths={itemPaths}
              onToggleGrammarEdit={onToggleGrammarEdit}
              onGrammarSave={onGrammarSave}
              onGrammarEditCancel={onGrammarEditCancel}
            />
            );
          });
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
  selectedSlot = null,
  onSelectedSlotChange,
  grammarEditTarget: grammarEditTargetProp,
  onGrammarEditTargetChange,
  showOnlyMessageNodes: showOnlyMessageNodesProp = false,
  grammarOverwrite: grammarOverwriteProp = false,
  onGrammarOverwriteChange,
}: AnalysisViewProps) {
  const {
    analysis, loading, saving, analysisDirty, generating, generatingPhase, agentGenProgress,
    generatingConfirmations, error, regenError, messagesReady, hasMessages, agentReady, hasTaxonomy, canGenerateGrammars,
    missingGrammarCount, grammarsReady,
    generateTaxonomy, generateAgent, generateGrammars, generateGrammarsWithAi, refineTaxonomy, saveAnalysis, discardAnalysisChanges,
    updateAgentConfig, generateConfirmations,
    updateRow, deleteRow, addRow, restructurePath, dirtyRoots, regeningRoots, regenSubtreeFull, regenGrammarsSubtree,
  } = analysisApi;
  const [showOnlyMessageNodesLocal, setShowOnlyMessageNodesLocal] = useState(false);
  const [grammarOverwriteLocal, setGrammarOverwriteLocal] = useState(false);
  const showOnlyMessageNodes = externalToolbar
    ? showOnlyMessageNodesProp
    : (showOnlyMessageNodesLocal || showOnlyMessageNodesProp);
  const grammarOverwrite = externalToolbar
    ? grammarOverwriteProp
    : (grammarOverwriteLocal || grammarOverwriteProp);
  const setGrammarOverwriteMode = useCallback((value: boolean) => {
    if (externalToolbar) onGrammarOverwriteChange?.(value);
    else setGrammarOverwriteLocal(value);
  }, [externalToolbar, onGrammarOverwriteChange]);
  const canRunGrammarGeneration = hasTaxonomy && !generating
    && (grammarOverwrite || missingGrammarCount > 0);
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const [grammarEditTargetLocal, setGrammarEditTargetLocal] = useState<GrammarEditTarget | null>(null);
  const grammarEditTarget = grammarEditTargetProp ?? grammarEditTargetLocal;
  const setGrammarEditTarget = onGrammarEditTargetChange ?? setGrammarEditTargetLocal;
  const [affinaOpenLocal, setAffinaOpenLocal] = useState(false);
  const [testOpenLocal, setTestOpenLocal] = useState(false);
  const affinaOpen = affinaOpenProp ?? affinaOpenLocal;
  const setAffinaOpen = onAffinaOpenChange ?? setAffinaOpenLocal;
  const testOpen = testOpenProp ?? testOpenLocal;
  const setTestOpen = onTestOpenChange ?? setTestOpenLocal;

  const rows: AnalysisRow[] = analysis?.rows ?? [];
  const itemPaths = useMemo(
    () => resolveItemPaths(rows.map((r) => r.slot_filling), analysis?.item_paths ?? null),
    [rows, analysis?.item_paths],
  );
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
    if (dirtyRoots.includes(root)) {
      void regenSubtreeFull(root, documentText ?? '', doc.name, grammarOverwrite);
      return;
    }
    void regenGrammarsSubtree(root, documentText ?? '', doc.name, grammarOverwrite);
  };

  const canRun = !!documentText && !generating;
  const taxonomyOnly = hasData && !hasMessages;

  const generatingLabel =
    generatingPhase === 'taxonomy'
      ? 'Sto costruendo la tassonomia…'
      : generatingPhase === 'messages'
        ? 'Sto generando messaggi…'
        : generatingPhase === 'grammars'
          ? 'Sto generando grammatiche…'
          : 'Caricamento…';

  const toggleGrammarEdit = useCallback((slot: string, mode: GrammarEditMode) => {
    onSelectedSlotChange?.(slot);
    const same = grammarEditTarget?.slot === slot && grammarEditTarget.mode === mode;
    setGrammarEditTarget(same ? null : { slot, mode });
  }, [onSelectedSlotChange, setGrammarEditTarget, grammarEditTarget]);

  const handleGrammarSaveForSlot = useCallback((
    slot: string,
    mode: GrammarEditMode,
    grammar: GrammarEntry,
  ) => {
    const idx = rows.findIndex((r) => r.slot_filling === slot);
    if (idx < 0) return;
    const field = mode === 'node' ? 'grammar' : 'answer_grammar';
    updateRow(idx, { [field]: grammar, status: null });
    setGrammarEditTarget(null);
  }, [rows, updateRow, setGrammarEditTarget]);

  const closeGrammarEdit = useCallback(() => {
    setGrammarEditTarget(null);
  }, [setGrammarEditTarget]);

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
                : messagesReady
                  ? 'border-sky-400/40 bg-sky-400/10 text-sky-300'
                  : hasMessages
                    ? 'border-amber-400/40 bg-amber-400/10 text-amber-400'
                    : 'border-amber-400/40 bg-amber-400/10 text-amber-400'
            }`}>
              {agentReady
                ? <><Bot className="w-2.5 h-2.5" /> Agente</>
                : messagesReady
                  ? <><Braces className="w-2.5 h-2.5" /> Messaggi ok</>
                  : hasMessages
                    ? <><MessageCircle className="w-2.5 h-2.5" /> Messaggi</>
                    : <><Layers className="w-2.5 h-2.5" /> Tassonomia</>}
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
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
                {generatingPhase === 'messages' ? 'Generazione…' : 'Genera messaggi'}
              </button>
            )}
            {hasData && !externalToolbar && (
              <button
                type="button"
                onClick={() => setShowOnlyMessageNodesLocal((v) => !v)}
                title={showOnlyMessageNodes ? 'Mostra tutti i nodi' : 'Mostra solo nodi con messaggio'}
                className={`flex items-center gap-1 px-2 py-1 font-mono text-[10px] rounded border transition-colors ${
                  showOnlyMessageNodes
                    ? 'text-amber-300 border-amber-400/40 bg-amber-400/10'
                    : 'text-emerald-400/50 border-[#1a3a2a] hover:border-emerald-400/30'
                }`}
              >
                Solo messaggi
              </button>
            )}
            {hasData && !agentReady && !externalToolbar && (
              <>
                <button
                  onClick={() => void (async () => {
                    const overwrite = grammarOverwrite;
                    try {
                      await generateGrammars(documentText ?? '', doc.name, overwrite);
                      if (overwrite) setGrammarOverwriteMode(false);
                    } catch { /* error in hook */ }
                  })()}
                  disabled={!canRun || !canRunGrammarGeneration}
                  title={grammarOverwrite
                    ? 'Sovrascrive tutte le grammatiche (istantaneo)'
                    : 'Genera grammatiche dai path (istantaneo)'}
                  className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs font-semibold text-emerald-900 bg-sky-400 rounded hover:bg-sky-300 transition-colors disabled:opacity-40"
                >
                  <Braces className="w-3.5 h-3.5" />
                  {grammarOverwrite
                    ? 'Rigenera tutte'
                    : missingGrammarCount > 0
                      ? `Genera mancanti (${missingGrammarCount})`
                      : 'Genera grammatiche'}
                </button>
                <button
                  type="button"
                  onClick={() => void (async () => {
                    const overwrite = grammarOverwrite;
                    try {
                      await generateGrammarsWithAi(documentText ?? '', doc.name, overwrite);
                      if (overwrite) setGrammarOverwriteMode(false);
                    } catch { /* error in hook */ }
                  })()}
                  disabled={!canRun || !canRunGrammarGeneration}
                  title="Affina grammatiche con IA (lento)"
                  className="flex items-center gap-1 px-2 py-1.5 font-mono text-[10px] rounded border border-violet-400/30 text-violet-300/80 hover:bg-violet-400/10 transition-colors disabled:opacity-40"
                >
                  {generating && generatingPhase === 'grammars' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'IA'}
                </button>
              </>
            )}
            {hasData && !externalToolbar && (
              <button
                type="button"
                onClick={() => setGrammarOverwriteMode(!grammarOverwrite)}
                disabled={generating}
                title={grammarOverwrite ? 'Rigenera tutte (attivo)' : 'Solo mancanti (attivo)'}
                className={`flex items-center justify-center w-7 h-7 rounded border transition-colors ${
                  grammarOverwrite
                    ? 'border-amber-400/50 bg-amber-400/15 text-amber-300'
                    : 'border-[#1a3a2a] text-emerald-400/40'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
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
            {hasMessages && (
              <button
                onClick={() => setTestOpen(!testOpen)}
                title={agentReady
                  ? 'Apri chat di test'
                  : 'Apri chat (genera le grammatiche per il riconoscimento risposte)'}
                className={`flex items-center gap-1 px-2 py-1 font-mono text-[10px] border rounded transition-colors ${
                  testOpen
                    ? 'text-emerald-300 border-emerald-400/50 bg-emerald-400/10'
                    : agentReady
                      ? 'text-emerald-400/60 border-emerald-400/25 hover:border-emerald-400/50 hover:text-emerald-400/90'
                      : 'text-amber-400/60 border-amber-400/25 hover:border-amber-400/50 hover:text-amber-400/90'
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
          Tassonomia pronta ({rows.length} nodi). Usa <strong className="font-normal">Affina</strong> per raffinare la struttura, poi <strong className="font-normal">Genera messaggi</strong> e infine <strong className="font-normal">Crea grammatiche</strong>.
        </div>
      )}

      {(loading || (generating && generatingPhase === 'taxonomy' && !hasData)) && (
        <div className="flex items-center justify-center gap-2 py-8 text-emerald-400/60">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="font-mono text-sm">{generating ? generatingLabel : 'Caricamento…'}</span>
        </div>
      )}

      {generating && (generatingPhase === 'messages' || generatingPhase === 'grammars') && hasData && externalToolbar && (
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-emerald-400/15 bg-emerald-400/5 font-mono text-[10px] text-emerald-400/70">
          <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
          {agentGenProgress
            ? `${generatingPhase === 'grammars' ? 'Grammatiche' : 'Messaggi'} — ramo ${agentGenProgress.current}/${agentGenProgress.total}`
            : generatingPhase === 'grammars' ? 'Preparazione grammatiche…' : 'Preparazione messaggi…'}
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
              ? 'Usa "Genera messaggi" per albero e domande, poi "Crea grammatiche agente".'
              : documentText
                ? 'Premi "Genera tassonomia" per estrarre la struttura dal documento.'
                : 'Caricamento documento in corso…'}
          </p>
        </div>
      )}

      {!loading && hasData && (!generating || generatingPhase === 'messages' || generatingPhase === 'grammars') && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {externalToolbar && hasData && (
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
          <div className="flex-1 min-h-0 overflow-hidden">
            {externalToolbar ? (
              <SplitAgentTable
                rows={rows}
                showOnlyMessageNodes={showOnlyMessageNodes}
                selectedSlot={selectedSlot}
                onSelectSlot={(slot) => onSelectedSlotChange?.(slot)}
                onUpdateRow={updateRow}
                onDeleteRow={deleteRow}
                onAddRow={addRow}
                onRestructurePath={restructurePath}
                dirtyRoots={dirtyRoots}
                regeningRoots={regeningRoots}
                onRegenRoot={handleRegenRoot}
                grammarEditTarget={grammarEditTarget}
                itemPaths={itemPaths}
                onToggleGrammarEdit={toggleGrammarEdit}
                onGrammarSave={handleGrammarSaveForSlot}
                onGrammarEditCancel={closeGrammarEdit}
              />
            ) : viewMode === 'tree' ? (
              <TreeTable
                rows={rows}
                showOnlyMessageNodes={showOnlyMessageNodes}
                onUpdateRow={updateRow}
                onDeleteRow={deleteRow}
                onAddRow={addRow}
                onRestructurePath={restructurePath}
                dirtyRoots={dirtyRoots}
                regeningRoots={regeningRoots}
                onRegenRoot={handleRegenRoot}
                grammarEditTarget={grammarEditTarget}
                itemPaths={itemPaths}
                onToggleGrammarEdit={toggleGrammarEdit}
                onGrammarSave={handleGrammarSaveForSlot}
                onGrammarEditCancel={closeGrammarEdit}
              />
            ) : (
              <FlatTable
                rows={rows}
                showOnlyMessageNodes={showOnlyMessageNodes}
                onUpdateRow={updateRow}
                onDeleteRow={deleteRow}
                onAddRow={addRow}
                onRestructurePath={restructurePath}
                dirtyRoots={dirtyRoots}
                regeningRoots={regeningRoots}
                onRegenRoot={handleRegenRoot}
                grammarEditTarget={grammarEditTarget}
                itemPaths={itemPaths}
                onToggleGrammarEdit={toggleGrammarEdit}
                onGrammarSave={handleGrammarSaveForSlot}
                onGrammarEditCancel={closeGrammarEdit}
              />
            )}
          </div>
          {testOpen && (
            <ChatPanel
              rows={rows}
              agentConfig={{
                start_question: analysis?.start_question ?? null,
                confirmation_preamble: analysis?.confirmation_preamble ?? null,
                item_paths: analysis?.item_paths ?? null,
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
