import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  Sparkles, Loader2, AlertCircle, AlertTriangle, ChevronRight, ChevronDown,
  List, GitBranch, Wand2, X, ThumbsUp, ThumbsDown, HelpCircle,
  Pencil, Check, Zap, FlaskConical, Trash2, RefreshCw, Braces, Plus,
  Layers, Bot, Save, RotateCcw, MessageCircle, Filter, Search,
} from 'lucide-react';
import type {
  GrammarEditMode,
  GrammarEditTarget,
  GrammarEntry,
  useAnalysis,
  AnalysisRow,
  RowStatus,
} from '../../hooks/useAnalysis';
import { resolveItemPaths } from '../../lib/itemPaths';
import type { KbDocument } from '../../lib/supabase';
import { ChatPanel } from './ChatPanel';
import { ConvaiExportPanel } from './ConvaiExportPanel';
import { ConvaiNoBeExportPanel } from './ConvaiNoBeExportPanel';
import { AnswerGrammarModal } from './AnswerGrammarModal';
import {
  AnswerGrammarSynonymTooltip,
  type GrammarTooltipAnchor,
} from './AnswerGrammarSynonymTooltip';
import { buildGrammarEditorState } from '../../lib/grammarSynonyms';
import { yieldToUi } from '../../lib/yieldToUi';
import { SlotCategoryLabelDisplay, SlotLabelDisplay, SlotPathDisplay } from './SlotPathDisplay';
import {
  analysisForestLevel,
  analysisForestRootRows,
  analysisForestRootSlot,
  collectDirectChildSlots,
  getInteractiveMessageSlots,
  isSlotHiddenByCollapse,
  orderAnalysisRowsDepthFirst,
  rowHasMessage,
  slotsWithDirectChildren,
} from '../../lib/analysisTree';
import { compileAgentBundle } from '../../lib/compileAgentBundle';
import type { TokenCategory } from '../../lib/dictionaryTree';
import {
  buildRowFieldStatusUpdate,
  computeMessageReviewStats,
  getFieldMeta,
  type MessageReviewField,
  type MessageSource,
} from '../../lib/messageReview';

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
  convaiOpen?: boolean;
  onConvaiOpenChange?: (open: boolean) => void;
  convaiNoBeOpen?: boolean;
  onConvaiNoBeOpenChange?: (open: boolean) => void;
  convaiExportContext?: {
    dictionary: import('../../lib/tokenDictionary').TokenDictionary | null;
    descriptions: string[];
    loadedRefs?: import('../../lib/multiDictionarySegment').LoadedDictionaryRef[];
    dictionaryDirty?: boolean;
    pathsOutOfSync?: boolean;
  } | null;
  /** Corpus descriptions keyed by leaf path (for IA confirmation generation). */
  leafDescriptionMap?: Map<string, string> | null;
  selectedSlot?: string | null;
  onSelectedSlotChange?: (slot: string | null) => void;
  grammarEditTarget?: GrammarEditTarget | null;
  onGrammarEditTargetChange?: (target: GrammarEditTarget | null) => void;
  /** When true, grammar generation overwrites existing regex. */
  grammarOverwrite?: boolean;
  onGrammarOverwriteChange?: (overwrite: boolean) => void;
  /** Dictionary tokens — source of truth for recognition grammars. */
  grammarTokens?: import('../../lib/tokenDictionary').TokenEntry[];
  /** Called after category grammars are generated. */
  onTokenGrammarSaved?: (result: {
    tokens: import('../../lib/tokenDictionary').TokenEntry[];
    categories: TokenCategory[];
  }) => void;
  /** Dictionary workflow — tree mounts deterministically before messages. */
  dictionaryMode?: boolean;
  agentDictionaryContext?: import('../../features/document-editor/useDocumentEditorController').AgentDictionaryContext | null;
  onGenerateDialogueMessages?: () => void | Promise<void>;
  /** Merged dictionary categories for sibling tree ordering. */
  pathOrderingCategories?: TokenCategory[];
}

// ── Types ─────────────────────────────────────────────────────────────────────

type EditField = 'question' | 'no_match_1' | 'no_match_2' | 'no_match_3' | 'confirmation_text';

/** Which no-match columns are visible in the message table (toggled from the toolbar). */
interface NoMatchColumnVisibility {
  show1: boolean;
  show2: boolean;
  show3: boolean;
}

const DEFAULT_NO_MATCH_COLUMNS: NoMatchColumnVisibility = {
  show1: false,
  show2: false,
  show3: false,
};

function countNoMatchColumns(visibility: NoMatchColumnVisibility): number {
  return (visibility.show1 ? 1 : 0) + (visibility.show2 ? 1 : 0) + (visibility.show3 ? 1 : 0);
}

function countTreeTableColumns(visibility: NoMatchColumnVisibility): number {
  return 1 + 1 + countNoMatchColumns(visibility);
}

/** Toolbar toggles for optional no-match columns. */
function NoMatchColumnToggles({
  visibility,
  onChange,
}: {
  visibility: NoMatchColumnVisibility;
  onChange: (next: NoMatchColumnVisibility) => void;
}) {
  const items = [
    { key: 'show1' as const, label: '1° no match' },
    { key: 'show2' as const, label: '2° no match' },
    { key: 'show3' as const, label: '3° no match' },
  ];
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {items.map(({ key, label }) => {
        const active = visibility[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange({ ...visibility, [key]: !active })}
            title={active ? `Nascondi colonna ${label}` : `Mostra colonna ${label}`}
            className={`px-2 py-1 font-mono text-xs rounded border transition-colors whitespace-nowrap ${
              active
                ? 'text-orange-200 border-orange-400/45 bg-orange-400/15'
                : 'text-emerald-400/45 border-[#1a3a2a] hover:border-emerald-400/30 hover:text-emerald-400/75'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

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

// ── Inline cell toolbar (appears after text on row hover) ─────────────────────

type HoverAction = 'approve' | 'reject' | 'uncertain' | null;

function cellTextColor(status: RowStatus | undefined, hover: HoverAction): string {
  const effective = hover ?? status;
  if (effective === 'approved') return 'text-emerald-300/90';
  if (effective === 'rejected') return 'text-red-300/80';
  if (effective === 'uncertain') return 'text-amber-300/80';
  return 'text-orange-300/75';
}

/** Badge shown on IA-authored cells pending validation. */
function MessageSourceBadge({ source, validated }: { source?: MessageSource; validated: boolean }) {
  if (source !== 'ai' || validated) return null;
  return (
    <span
      className="inline-flex items-center flex-shrink-0 mr-1 px-1 py-px rounded font-mono text-sm font-bold uppercase tracking-wide text-violet-300/90 bg-violet-400/15"
      title="Redazione IA — da validare"
    >
      IA
    </span>
  );
}

function messageCellStatusProps(
  row: AnalysisRow,
  field: MessageReviewField,
  onUpdate: (updates: Partial<AnalysisRow>) => void,
) {
  const meta = getFieldMeta(row, field);
  return {
    fieldMeta: meta,
    source: meta.source,
    onFieldStatusChange: (status: RowStatus) =>
      onUpdate(buildRowFieldStatusUpdate(row, field, status)),
  };
}

/** Visual indicator that a node needs recalculation (action is in the hover toolbar). */
function DirtyRegenChip({ isDirty, isRegening }: { isDirty: boolean; isRegening: boolean }) {
  if (!isDirty && !isRegening) return null;
  if (isRegening) {
    return (
      <span className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-400/30 bg-amber-400/10 text-amber-400/60 font-mono text-sm font-bold uppercase tracking-wider">
        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
        Ricalcolo…
      </span>
    );
  }
  return (
    <span
      title="Struttura cambiata — usa la toolbar (↻) per ricalcolare domande e grammatiche"
      className="flex-shrink-0 px-1.5 py-0.5 rounded border border-amber-400/50 bg-amber-400/10 text-amber-400 font-mono text-sm font-bold uppercase tracking-wider animate-pulse"
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
  onGrammarTooltipShow,
  onGrammarTooltipHide,
  onAddChild,
  onAddSibling,
  onRegen,
  onHoverChange,
  blockRow,
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
  onGrammarTooltipShow?: (anchor: GrammarTooltipAnchor) => void;
  onGrammarTooltipHide?: () => void;
  onAddChild?: () => void;
  onAddSibling?: () => void;
  onRegen?: () => void;
  onHoverChange?: (a: HoverAction) => void;
  blockRow?: boolean;
}) {
  return (
    <span
      data-cell-actions
      className={`${blockRow ? 'flex w-full ml-0' : 'inline-flex ml-1 align-middle'} items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto hover:pointer-events-auto whitespace-nowrap`}
    >
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
            onMouseEnter={(e) => {
              const toolbar = e.currentTarget.closest('[data-cell-actions]') as HTMLElement | null;
              const questionText = toolbar?.closest('[data-cell-content]')
                ?.querySelector('[data-cell-question-text]') as HTMLElement | null;
              if (toolbar && questionText) {
                onGrammarTooltipShow?.({ toolbar, questionText });
              }
            }}
            onMouseLeave={() => onGrammarTooltipHide?.()}
            onMouseDown={(e) => {
              e.preventDefault();
              onGrammarTooltipHide?.();
              onToggleGrammar();
            }}
            aria-label={grammarOpen ? 'Chiudi editor sinonimi' : 'Sinonimi grammatica'}
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
    </span>
  );
}

// ── Editable data cell ────────────────────────────────────────────────────────

function DataCell({
  field,
  value,
  fieldMeta,
  source,
  onFieldStatusChange,
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
  fieldMeta?: { status?: RowStatus; source?: MessageSource };
  source?: MessageSource;
  onFieldStatusChange?: (status: RowStatus) => void;
  editingField: EditField | null;
  draftValue: string;
  onDraftChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onStartEdit: (f: EditField) => void;
  tdClass?: string;
}) {
  const [hoverAction, setHoverAction] = useState<HoverAction>(null);
  const isEditing = editingField === field;
  const cellStatus = fieldMeta?.status ?? null;
  const validated = cellStatus === 'approved';

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
          className="w-full bg-[#0a1510] border border-emerald-400/40 rounded px-2 py-1 font-sans text-sm text-emerald-200 placeholder-emerald-400/20 resize-none focus:outline-none focus:border-emerald-400/70 transition-colors"
        />
        <div className="flex items-center gap-1 mt-1">
          <button
            onClick={onSave}
            className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-400/20 border border-emerald-400/40 rounded text-emerald-400 hover:bg-emerald-400/30 transition-colors font-mono text-sm"
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
  const displayValue = value?.trim() ?? '';
  const toggleStatus = (s: RowStatus) => {
    if (!onFieldStatusChange) return;
    onFieldStatusChange(cellStatus === s ? null : s);
  };

  return (
    <td className={`group relative overflow-visible px-3 py-1.5 border-r border-[#1a3a2a] align-top min-w-0 ${tdClass ?? ''}`}>
      <div className="flex flex-wrap items-baseline gap-x-0 gap-y-0.5">
        {displayValue
          ? (
            <span className={`font-sans text-sm leading-relaxed transition-colors break-words min-w-0 ${textColor}`}>
              <MessageSourceBadge source={source ?? fieldMeta?.source} validated={validated} />
              {displayValue}
            </span>
          )
          : <span className="text-emerald-400/15 font-mono text-sm">—</span>}
        {editingField === null && displayValue && onFieldStatusChange && (
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
      </div>
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
        className="bg-[#0a1510] border border-emerald-400/50 rounded px-1.5 py-0.5 font-mono text-sm text-emerald-200 focus:outline-none focus:border-emerald-400/80 min-w-[200px] w-full max-w-lg transition-colors"
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
  onAnswerGrammarTooltipShow,
  onAnswerGrammarTooltipHide,
  noMatchColumns,
  pathOrderingCategories = [],
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
  noMatchColumns: NoMatchColumnVisibility;
  onToggleGrammarEdit: (slot: string, mode: GrammarEditMode) => void;
  onGrammarSave: (slot: string, mode: GrammarEditMode, grammar: GrammarEntry) => void;
  onGrammarEditCancel: () => void;
  onAnswerGrammarTooltipShow: (slot: string, anchor: GrammarTooltipAnchor) => void;
  onAnswerGrammarTooltipHide: () => void;
  onToggleCollapse: (slot: string) => void;
  onUpdateRow: (idx: number, updates: Partial<AnalysisRow>) => void;
  onDeleteRow: (idx: number) => void;
  onAddRow: (slot: string) => void;
  onRestructurePath: (idx: number, newPath: string) => void;
  isDirty: boolean;
  isRegening: boolean;
  onRegenRoot: (root: string) => void;
  pathOrderingCategories?: TokenCategory[];
}) {
  const isAnswerGrammarOpen = isGrammarEditOpen(grammarEditTarget, row.slot_filling, 'answer');
  const showGrammarTooltip = (anchor: GrammarTooltipAnchor) => {
    if (isInteractive && row.question?.trim()) {
      onAnswerGrammarTooltipShow(row.slot_filling, anchor);
    }
  };
  const depth = row.slot_filling.split('.').length - 1;
  const parentSlot = row.slot_filling.split('.').slice(0, -1).join('.');
  const isRoot = depth === 0;

  const [editingField, setEditingField] = useState<EditField | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [addMode, setAddMode] = useState<'child' | 'sibling' | null>(null);
  const [addDraft, setAddDraft] = useState('');
  const [editingPath, setEditingPath] = useState(false);
  const [pathDraft, setPathDraft] = useState('');
  const [slotHover, setSlotHover] = useState<HoverAction>(null);

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
    onUpdateRow(originalIndex, { [editingField]: draftValue || null });
    setEditingField(null);
  };

  const cancelEdit = () => setEditingField(null);

  const handleValidation = (status: RowStatus) => {
    if (isInteractive) {
      const cur = getFieldMeta(row, 'question').status ?? null;
      onUpdateRow(originalIndex, buildRowFieldStatusUpdate(row, 'question', cur === status ? null : status));
      return;
    }
    onUpdateRow(originalIndex, { status: row.status === status ? null : status });
  };

  const patchRow = (updates: Partial<AnalysisRow>) => onUpdateRow(originalIndex, updates);

  const questionMeta = getFieldMeta(row, 'question');
  const questionStatus = isInteractive ? questionMeta.status : row.status;
  const slotTextColor = isStart ? 'text-amber-300 font-bold' : cellTextColor(questionStatus, slotHover) + (isRoot ? ' font-semibold' : '');

  const rowBg = isStart
    ? 'bg-[#0d1a0a] border-l-2 border-l-amber-400/70'
    : questionStatus
      ? `${statusBgClass(questionStatus)} border-l-2 ${statusBorderClass(questionStatus)}`
      : isRoot
        ? 'bg-[#0a1a10] border-l-2 border-l-transparent'
        : 'bg-[#0d0d0d] border-l-2 border-l-transparent';

  return (
    <tr className={`${isHidden ? 'hidden' : ''} relative hover:z-30 hover:brightness-110 ${rowBg}`} aria-hidden={isHidden}>
      {/* Slot filling */}
      <td
        className="group relative overflow-visible px-3 py-1.5 border-r border-[#1a3a2a] align-top min-w-[220px]"
      >
        <div
          className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5"
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
          ) : pathOrderingCategories.length > 0 ? (
            <SlotCategoryLabelDisplay
              path={row.slot_filling}
              categories={pathOrderingCategories}
              className={slotTextColor}
            />
          ) : (
            <SlotLabelDisplay path={row.slot_filling} className={slotTextColor} />
          )}
          {!editingPath && isStart && (
            <span className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-400/15 border border-amber-400/30 text-amber-300 font-mono text-sm font-bold uppercase tracking-wider">
              <Zap className="w-2.5 h-2.5" />START
            </span>
          )}
          {!editingPath && row.status === 'approved' && <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          {!editingPath && row.status === 'rejected' && <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-red-500" />}
          {!editingPath && row.status === 'uncertain' && <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" />}
          {!editingPath && <DirtyRegenChip isDirty={isDirty} isRegening={isRegening} />}
          {!editingPath && editingField === null && (
            <CellActions
              status={row.status}
              canEdit={true}
              isDirty={isDirty}
              isRegening={isRegening}
              onApprove={() => handleValidation('approved')}
              onReject={() => handleValidation('rejected')}
              onUncertain={() => handleValidation('uncertain')}
              onEdit={() => { setPathDraft(row.slot_filling); setEditingPath(true); }}
              onDelete={() => onDeleteRow(originalIndex)}
              onAddChild={() => { setAddMode('child'); setAddDraft(''); }}
              onAddSibling={depth > 0 ? () => { setAddMode('sibling'); setAddDraft(''); } : undefined}
              onRegen={() => onRegenRoot(row.slot_filling)}
              onHoverChange={setSlotHover}
            />
          )}
        </div>
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
              className="bg-[#0a1510] border border-emerald-400/40 rounded px-1.5 py-0.5 font-mono text-sm text-emerald-200 placeholder-emerald-400/20 focus:outline-none focus:border-emerald-400/70 w-36 transition-colors"
            />
            <button onClick={confirmAdd} className="p-0.5 text-emerald-400/60 hover:text-emerald-400 transition-colors">
              <Check className="w-3 h-3" />
            </button>
            <button onClick={() => { setAddMode(null); setAddDraft(''); }} className="p-0.5 text-emerald-400/30 hover:text-emerald-400/60 transition-colors">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </td>

      {isInteractive ? (
        <td
          className="group relative overflow-visible px-3 py-1.5 border-r border-[#1a3a2a] align-top min-w-[200px]"
        >
        <div className="flex flex-col gap-0.5 min-w-0" data-cell-content>
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
              data-cell-question-text
              className="w-full bg-[#0a1510] border border-emerald-400/40 rounded px-2 py-1 font-sans text-sm text-emerald-200 resize-none focus:outline-none focus:border-emerald-400/70"
            />
          ) : row.question ? (
            <span
              data-cell-question-text
              className={`font-sans text-sm leading-relaxed ${cellTextColor(questionStatus, slotHover)}`}
            >
              <MessageSourceBadge source={questionMeta.source} validated={questionStatus === 'approved'} />
              {row.question.trim()}
            </span>
          ) : (
            <span className="text-emerald-400/15 font-mono text-sm">—</span>
          )}
          {editingField === null && row.question?.trim() && (
            <CellActions
              status={questionStatus}
              canEdit={true}
              grammarOpen={isAnswerGrammarOpen}
              isDirty={isDirty}
              isRegening={isRegening}
              blockRow
              onApprove={() => handleValidation('approved')}
              onReject={() => handleValidation('rejected')}
              onUncertain={() => handleValidation('uncertain')}
              onEdit={() => startEdit('question')}
              onToggleGrammar={() => onToggleGrammarEdit(row.slot_filling, 'answer')}
              onGrammarTooltipShow={showGrammarTooltip}
              onGrammarTooltipHide={onAnswerGrammarTooltipHide}
              onRegen={() => onRegenRoot(row.slot_filling)}
              onHoverChange={setSlotHover}
            />
          )}
        </div>
        </td>
      ) : (
        <DataCell
          field="question"
          value={row.question}
          {...messageCellStatusProps(row, 'question', patchRow)}
          editingField={editingField}
          draftValue={draftValue}
          onDraftChange={setDraftValue}
          onSave={saveEdit}
          onCancel={cancelEdit}
          onStartEdit={startEdit}
        />
      )}
      {noMatchColumns.show1 && (
        <DataCell
          field="no_match_1"
          value={row.no_match_1}
          {...messageCellStatusProps(row, 'no_match_1', patchRow)}
          editingField={editingField}
          draftValue={draftValue}
          onDraftChange={setDraftValue}
          onSave={saveEdit}
          onCancel={cancelEdit}
          onStartEdit={startEdit}
        />
      )}
      {noMatchColumns.show2 && (
        <DataCell
          field="no_match_2"
          value={row.no_match_2}
          {...messageCellStatusProps(row, 'no_match_2', patchRow)}
          editingField={editingField}
          draftValue={draftValue}
          onDraftChange={setDraftValue}
          onSave={saveEdit}
          onCancel={cancelEdit}
          onStartEdit={startEdit}
        />
      )}
      {noMatchColumns.show3 && (
        <DataCell
          field="no_match_3"
          value={row.no_match_3}
          {...messageCellStatusProps(row, 'no_match_3', patchRow)}
          editingField={editingField}
          draftValue={draftValue}
          onDraftChange={setDraftValue}
          onSave={saveEdit}
          onCancel={cancelEdit}
          onStartEdit={startEdit}
        />
      )}
    </tr>
  );
});

// ── Tree table ────────────────────────────────────────────────────────────────

function TreeTable({
  rows,
  showOnlyMessageNodes = false,
  noMatchColumns = DEFAULT_NO_MATCH_COLUMNS,
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
  onAnswerGrammarTooltipShow,
  onAnswerGrammarTooltipHide,
  pathOrderingCategories = [],
}: {
  rows: AnalysisRow[];
  showOnlyMessageNodes?: boolean;
  noMatchColumns?: NoMatchColumnVisibility;
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
  onAnswerGrammarTooltipShow: (slot: string, anchor: GrammarTooltipAnchor) => void;
  onAnswerGrammarTooltipHide: () => void;
  pathOrderingCategories?: TokenCategory[];
}) {
  const tableColSpan = countTreeTableColumns(noMatchColumns);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const collapsedKey = useMemo(() => [...collapsed].sort().join('\0'), [collapsed]);

  const orderedRows = useMemo(() => {
    const ordered = orderAnalysisRowsDepthFirst(
      rows,
      pathOrderingCategories.length > 0 ? pathOrderingCategories : undefined,
    );
    return showOnlyMessageNodes ? ordered.filter(rowHasMessage) : ordered;
  }, [rows, showOnlyMessageNodes, pathOrderingCategories]);
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
  const interactiveSlotSet = useMemo(
    () => new Set(getInteractiveMessageSlots(
      allSlots,
      itemPaths,
      pathOrderingCategories.length > 0 ? pathOrderingCategories : undefined,
    )),
    [allSlots, itemPaths, pathOrderingCategories],
  );
  const dirtyRootSet = useMemo(() => new Set(dirtyRoots), [dirtyRoots]);
  const regeningRootSet = useMemo(() => new Set(regeningRoots), [regeningRoots]);

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
          <th
            className="px-3 py-2 font-mono text-sm uppercase tracking-widest text-emerald-400/50 border-r border-[#1a3a2a]"
            style={{ minWidth: 280 }}
          >
            Albero
          </th>
          <th
            className={`px-3 py-2 font-mono text-sm uppercase tracking-widest text-emerald-400/50 ${countNoMatchColumns(noMatchColumns) > 0 ? 'border-r border-[#1a3a2a]' : ''}`}
            style={{ minWidth: 200 }}
          >
            Domanda
          </th>
          {noMatchColumns.show1 && (
            <th className="px-3 py-2 font-mono text-sm uppercase tracking-widest text-emerald-400/50 border-r border-[#1a3a2a]" style={{ minWidth: 150 }}>
              1° no match
            </th>
          )}
          {noMatchColumns.show2 && (
            <th className="px-3 py-2 font-mono text-sm uppercase tracking-widest text-emerald-400/50 border-r border-[#1a3a2a]" style={{ minWidth: 150 }}>
              2° no match
            </th>
          )}
          {noMatchColumns.show3 && (
            <th className="px-3 py-2 font-mono text-sm uppercase tracking-widest text-emerald-400/50" style={{ minWidth: 150 }}>
              3° no match
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {displayRows.map((item) => (
          <Fragment key={item.originalIndex}>
            {item.needsSeparator && (
              <tr aria-hidden="true">
                <td colSpan={tableColSpan} className="p-0 h-px bg-[#1a3a2a]" />
              </tr>
            )}
            <TreeNode
              row={item.row}
              originalIndex={item.originalIndex}
              hasChildren={item.hasChildren}
              isCollapsed={item.isCollapsed}
              isHidden={item.isHidden}
              isStart={item.row.slot_filling === singleRoot}
              isInteractive={interactiveSlotSet.has(item.row.slot_filling)}
              grammarEditTarget={grammarEditTarget}
              allSlots={allSlots}
              itemPaths={itemPaths}
              noMatchColumns={noMatchColumns}
              onToggleGrammarEdit={onToggleGrammarEdit}
              onGrammarSave={onGrammarSave}
              onGrammarEditCancel={onGrammarEditCancel}
              onAnswerGrammarTooltipShow={onAnswerGrammarTooltipShow}
              onAnswerGrammarTooltipHide={onAnswerGrammarTooltipHide}
              onToggleCollapse={onToggleCollapse}
              onUpdateRow={onUpdateRow}
              onDeleteRow={onDeleteRow}
              onAddRow={onAddRow}
              onRestructurePath={onRestructurePath}
              isDirty={dirtyRootSet.has(item.row.slot_filling)}
              isRegening={regeningRootSet.has(item.row.slot_filling)}
              onRegenRoot={onRegenRoot}
              pathOrderingCategories={pathOrderingCategories}
            />
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

// ── Split layout: tree left · messages right ─────────────────────────────────

const TREE_COLUMN_MIN_PX = 180;
const TREE_COLUMN_MAX_PX = 560;
const TREE_COLUMN_DEFAULT_PX = 280;
const TREE_COLUMN_WIDTH_KEY = 'analysis-tree-column-width';

function readStoredTreeColumnWidth(): number {
  try {
    const raw = localStorage.getItem(TREE_COLUMN_WIDTH_KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n)) {
      return Math.min(TREE_COLUMN_MAX_PX, Math.max(TREE_COLUMN_MIN_PX, Math.round(n)));
    }
  } catch {
    /* ignore */
  }
  return TREE_COLUMN_DEFAULT_PX;
}

function TreeRootFilterInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const active = value.trim().length > 0;
  return (
    <div className="relative flex items-center mt-1.5">
      <Search
        className="pointer-events-none absolute left-2 w-3.5 h-3.5 text-emerald-400/45"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filtra radici…"
        aria-label="Filtra nodi radice"
        className="w-full rounded border border-[#1a3a2a] bg-[#060c08] py-1 pl-7 pr-7 font-mono text-sm text-emerald-100/90 placeholder:text-emerald-400/25 focus:border-emerald-400/40 focus:outline-none"
      />
      {active && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-1 flex h-5 w-5 items-center justify-center rounded text-emerald-400/50 hover:bg-emerald-400/10 hover:text-emerald-300"
          aria-label="Cancella filtro radici"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

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
  onAnswerGrammarTooltipShow,
  onAnswerGrammarTooltipHide,
  treeOnly = false,
  treeColumnWidth = TREE_COLUMN_DEFAULT_PX,
  noMatchColumns = DEFAULT_NO_MATCH_COLUMNS,
  pathOrderingCategories = [],
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
  onAnswerGrammarTooltipShow: (slot: string, anchor: GrammarTooltipAnchor) => void;
  onAnswerGrammarTooltipHide: () => void;
  onUpdateRow: (idx: number, updates: Partial<AnalysisRow>) => void;
  onDeleteRow: (idx: number) => void;
  onAddRow: (slot: string) => void;
  onRestructurePath: (idx: number, newPath: string) => void;
  isDirty: boolean;
  isRegening: boolean;
  onRegenRoot: (root: string) => void;
  treeOnly?: boolean;
  treeColumnWidth?: number;
  noMatchColumns?: NoMatchColumnVisibility;
  pathOrderingCategories?: TokenCategory[];
}) {
  const isAnswerGrammarOpen = isGrammarEditOpen(grammarEditTarget, row.slot_filling, 'answer');
  const parentSlot = row.slot_filling.split('.').slice(0, -1).join('.');
  const showGrammarTooltip = (anchor: GrammarTooltipAnchor) => {
    if (isInteractive && row.question?.trim()) {
      onAnswerGrammarTooltipShow(row.slot_filling, anchor);
    }
  };
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

  const handleValidation = (status: RowStatus) => {
    const cur = getFieldMeta(row, 'question').status ?? row.status ?? null;
    onUpdateRow(originalIndex, buildRowFieldStatusUpdate(row, 'question', cur === status ? null : status));
  };

  const patchRow = (updates: Partial<AnalysisRow>) => onUpdateRow(originalIndex, updates);
  const questionMeta = getFieldMeta(row, 'question');
  const questionStatus = questionMeta.status ?? row.status;

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
    onUpdateRow(originalIndex, { [editingField]: draftValue || null });
    setEditingField(null);
  };

  const rowBg = isHighlighted
    ? 'bg-sky-400/[0.08]'
    : isStart
      ? 'bg-[#0d1a0a]'
      : questionStatus
        ? statusBgClass(questionStatus)
        : 'bg-[#0d0d0d]';

  const treeBg = isTreeChildHighlight
    ? 'bg-sky-400/[0.08]'
    : isTreeHovered
      ? 'bg-emerald-400/[0.06]'
      : '';

  return (
    <tr className={`relative hover:z-30 ${rowBg} hover:brightness-110`}>
      <td
        className={`group relative overflow-visible px-2 py-1.5 border-r border-[#1a3a2a] align-top cursor-pointer ${treeBg} ${isSelected ? 'ring-1 ring-inset ring-sky-400/50 bg-sky-400/[0.06]' : ''}`}
        style={{ width: treeColumnWidth, minWidth: treeColumnWidth, maxWidth: treeColumnWidth, paddingLeft: `${8 + depth * 14}px` }}
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
          ) : pathOrderingCategories.length > 0 ? (
            <SlotCategoryLabelDisplay
              path={row.slot_filling}
              categories={pathOrderingCategories}
              bold={row.slot_filling === singleRoot}
              className={row.slot_filling === singleRoot ? 'text-amber-300' : ''}
            />
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
          {!editingPath && editingField === null && (
            <CellActions
              status={row.status}
              canEdit={true}
              isDirty={isDirty}
              isRegening={isRegening}
              onApprove={() => handleValidation('approved')}
              onReject={() => handleValidation('rejected')}
              onUncertain={() => handleValidation('uncertain')}
              onEdit={() => { setPathDraft(row.slot_filling); setEditingPath(true); }}
              onDelete={() => onDeleteRow(originalIndex)}
              onAddChild={() => { setAddMode('child'); setAddDraft(''); }}
              onAddSibling={depth > 0 ? () => { setAddMode('sibling'); setAddDraft(''); } : undefined}
              onRegen={() => onRegenRoot(row.slot_filling)}
              onHoverChange={setSlotHover}
            />
          )}
        </div>
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
              className="bg-[#0a1510] border border-emerald-400/40 rounded px-1.5 py-0.5 font-mono text-sm text-emerald-200 placeholder-emerald-400/20 focus:outline-none focus:border-emerald-400/70 w-36 transition-colors"
            />
            <button onClick={confirmAdd} className="p-0.5 text-emerald-400/60 hover:text-emerald-400 transition-colors">
              <Check className="w-3 h-3" />
            </button>
            <button onClick={() => { setAddMode(null); setAddDraft(''); }} className="p-0.5 text-emerald-400/30 hover:text-emerald-400/60 transition-colors">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </td>
      {treeOnly ? null : (
        <>
        <td
          className="group relative overflow-visible px-3 py-1.5 border-r border-[#1a3a2a] align-top min-w-[200px]"
        >
        <div className="flex flex-col gap-0.5 min-w-0" data-cell-content>
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
            data-cell-question-text
            className="w-full bg-[#0a1510] border border-emerald-400/40 rounded px-2 py-1 font-sans text-sm text-emerald-200 resize-none focus:outline-none focus:border-emerald-400/70"
          />
        ) : row.question ? (
          <span
            data-cell-question-text
            className={`font-sans text-sm leading-relaxed ${cellTextColor(questionStatus, slotHover)}`}
          >
            <MessageSourceBadge source={questionMeta.source} validated={questionStatus === 'approved'} />
            {row.question.trim()}
          </span>
        ) : (
          <span className="text-emerald-400/15 font-mono text-sm">—</span>
        )}
        {editingField === null && row.question?.trim() && (
          <CellActions
            status={questionStatus}
            canEdit={true}
            grammarOpen={isAnswerGrammarOpen}
            isDirty={isDirty}
            isRegening={isRegening}
            blockRow={isInteractive}
            onApprove={() => handleValidation('approved')}
            onReject={() => handleValidation('rejected')}
            onUncertain={() => handleValidation('uncertain')}
            onEdit={() => startEdit('question')}
            onToggleGrammar={isInteractive ? () => onToggleGrammarEdit(row.slot_filling, 'answer') : undefined}
            onGrammarTooltipShow={isInteractive ? showGrammarTooltip : undefined}
            onGrammarTooltipHide={isInteractive ? onAnswerGrammarTooltipHide : undefined}
            onRegen={() => onRegenRoot(row.slot_filling)}
            onHoverChange={setSlotHover}
          />
        )}
        </div>
      </td>
      {noMatchColumns.show1 && (
        <DataCell field="no_match_1" value={row.no_match_1} {...messageCellStatusProps(row, 'no_match_1', patchRow)} editingField={editingField} draftValue={draftValue} onDraftChange={setDraftValue} onSave={saveEdit} onCancel={() => setEditingField(null)} onStartEdit={startEdit} />
      )}
      {noMatchColumns.show2 && (
        <DataCell field="no_match_2" value={row.no_match_2} {...messageCellStatusProps(row, 'no_match_2', patchRow)} editingField={editingField} draftValue={draftValue} onDraftChange={setDraftValue} onSave={saveEdit} onCancel={() => setEditingField(null)} onStartEdit={startEdit} />
      )}
      {noMatchColumns.show3 && (
        <DataCell field="no_match_3" value={row.no_match_3} {...messageCellStatusProps(row, 'no_match_3', patchRow)} editingField={editingField} draftValue={draftValue} onDraftChange={setDraftValue} onSave={saveEdit} onCancel={() => setEditingField(null)} onStartEdit={startEdit} />
      )}
      {isLeaf ? (
        <DataCell field="confirmation_text" value={row.confirmation_text} {...messageCellStatusProps(row, 'confirmation_text', patchRow)} editingField={editingField} draftValue={draftValue} onDraftChange={setDraftValue} onSave={saveEdit} onCancel={() => setEditingField(null)} onStartEdit={startEdit} tdClass="border-r-0" />
      ) : (
        <td className="px-3 py-1.5 border-r-0 align-middle">
          <span className="text-emerald-400/10 font-mono text-sm">—</span>
        </td>
      )}
        </>
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
        <span className="font-mono text-sm uppercase tracking-widest text-emerald-400/50">Domanda di start</span>
        <textarea
          value={startQuestion}
          onChange={(e) => onStartQuestionChange(e.target.value)}
          placeholder="Es: Buongiorno, di quale esame ha bisogno?"
          rows={2}
          className="w-full bg-[#0a1510] border border-[#1a3a2a] rounded px-3 py-2 font-sans text-sm text-emerald-200 placeholder-emerald-400/20 resize-none focus:outline-none focus:border-emerald-400/40"
        />
      </label>
      <div className="flex flex-col gap-2 min-w-0">
        <label className="flex flex-col gap-1 min-w-0">
          <span className="font-mono text-sm uppercase tracking-widest text-emerald-400/50">Preambolo di conferma</span>
          <input
            type="text"
            value={confirmationPreamble}
            onChange={(e) => onPreambleChange(e.target.value)}
            placeholder="Quindi confermo:"
            className="w-full bg-[#0a1510] border border-[#1a3a2a] rounded px-3 py-2 font-sans text-sm text-emerald-200 placeholder-emerald-400/20 focus:outline-none focus:border-emerald-400/40"
          />
        </label>
        <button
          type="button"
          onClick={onGenerateConfirmations}
          disabled={!canGenerate || generatingConfirmations}
          className="self-start flex items-center gap-1.5 px-3 py-1.5 font-mono text-sm font-semibold text-emerald-900 bg-amber-400 rounded hover:bg-amber-300 transition-colors disabled:opacity-40"
        >
          {generatingConfirmations ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
          {generatingConfirmations ? 'Generazione conferme…' : 'Genera conferme IA'}
        </button>
      </div>
    </div>
  );
}

function AgentDialoguePrompt({
  onGenerate,
  generating,
  disabled,
  progress,
}: {
  onGenerate: () => void | Promise<void>;
  generating: boolean;
  disabled?: boolean;
  progress?: { current: number; total: number; rootSlot: string } | null;
}) {
  const [pending, setPending] = useState(false);
  const isBusy = generating || pending;

  useEffect(() => {
    if (!generating) setPending(false);
  }, [generating]);

  const handleClick = () => {
    if (disabled || isBusy) return;
    flushSync(() => setPending(true));
    onGenerate();
  };

  const progressLabel = progress && progress.total > 0
    ? `Ramo ${progress.current}/${progress.total}${progress.rootSlot ? ` · ${progress.rootSlot.split('.').pop()}` : ''}`
    : progress?.rootSlot === 'preparazione'
      ? 'Preparazione in corso…'
      : null;

  if (isBusy) {
    return (
      <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-6 px-10 py-8 bg-[#080e0a]">
        <div className="relative flex items-center justify-center w-44 h-44">
          <img
            src="/assets/robot2d.png"
            alt=""
            className="w-36 h-36 object-contain opacity-35"
            draggable={false}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-14 h-14 text-sky-400 animate-spin will-change-transform" />
          </div>
        </div>
        <div className="flex flex-col items-center gap-2 text-center max-w-sm">
          <p className="font-mono text-sm font-semibold text-emerald-200/95">
            Generazione messaggi di dialogo…
          </p>
          <p className="font-mono text-sm text-emerald-400/60 leading-relaxed">
            {progressLabel ?? 'Preparazione in corso, attendi qualche istante.'}
          </p>
        </div>
        {progress && progress.total > 0 && (
          <div className="w-full max-w-xs h-1.5 rounded-full bg-[#1a3a2a] overflow-hidden">
            <div
              className="h-full bg-sky-400 transition-all duration-300"
              style={{ width: `${Math.max(8, (progress.current / progress.total) * 100)}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-5 px-10 py-8 bg-[#080e0a]">
      <img
        src="/assets/robot2d.png"
        alt=""
        className="w-40 h-40 object-contain opacity-90"
        draggable={false}
      />
      <p className="font-mono text-sm text-emerald-200/90 text-center max-w-md leading-relaxed">
        Clicca{' '}
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled || isBusy}
          className="underline underline-offset-[3px] decoration-sky-400/80 text-sky-300 hover:text-sky-200 hover:decoration-sky-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          qui
        </button>
        {' '}per generare i messaggi di dialogo
      </p>
    </div>
  );
}

/** Full-panel overlay when dialogue generation runs outside the robot prompt layout. */
function DialogueGenerationOverlay({
  progress,
}: {
  progress?: { current: number; total: number; rootSlot: string } | null;
}) {
  const progressLabel = progress && progress.total > 0
    ? `Ramo ${progress.current}/${progress.total}${progress.rootSlot ? ` · ${progress.rootSlot.split('.').pop()}` : ''}`
    : 'Preparazione in corso, attendi qualche istante.';

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[#080e0a]/95 backdrop-blur-[2px] px-10">
      <Loader2 className="w-14 h-14 text-sky-400 animate-spin" />
      <div className="flex flex-col items-center gap-2 text-center max-w-sm">
        <p className="font-mono text-sm font-semibold text-emerald-200/95">
          Generazione messaggi di dialogo…
        </p>
        <p className="font-mono text-sm text-emerald-400/60 leading-relaxed">
          {progressLabel}
        </p>
      </div>
      {progress && progress.total > 0 && (
        <div className="w-full max-w-xs h-1.5 rounded-full bg-[#1a3a2a] overflow-hidden">
          <div
            className="h-full bg-sky-400 transition-all duration-300"
            style={{ width: `${Math.max(8, (progress.current / progress.total) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

const SplitAgentTable = memo(function SplitAgentTable({
  rows,
  showOnlyMessageNodes = false,
  noMatchColumns = DEFAULT_NO_MATCH_COLUMNS,
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
  onAnswerGrammarTooltipShow,
  onAnswerGrammarTooltipHide,
  treeOnly = false,
  treeColumnWidth: treeColumnWidthProp,
  onTreeColumnWidthChange,
  pathOrderingCategories = [],
}: {
  rows: AnalysisRow[];
  showOnlyMessageNodes?: boolean;
  noMatchColumns?: NoMatchColumnVisibility;
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
  onAnswerGrammarTooltipShow: (slot: string, anchor: GrammarTooltipAnchor) => void;
  onAnswerGrammarTooltipHide: () => void;
  treeOnly?: boolean;
  /** When set (e.g. taxonomy-only left panel), parent controls column width. */
  treeColumnWidth?: number;
  onTreeColumnWidthChange?: (width: number) => void;
  pathOrderingCategories?: TokenCategory[];
}) {
  const visibleNoMatchCount = countNoMatchColumns(noMatchColumns);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const [rootFilter, setRootFilter] = useState('');
  const [internalTreeWidth, setInternalTreeWidth] = useState(readStoredTreeColumnWidth);
  const [treeResizing, setTreeResizing] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const collapsedKey = useMemo(() => [...collapsed].sort().join('\0'), [collapsed]);

  const treeColumnWidth = treeColumnWidthProp ?? internalTreeWidth;
  const setTreeColumnWidth = onTreeColumnWidthChange ?? setInternalTreeWidth;
  const rootFilterActive = rootFilter.trim().length > 0;

  const orderedRows = useMemo(() => {
    const ordered = orderAnalysisRowsDepthFirst(
      rows,
      pathOrderingCategories.length > 0 ? pathOrderingCategories : undefined,
    );
    return showOnlyMessageNodes ? ordered.filter(rowHasMessage) : ordered;
  }, [rows, showOnlyMessageNodes, pathOrderingCategories]);
  const indexBySlot = useMemo(() => new Map(rows.map((r, i) => [r.slot_filling, i])), [rows]);
  const parentSlots = useMemo(() => slotsWithDirectChildren(rows), [rows]);
  const rootNodes = useMemo(() => rows.filter((r) => !r.slot_filling.includes('.')), [rows]);
  const singleRoot = rootNodes.length === 1 ? rootNodes[0]!.slot_filling : null;
  const forestLevel = useMemo(() => analysisForestLevel(rows), [rows]);

  const matchingForestRoots = useMemo(() => {
    const query = rootFilter.trim().toLowerCase();
    if (!query) return null;
    return new Set(
      analysisForestRootRows(rows)
        .filter((r) => {
          const label = r.slot_filling.split('.').pop() ?? r.slot_filling;
          return label.toLowerCase().includes(query) || r.slot_filling.toLowerCase().includes(query);
        })
        .map((r) => r.slot_filling),
    );
  }, [rows, rootFilter]);

  const onTreeSashPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setTreeResizing(true);
    const startX = e.clientX;
    const startWidth = treeColumnWidth;
    let lastWidth = startWidth;

    const onMove = (ev: PointerEvent) => {
      lastWidth = Math.min(TREE_COLUMN_MAX_PX, Math.max(TREE_COLUMN_MIN_PX, startWidth + ev.clientX - startX));
      setTreeColumnWidth(lastWidth);
    };

    const onUp = () => {
      setTreeResizing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!onTreeColumnWidthChange) {
        try {
          localStorage.setItem(TREE_COLUMN_WIDTH_KEY, String(Math.round(lastWidth)));
        } catch {
          /* ignore */
        }
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [treeColumnWidth, setTreeColumnWidth, onTreeColumnWidthChange]);

  useEffect(() => {
    tableScrollRef.current?.scrollTo({ top: 0 });
  }, [rootFilter]);
  const allSlots = useMemo(() => rows.map((r) => r.slot_filling), [rows]);
  const interactiveSlotSet = useMemo(
    () => new Set(getInteractiveMessageSlots(
      allSlots,
      itemPaths,
      pathOrderingCategories.length > 0 ? pathOrderingCategories : undefined,
    )),
    [allSlots, itemPaths, pathOrderingCategories],
  );
  const terminalItemSet = useMemo(() => new Set(itemPaths), [itemPaths]);
  const dirtyRootSet = useMemo(() => new Set(dirtyRoots), [dirtyRoots]);
  const regeningRootSet = useMemo(() => new Set(regeningRoots), [regeningRoots]);

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
      const isCollapsedHidden = isSlotHiddenByCollapse(row.slot_filling, collapsedSet);
      const isRootFilterHidden = matchingForestRoots !== null
        && !matchingForestRoots.has(analysisForestRootSlot(row.slot_filling, forestLevel));
      return {
        row,
        originalIndex,
        depth,
        isHidden: isCollapsedHidden || isRootFilterHidden,
        isCollapsed: collapsedSet.has(row.slot_filling),
        hasChildren: parentSlots.has(row.slot_filling),
      };
    });
  }, [orderedRows, indexBySlot, parentSlots, collapsedKey, matchingForestRoots, forestLevel]);

  const visibleRowCount = useMemo(
    () => displayRows.filter((item) => !item.isHidden).length,
    [displayRows],
  );

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 bg-[#080e0a]">
      <div
        ref={tableScrollRef}
        className={`relative flex-1 min-h-0 overflow-y-auto overflow-x-auto scrollbar-thin ${treeResizing ? 'select-none' : ''}`}
      >
        {!treeOnly && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={treeColumnWidth}
            onPointerDown={onTreeSashPointerDown}
            className="absolute top-0 bottom-0 z-30 w-1 cursor-col-resize bg-[#1a3a2a]/80 hover:bg-emerald-400/45 transition-colors"
            style={{ left: treeColumnWidth - 2 }}
          />
        )}
        <table className="w-full border-collapse text-left overflow-visible">
          <thead className="sticky top-0 z-20 bg-[#080e0a]">
            <tr className="border-b border-[#1a3a2a]">
              <th
                className={`${treeOnly ? 'w-full' : ''} px-3 py-2 border-r border-[#1a3a2a] font-mono text-xs uppercase tracking-widest text-emerald-400/50 text-left align-top`}
                style={treeOnly ? undefined : { width: treeColumnWidth, minWidth: treeColumnWidth, maxWidth: treeColumnWidth }}
              >
                <span>Albero</span>
                <TreeRootFilterInput value={rootFilter} onChange={setRootFilter} />
              </th>
              {!treeOnly && (
                <>
                  <th className={`px-3 py-2 font-mono text-xs uppercase tracking-widest text-emerald-400/50 ${visibleNoMatchCount > 0 ? 'border-r border-[#1a3a2a]' : ''}`} style={{ minWidth: 140 }}>
                    Domanda
                  </th>
                  {noMatchColumns.show1 && (
                    <th className="px-3 py-2 font-mono text-xs uppercase tracking-widest text-emerald-400/50 border-r border-[#1a3a2a]">
                      1° no match
                    </th>
                  )}
                  {noMatchColumns.show2 && (
                    <th className="px-3 py-2 font-mono text-xs uppercase tracking-widest text-emerald-400/50 border-r border-[#1a3a2a]">
                      2° no match
                    </th>
                  )}
                  {noMatchColumns.show3 && (
                    <th className="px-3 py-2 font-mono text-xs uppercase tracking-widest text-emerald-400/50 border-r border-[#1a3a2a]">
                      3° no match
                    </th>
                  )}
                  <th
                    className="px-3 py-2 font-mono text-xs uppercase tracking-widest text-emerald-400/50"
                    title="Conferma selezione"
                  >
                    Conferma
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {visibleRowCount === 0 && rootFilterActive ? (
              <tr>
                <td
                  colSpan={treeOnly ? 1 : 2 + visibleNoMatchCount + 1}
                  className="px-4 py-8 text-center font-mono text-sm text-emerald-400/35"
                >
                  Nessuna radice corrisponde al filtro.
                </td>
              </tr>
            ) : (
            displayRows.map((item) => (
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
                    isLeaf={terminalItemSet.has(item.row.slot_filling)}
                    isInteractive={interactiveSlotSet.has(item.row.slot_filling)}
                    isSelected={selectedSlot === item.row.slot_filling}
                    onUpdateRow={onUpdateRow}
                    onDeleteRow={onDeleteRow}
                    onAddRow={onAddRow}
                    onRestructurePath={onRestructurePath}
                    isDirty={dirtyRootSet.has(item.row.slot_filling)}
                    isRegening={regeningRootSet.has(item.row.slot_filling)}
                    onRegenRoot={onRegenRoot}
                    grammarEditTarget={grammarEditTarget}
                    allSlots={allSlots}
                    itemPaths={itemPaths}
                    onToggleGrammarEdit={onToggleGrammarEdit}
                    onGrammarSave={onGrammarSave}
                    onGrammarEditCancel={onGrammarEditCancel}
                    onAnswerGrammarTooltipShow={onAnswerGrammarTooltipShow}
                    onAnswerGrammarTooltipHide={onAnswerGrammarTooltipHide}
                    treeOnly={treeOnly}
                    treeColumnWidth={treeColumnWidth}
                    noMatchColumns={noMatchColumns}
                    pathOrderingCategories={pathOrderingCategories}
                  />
                )}
              </Fragment>
            ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});

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
  noMatchColumns = DEFAULT_NO_MATCH_COLUMNS,
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
  noMatchColumns?: NoMatchColumnVisibility;
  onToggleGrammarEdit: (slot: string, mode: GrammarEditMode) => void;
  onGrammarSave: (slot: string, mode: GrammarEditMode, grammar: GrammarEntry) => void;
  onGrammarEditCancel: () => void;
}) {
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
    onUpdate({ [editingField]: draftValue || null });
    setEditingField(null);
  };

  const cancelEdit = () => setEditingField(null);

  const handleValidation = (status: RowStatus) => {
    const cur = getFieldMeta(row, 'question').status ?? row.status ?? null;
    onUpdate(buildRowFieldStatusUpdate(row, 'question', cur === status ? null : status));
  };

  const patchRow = (updates: Partial<AnalysisRow>) => onUpdate(updates);
  const questionMeta = getFieldMeta(row, 'question');
  const questionStatus = questionMeta.status ?? row.status;

  const slotTextColor = isStart ? 'text-amber-300 font-bold' : cellTextColor(questionStatus, slotHover);

  const rowBg = isStart
    ? 'bg-[#0d1a0a] border-l-2 border-l-amber-400/70'
    : questionStatus
      ? `${statusBgClass(questionStatus)} border-l-2 ${statusBorderClass(questionStatus)}`
      : `${rowIndex % 2 === 0 ? 'bg-[#0d0d0d]' : 'bg-[#0f0f0f]'} border-l-2 border-l-transparent`;

  return (
    <Fragment>
      {needsSeparator && (
        <tr aria-hidden="true">
          <td colSpan={countTreeTableColumns(noMatchColumns)} className="p-0 h-px bg-[#1a3a2a]" />
        </tr>
      )}
      <tr className={`relative hover:z-30 transition-colors hover:brightness-110 ${rowBg}`}>
        <td className="group relative overflow-visible px-3 py-1.5 border-r border-[#1a3a2a] align-top whitespace-nowrap">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
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
              <span className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-400/15 border border-amber-400/30 text-amber-300 font-mono text-sm font-bold uppercase tracking-wider">
                <Zap className="w-2.5 h-2.5" />START
              </span>
            )}
            {!editingPath && <DirtyRegenChip isDirty={isDirty} isRegening={isRegening} />}
            {!editingPath && editingField === null && (
              <CellActions
                status={row.status}
                canEdit={true}
                isDirty={isDirty}
                isRegening={isRegening}
                onApprove={() => handleValidation('approved')}
                onReject={() => handleValidation('rejected')}
                onUncertain={() => handleValidation('uncertain')}
                onEdit={() => { setPathDraft(row.slot_filling); setEditingPath(true); }}
                onDelete={onDelete}
                onAddChild={() => { setAddMode('child'); setAddDraft(''); }}
                onAddSibling={depth > 0 ? () => { setAddMode('sibling'); setAddDraft(''); } : undefined}
                onRegen={onRegen}
                onHoverChange={setSlotHover}
              />
            )}
          </div>
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
                className="bg-[#0a1510] border border-emerald-400/40 rounded px-1.5 py-0.5 font-mono text-sm text-emerald-200 placeholder-emerald-400/20 focus:outline-none focus:border-emerald-400/70 w-36 transition-colors"
              />
              <button onClick={confirmAdd} className="p-0.5 text-emerald-400/60 hover:text-emerald-400 transition-colors">
                <Check className="w-3 h-3" />
              </button>
              <button onClick={() => { setAddMode(null); setAddDraft(''); }} className="p-0.5 text-emerald-400/30 hover:text-emerald-400/60 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </td>
        <DataCell
          field="question"
          value={row.question}
          {...messageCellStatusProps(row, 'question', patchRow)}
          editingField={editingField}
          draftValue={draftValue}
          onDraftChange={setDraftValue}
          onSave={saveEdit}
          onCancel={cancelEdit}
          onStartEdit={startEdit}
        />
        {noMatchColumns.show1 && (
          <DataCell
            field="no_match_1"
            value={row.no_match_1}
            {...messageCellStatusProps(row, 'no_match_1', patchRow)}
            editingField={editingField}
            draftValue={draftValue}
            onDraftChange={setDraftValue}
            onSave={saveEdit}
            onCancel={cancelEdit}
            onStartEdit={startEdit}
          />
        )}
        {noMatchColumns.show2 && (
          <DataCell
            field="no_match_2"
            value={row.no_match_2}
            {...messageCellStatusProps(row, 'no_match_2', patchRow)}
            editingField={editingField}
            draftValue={draftValue}
            onDraftChange={setDraftValue}
            onSave={saveEdit}
            onCancel={cancelEdit}
            onStartEdit={startEdit}
          />
        )}
        {noMatchColumns.show3 && (
          <DataCell
            field="no_match_3"
            value={row.no_match_3}
            {...messageCellStatusProps(row, 'no_match_3', patchRow)}
            editingField={editingField}
            draftValue={draftValue}
            onDraftChange={setDraftValue}
            onSave={saveEdit}
            onCancel={cancelEdit}
            onStartEdit={startEdit}
          />
        )}
      </tr>
    </Fragment>
  );
}

// ── Flat table ────────────────────────────────────────────────────────────────

function FlatTable({
  rows,
  showOnlyMessageNodes = false,
  noMatchColumns = DEFAULT_NO_MATCH_COLUMNS,
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
  pathOrderingCategories = [],
}: {
  rows: AnalysisRow[];
  showOnlyMessageNodes?: boolean;
  noMatchColumns?: NoMatchColumnVisibility;
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
  pathOrderingCategories?: TokenCategory[];
}) {
  const orderedRows = useMemo(() => {
    const ordered = orderAnalysisRowsDepthFirst(
      rows,
      pathOrderingCategories.length > 0 ? pathOrderingCategories : undefined,
    );
    return showOnlyMessageNodes ? ordered.filter(rowHasMessage) : ordered;
  }, [rows, showOnlyMessageNodes, pathOrderingCategories]);
  const indexBySlot = useMemo(
    () => new Map(rows.map((r, i) => [r.slot_filling, i])),
    [rows],
  );
  const rootNodes = useMemo(
    () => rows.filter((r) => !r.slot_filling.includes('.')),
    [rows],
  );
  const singleRoot = rootNodes.length === 1 ? rootNodes[0]!.slot_filling : null;
  const allSlots = useMemo(() => rows.map((r) => r.slot_filling), [rows]);
  const dirtyRootSet = useMemo(() => new Set(dirtyRoots), [dirtyRoots]);
  const regeningRootSet = useMemo(() => new Set(regeningRoots), [regeningRoots]);

  return (
    <table className="w-full border-collapse text-left overflow-visible">
      <thead className="sticky top-0 z-10 bg-[#080e0a]">
        <tr className="border-b border-[#1a3a2a]">
          <th className="px-3 py-2 font-mono text-xs uppercase tracking-widest text-emerald-400/50 border-r border-[#1a3a2a]">
            Path Completo
          </th>
          <th
            className={`px-3 py-2 font-mono text-xs uppercase tracking-widest text-emerald-400/50 ${countNoMatchColumns(noMatchColumns) > 0 ? 'border-r border-[#1a3a2a]' : ''}`}
            style={{ minWidth: 200 }}
          >
            Domanda
          </th>
          {noMatchColumns.show1 && (
            <th className="px-3 py-2 font-mono text-xs uppercase tracking-widest text-emerald-400/50 border-r border-[#1a3a2a]" style={{ minWidth: 150 }}>
              1° no match
            </th>
          )}
          {noMatchColumns.show2 && (
            <th className="px-3 py-2 font-mono text-xs uppercase tracking-widest text-emerald-400/50 border-r border-[#1a3a2a]" style={{ minWidth: 150 }}>
              2° no match
            </th>
          )}
          {noMatchColumns.show3 && (
            <th className="px-3 py-2 font-mono text-xs uppercase tracking-widest text-emerald-400/50" style={{ minWidth: 150 }}>
              3° no match
            </th>
          )}
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
              isDirty={dirtyRootSet.has(row.slot_filling)}
              isRegening={regeningRootSet.has(row.slot_filling)}
              onRegen={() => onRegenRoot(row.slot_filling)}
              grammarEditTarget={grammarEditTarget}
              allSlots={allSlots}
              itemPaths={itemPaths}
              onToggleGrammarEdit={onToggleGrammarEdit}
              onGrammarSave={onGrammarSave}
              onGrammarEditCancel={onGrammarEditCancel}
              noMatchColumns={noMatchColumns}
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
          <span className="font-mono text-sm text-amber-400/80 font-semibold">Affina tassonomia</span>
        </div>
        <button onClick={onClose} className="text-emerald-400/30 hover:text-emerald-400/70 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="font-mono text-sm text-emerald-400/50 leading-relaxed">
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
            className="px-2 py-0.5 rounded border border-[#1a3a2a] bg-[#0a1510] font-mono text-sm text-emerald-400/50 hover:text-emerald-400/80 hover:border-emerald-400/30 transition-colors text-left"
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
        className="w-full bg-[#0a1510] border border-[#1a3a2a] rounded px-3 py-2 font-mono text-sm text-emerald-200/80 placeholder-emerald-400/20 resize-none focus:outline-none focus:border-emerald-400/40 transition-colors"
      />
      <button
        onClick={() => onSubmit(notes)}
        disabled={!canSubmit}
        className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-sm font-semibold text-emerald-900 bg-emerald-400 rounded hover:bg-emerald-300 transition-colors disabled:opacity-40"
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
  convaiOpen: convaiOpenProp,
  onConvaiOpenChange,
  convaiNoBeOpen: convaiNoBeOpenProp,
  onConvaiNoBeOpenChange,
  convaiExportContext = null,
  leafDescriptionMap = null,
  selectedSlot = null,
  onSelectedSlotChange,
  grammarEditTarget: grammarEditTargetProp,
  onGrammarEditTargetChange,
  grammarOverwrite: grammarOverwriteProp = false,
  onGrammarOverwriteChange,
  grammarTokens = [],
  onTokenGrammarSaved,
  dictionaryMode = false,
  agentDictionaryContext = null,
  onGenerateDialogueMessages,
  pathOrderingCategories = [],
}: AnalysisViewProps) {
  const {
    analysis, loading, initialLoadDone, saving, analysisDirty, generating, generatingPhase, agentGenProgress,
    generatingConfirmations, error, regenError, messagesReady, hasMessages, agentReady, hasTaxonomy, canGenerateGrammars,
    missingGrammarCount, grammarsReady,
    generateTaxonomy, generateAgent, generateGrammars, generateGrammarsWithAi, refineTaxonomy, reviewMessagesWithAi, saveAnalysis, discardAnalysisChanges,
    updateAgentConfig, generateConfirmations,
    updateRow, deleteRow, addRow, restructurePath, dirtyRoots, regeningRoots, regenSubtreeFull, regenGrammarsSubtree,
  } = analysisApi;
  const [showOnlyMessageNodes, setShowOnlyMessageNodes] = useState(false);
  const [noMatchColumns, setNoMatchColumns] = useState<NoMatchColumnVisibility>(DEFAULT_NO_MATCH_COLUMNS);
  const [grammarOverwriteLocal, setGrammarOverwriteLocal] = useState(false);
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
  const [taxonomyTreeWidth, setTaxonomyTreeWidth] = useState(readStoredTreeColumnWidth);
  const [taxonomyResizing, setTaxonomyResizing] = useState(false);
  const taxonomySplitRef = useRef<HTMLDivElement>(null);
  const [grammarEditTargetLocal, setGrammarEditTargetLocal] = useState<GrammarEditTarget | null>(null);
  const grammarEditTarget = grammarEditTargetProp ?? grammarEditTargetLocal;
  const setGrammarEditTarget = onGrammarEditTargetChange ?? setGrammarEditTargetLocal;
  const [affinaOpenLocal, setAffinaOpenLocal] = useState(false);
  const [testOpenLocal, setTestOpenLocal] = useState(false);
  const affinaOpen = affinaOpenProp ?? affinaOpenLocal;
  const setAffinaOpen = onAffinaOpenChange ?? setAffinaOpenLocal;
  const testOpen = testOpenProp ?? testOpenLocal;
  const setTestOpen = onTestOpenChange ?? setTestOpenLocal;
  const convaiOpen = convaiOpenProp ?? false;
  const setConvaiOpen = onConvaiOpenChange ?? (() => {});
  const convaiNoBeOpen = convaiNoBeOpenProp ?? false;
  const setConvaiNoBeOpen = onConvaiNoBeOpenChange ?? (() => {});

  const rows: AnalysisRow[] = analysis?.rows ?? [];
  const itemPaths = useMemo(
    () => resolveItemPaths(rows.map((r) => r.slot_filling), analysis?.item_paths ?? null),
    [rows, analysis?.item_paths],
  );
  const hasData = rows.length > 0;

  const testAgentBundle = useMemo(() => {
    const dictionary = convaiExportContext?.dictionary ?? agentDictionaryContext?.dictionary;
    const descriptions = convaiExportContext?.descriptions
      ?? agentDictionaryContext?.descriptions
      ?? [];
    if (!dictionary || !analysis?.rows?.length) return null;
    try {
      return compileAgentBundle({
        documentName: doc.name,
        documentId: doc.id,
        mode: 'preview',
        dictionary,
        descriptions,
        analysis,
        leafDescriptionMap: leafDescriptionMap ?? undefined,
        loadedRefs: convaiExportContext?.loadedRefs,
        dictionaryDirty: convaiExportContext?.dictionaryDirty,
        analysisDirty,
        pathsOutOfSync: convaiExportContext?.pathsOutOfSync,
      });
    } catch {
      return null;
    }
  }, [
    convaiExportContext,
    agentDictionaryContext,
    analysis,
    leafDescriptionMap,
    doc.name,
    doc.id,
    analysisDirty,
  ]);

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
  const [dialogueGenRequested, setDialogueGenRequested] = useState(false);

  useEffect(() => {
    if (!generating) setDialogueGenRequested(false);
  }, [generating]);

  const isDialogueGenerating = dialogueGenRequested
    || (generating && generatingPhase === 'messages');

  const showAgentTaxonomyLayout = externalToolbar && dictionaryMode
    && (taxonomyOnly || isDialogueGenerating);

  const handleGenerateDialogueMessages = useCallback(() => {
    if (!onGenerateDialogueMessages || isDialogueGenerating) return;
    flushSync(() => setDialogueGenRequested(true));
    void (async () => {
      await yieldToUi();
      try {
        await onGenerateDialogueMessages();
      } catch {
        setDialogueGenRequested(false);
      }
    })();
  }, [onGenerateDialogueMessages, isDialogueGenerating]);

  const canGenerateDialogue = !!onGenerateDialogueMessages && hasTaxonomy && !isDialogueGenerating;

  const onTaxonomySashPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setTaxonomyResizing(true);
    const startX = e.clientX;
    const startWidth = taxonomyTreeWidth;
    let lastWidth = startWidth;

    const onMove = (ev: PointerEvent) => {
      lastWidth = Math.min(TREE_COLUMN_MAX_PX, Math.max(TREE_COLUMN_MIN_PX, startWidth + ev.clientX - startX));
      setTaxonomyTreeWidth(lastWidth);
    };

    const onUp = () => {
      setTaxonomyResizing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try {
        localStorage.setItem(TREE_COLUMN_WIDTH_KEY, String(Math.round(lastWidth)));
      } catch {
        /* ignore */
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [taxonomyTreeWidth]);

  const generatingLabel =
    generatingPhase === 'taxonomy'
      ? 'Sto costruendo la tassonomia…'
      : generatingPhase === 'messages'
        ? 'Sto generando messaggi…'
        : generatingPhase === 'grammars'
          ? 'Sto generando grammatiche…'
          : 'Caricamento…';

  const [grammarTooltip, setGrammarTooltip] = useState<{
    slot: string;
    anchor: GrammarTooltipAnchor;
  } | null>(null);

  const showAnswerGrammarTooltip = useCallback((slot: string, anchor: GrammarTooltipAnchor) => {
    if (grammarEditTarget) return;
    setGrammarTooltip({ slot, anchor });
  }, [grammarEditTarget]);

  const hideAnswerGrammarTooltip = useCallback(() => {
    setGrammarTooltip(null);
  }, []);

  const grammarTooltipPanels = useMemo(() => {
    if (!grammarTooltip) return [];
    const row = rows.find((r) => r.slot_filling === grammarTooltip.slot);
    if (!row?.question?.trim()) return [];
    const slots = rows.map((r) => r.slot_filling);
    const state = buildGrammarEditorState(
      grammarTooltip.slot,
      slots,
      itemPaths,
      row.answer_grammar,
      'answer',
      pathOrderingCategories.length > 0 ? pathOrderingCategories : undefined,
    );
    return state.panels;
  }, [grammarTooltip, rows, itemPaths, pathOrderingCategories]);

  const grammarEditRow = grammarEditTarget
    ? rows.find((r) => r.slot_filling === grammarEditTarget.slot)
    : null;

  const toggleGrammarEdit = useCallback((slot: string, mode: GrammarEditMode) => {
    onSelectedSlotChange?.(slot);
    setGrammarTooltip(null);
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
    updateRow(idx, { answer_grammar: grammar, status: null });
    setGrammarEditTarget(null);
  }, [rows, updateRow, setGrammarEditTarget]);

  const closeGrammarEdit = useCallback(() => {
    setGrammarEditTarget(null);
  }, [setGrammarEditTarget]);

  const handleSelectSlot = useCallback((slot: string) => {
    onSelectedSlotChange?.(slot);
  }, [onSelectedSlotChange]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const reviewStats = useMemo(
    () => (hasData && hasMessages
      ? computeMessageReviewStats(
        rows,
        itemPaths,
        pathOrderingCategories.length > 0 ? pathOrderingCategories : undefined,
      )
      : null),
    [hasData, hasMessages, rows, itemPaths, pathOrderingCategories],
  );
  const approvedCount = reviewStats?.validated ?? 0;
  const rejectedCount = reviewStats?.rejected ?? 0;
  const uncertainCount = reviewStats?.uncertain ?? 0;

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 overflow-hidden">
      <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 border-b border-[#1a3a2a] bg-[#0a1510] min-w-0">
        <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400/60" />
            <span className="font-mono text-sm text-emerald-400/60">
              {hasData
                ? taxonomyOnly
                  ? `${rows.length} nodi · Tassonomia`
                  : `${rows.length} nodi · ${new Date(analysis!.created_at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}`
                : loading || !initialLoadDone
                  ? 'Caricamento…'
                  : agentDictionaryContext
                    ? `${agentDictionaryContext.activeTokenCount} token · in attesa albero`
                    : 'Nessuna analisi'}
            </span>
          </div>
          {analysisDirty && (
            <span className="flex items-center gap-1 font-mono text-xs text-amber-400/90 px-1.5 py-0.5 rounded border border-amber-400/30 bg-amber-400/10 whitespace-nowrap">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              modifiche non salvate
            </span>
          )}
          {reviewStats && reviewStats.total > 0 && (
            <span className="font-mono text-xs text-emerald-400/70">
              {reviewStats.total} messaggi ·{' '}
              <span className="text-emerald-300/90">{reviewStats.validated} validati ({reviewStats.validatedPct}%)</span>
              {' · '}
              <span className="text-orange-300/80">{reviewStats.pending} da validare</span>
              {reviewStats.rejected > 0 && (
                <span className="text-red-400/70"> · {reviewStats.rejected} rifiutati</span>
              )}
              {reviewStats.uncertain > 0 && (
                <span className="text-amber-400/70"> · {reviewStats.uncertain} incerti</span>
              )}
            </span>
          )}
          {hasData && (
            <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-xs font-bold uppercase tracking-wider border whitespace-nowrap ${
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
          {hasData && (approvedCount > 0 || rejectedCount > 0 || uncertainCount > 0) && !reviewStats && (
            <div className="flex items-center gap-2 font-mono text-xs">
              {approvedCount > 0 && <span className="text-emerald-400/70">{approvedCount} validati</span>}
              {rejectedCount > 0 && <span className="text-red-400/70">{rejectedCount} rifiutati</span>}
              {uncertainCount > 0 && <span className="text-amber-400/70">{uncertainCount} incerti</span>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end flex-shrink-0 max-w-full">
          {hasData && hasMessages && (
            <>
              <NoMatchColumnToggles
                visibility={noMatchColumns}
                onChange={setNoMatchColumns}
              />
              <button
                type="button"
                onClick={() => setShowOnlyMessageNodes((v) => !v)}
                title={showOnlyMessageNodes ? 'Mostra tutte le celle' : 'Mostra solo nodi con domanda'}
                className={`flex items-center gap-1 px-2 py-1 font-mono text-xs rounded border transition-colors whitespace-nowrap ${
                  showOnlyMessageNodes
                    ? 'text-amber-300 border-amber-400/40 bg-amber-400/10'
                    : 'text-emerald-400/50 border-[#1a3a2a] hover:border-emerald-400/30 hover:text-emerald-400/80'
                }`}
              >
                <Filter className="w-3 h-3" />
                {showOnlyMessageNodes ? 'Tutte' : 'Solo domande'}
              </button>
              <button
                type="button"
                onClick={() => void reviewMessagesWithAi(doc.name, documentText ?? '').catch(() => {})}
                disabled={generating || !hasTaxonomy}
                className="flex items-center gap-1.5 px-2.5 py-1 font-mono text-xs rounded border border-violet-400/30 text-violet-200/90 hover:bg-violet-400/10 transition-colors disabled:opacity-40 whitespace-nowrap"
                title="Rigenera i messaggi con IA e li marca come da validare"
              >
                {generating && generatingPhase === 'messages'
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Sparkles className="w-3 h-3" />}
                Revisiona IA
              </button>
            </>
          )}
          {!externalToolbar && (
            <>
            {hasData && (
              <>
                <button
                  type="button"
                  onClick={() => void saveAnalysis()}
                  disabled={!analysisDirty || saving || generating}
                  className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-sm font-semibold text-emerald-900 bg-sky-400 rounded hover:bg-sky-300 transition-colors disabled:opacity-40"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {saving ? 'Salvataggio…' : 'Salva analisi'}
                </button>
                {analysisDirty && (
                  <button
                    type="button"
                    onClick={() => void discardAnalysisChanges()}
                    disabled={saving || generating}
                    className="flex items-center gap-1 px-2 py-1.5 font-mono text-sm text-emerald-400/60 border border-[#1a3a2a] rounded hover:border-emerald-400/30 hover:text-emerald-400/90 transition-colors disabled:opacity-30"
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
                className="flex items-center gap-1 px-2 py-1 font-mono text-sm text-amber-400/60 border border-amber-400/25 rounded hover:border-amber-400/50 hover:text-amber-400/90 transition-colors disabled:opacity-30"
              >
                <Wand2 className="w-3 h-3" />Affina
              </button>
            )}
            {taxonomyOnly && (
              <button
                onClick={handleGenerateAgent}
                disabled={!canRun}
                className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-sm font-semibold text-emerald-900 bg-emerald-400 rounded hover:bg-emerald-300 transition-colors disabled:opacity-40"
              >
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
                {generatingPhase === 'messages' ? 'Generazione…' : 'Genera messaggi'}
              </button>
            )}
            {hasData && !agentReady && !externalToolbar && (
              <>
                <button
                  onClick={() => void (async () => {
                    const overwrite = grammarOverwrite;
                    try {
                      const result = await generateGrammars(grammarTokens, documentText ?? '', doc.name, overwrite);
                      if (result) onTokenGrammarSaved?.(result);
                      if (overwrite) setGrammarOverwriteMode(false);
                    } catch { /* error in hook */ }
                  })()}
                  disabled={!canRun || !canRunGrammarGeneration}
                  title={grammarOverwrite
                    ? 'Sovrascrive tutte le grammatiche (istantaneo)'
                    : 'Genera grammatiche dai path (istantaneo)'}
                  className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-sm font-semibold text-emerald-900 bg-sky-400 rounded hover:bg-sky-300 transition-colors disabled:opacity-40"
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
                  className="flex items-center gap-1 px-2 py-1.5 font-mono text-sm rounded border border-violet-400/30 text-violet-300/80 hover:bg-violet-400/10 transition-colors disabled:opacity-40"
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
                className="flex items-center gap-1 px-2 py-1 font-mono text-sm text-emerald-400/50 border border-[#1a3a2a] rounded hover:border-emerald-400/30 hover:text-emerald-400/80 transition-colors disabled:opacity-30"
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
                className={`flex items-center gap-1 px-2 py-1 font-mono text-sm border rounded transition-colors ${
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
                className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-sm font-semibold text-emerald-900 bg-emerald-400 rounded hover:bg-emerald-300 transition-colors disabled:opacity-40"
              >
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
                {generatingPhase === 'taxonomy' ? 'Generazione…' : 'Genera tassonomia'}
              </button>
            )}
            </>
          )}
        </div>
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
        <div className="flex-shrink-0 px-4 py-2 border-b border-amber-400/20 bg-amber-400/5 font-mono text-sm text-amber-400/80">
          Tassonomia pronta ({rows.length} nodi). Usa <strong className="font-normal">Affina</strong> per raffinare la struttura, poi <strong className="font-normal">Genera messaggi</strong> e infine <strong className="font-normal">Crea grammatiche</strong>.
        </div>
      )}

      {(loading || !initialLoadDone || (generating && generatingPhase === 'taxonomy' && !hasData)) && (
        <div className="flex items-center justify-center gap-2 py-8 text-emerald-400/60">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="font-mono text-sm">{generating ? generatingLabel : 'Caricamento…'}</span>
        </div>
      )}

      {generating && (generatingPhase === 'messages' || generatingPhase === 'grammars') && hasData && externalToolbar && (
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-emerald-400/15 bg-emerald-400/5 font-mono text-sm text-emerald-400/70">
          <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
          {agentGenProgress
            ? `${generatingPhase === 'grammars' ? 'Grammatiche' : 'Messaggi'} — ramo ${agentGenProgress.current}/${agentGenProgress.total}`
            : generatingPhase === 'grammars' ? 'Preparazione grammatiche…' : 'Preparazione messaggi…'}
        </div>
      )}

      {error && !generating && !hasData && (
        <div className="flex items-center gap-2 mx-4 mt-3 px-3 py-2 rounded border border-red-400/30 bg-red-400/5 text-red-400 font-mono text-sm">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
      {regenError && (
        <div className="flex items-center gap-2 mx-4 mt-2 px-3 py-2 rounded border border-amber-400/30 bg-amber-400/5 text-amber-400 font-mono text-sm">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          Ricalcolo fallito: {regenError}
        </div>
      )}

      {!loading && initialLoadDone && !generating && !hasData && !error && !agentDictionaryContext && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-emerald-400/50">
          <Bot className="w-10 h-10" />
          <p className="font-mono text-sm text-center px-8 text-emerald-300/70">
            {externalToolbar
              ? 'Configura il dizionario in Ontologia o Dizionari, poi apri di nuovo questo tab.'
              : documentText
                ? 'Premi "Genera tassonomia" per estrarre la struttura dal documento.'
                : 'Caricamento documento in corso…'}
          </p>
        </div>
      )}

      {!loading && initialLoadDone && !hasData && !error && agentDictionaryContext && !generating && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 px-8 text-amber-300/80">
          <p className="font-mono text-sm text-center">
            Dizionario pronto ma l&apos;albero non è stato montato. Controlla che le descrizioni siano segmentate.
          </p>
        </div>
      )}

      {!loading && initialLoadDone && hasData && (!generating || generatingPhase === 'messages' || generatingPhase === 'grammars') && (
        <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
          {isDialogueGenerating && !showAgentTaxonomyLayout && (
            <DialogueGenerationOverlay progress={agentGenProgress} />
          )}
          {externalToolbar && hasData && hasMessages && (
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
          <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
          {showAgentTaxonomyLayout ? (
            <div
              ref={taxonomySplitRef}
              className={`flex flex-1 min-h-0 min-w-0 overflow-hidden ${taxonomyResizing ? 'select-none' : ''}`}
            >
              <div
                className="flex-shrink-0 min-h-0 overflow-hidden"
                style={{ width: taxonomyTreeWidth }}
              >
                <SplitAgentTable
                  treeOnly
                  treeColumnWidth={taxonomyTreeWidth}
                  onTreeColumnWidthChange={setTaxonomyTreeWidth}
                  rows={rows}
                  showOnlyMessageNodes={showOnlyMessageNodes}
                  noMatchColumns={noMatchColumns}
                  selectedSlot={selectedSlot}
                  onSelectSlot={handleSelectSlot}
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
                  onAnswerGrammarTooltipShow={showAnswerGrammarTooltip}
                  onAnswerGrammarTooltipHide={hideAnswerGrammarTooltip}
                  pathOrderingCategories={pathOrderingCategories}
                />
              </div>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-valuenow={taxonomyTreeWidth}
                onPointerDown={onTaxonomySashPointerDown}
                className="w-1 flex-shrink-0 cursor-col-resize bg-[#1a3a2a] hover:bg-emerald-400/45 transition-colors"
              />
              <AgentDialoguePrompt
                onGenerate={handleGenerateDialogueMessages}
                generating={isDialogueGenerating}
                disabled={!canGenerateDialogue}
                progress={agentGenProgress}
              />
            </div>
          ) : (
          <>
          <div className="flex-1 min-h-0 overflow-hidden">
            {externalToolbar ? (
              <SplitAgentTable
                rows={rows}
                showOnlyMessageNodes={showOnlyMessageNodes}
                noMatchColumns={noMatchColumns}
                selectedSlot={selectedSlot}
                onSelectSlot={handleSelectSlot}
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
                onAnswerGrammarTooltipShow={showAnswerGrammarTooltip}
                onAnswerGrammarTooltipHide={hideAnswerGrammarTooltip}
                pathOrderingCategories={pathOrderingCategories}
              />
            ) : viewMode === 'tree' ? (
              <TreeTable
                rows={rows}
                showOnlyMessageNodes={showOnlyMessageNodes}
                noMatchColumns={noMatchColumns}
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
                onAnswerGrammarTooltipShow={showAnswerGrammarTooltip}
                onAnswerGrammarTooltipHide={hideAnswerGrammarTooltip}
                pathOrderingCategories={pathOrderingCategories}
              />
            ) : (
              <FlatTable
                rows={rows}
                showOnlyMessageNodes={showOnlyMessageNodes}
                noMatchColumns={noMatchColumns}
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
                pathOrderingCategories={pathOrderingCategories}
              />
            )}
          </div>
          {testOpen && (
            <ChatPanel
              agentBundle={testAgentBundle}
              onClose={() => setTestOpen(false)}
            />
          )}
          </>
          )}
          </div>
        </div>
      )}

      {grammarTooltip && grammarTooltipPanels.length > 0 && (
        <AnswerGrammarSynonymTooltip
          panels={grammarTooltipPanels}
          anchor={grammarTooltip.anchor}
        />
      )}

      {grammarEditTarget?.mode === 'answer' && grammarEditRow && (
        <AnswerGrammarModal
          slot={grammarEditTarget.slot}
          slots={rows.map((r) => r.slot_filling)}
          itemPaths={itemPaths}
          grammar={grammarEditRow.answer_grammar}
          question={grammarEditRow.question}
          categories={pathOrderingCategories.length > 0 ? pathOrderingCategories : undefined}
          onSave={(grammar) => handleGrammarSaveForSlot(grammarEditTarget.slot, 'answer', grammar)}
          onClose={closeGrammarEdit}
        />
      )}

      {convaiOpen && convaiExportContext?.dictionary && (
        <ConvaiExportPanel
          documentId={doc.id}
          documentName={doc.name}
          dictionary={convaiExportContext.dictionary}
          descriptions={convaiExportContext.descriptions}
          analysis={analysis}
          loadedRefs={convaiExportContext.loadedRefs}
          dictionaryDirty={convaiExportContext.dictionaryDirty}
          analysisDirty={analysisDirty}
          pathsOutOfSync={convaiExportContext.pathsOutOfSync}
          onClose={() => setConvaiOpen(false)}
        />
      )}

      {convaiNoBeOpen && convaiExportContext?.dictionary && (
        <ConvaiNoBeExportPanel
          documentId={doc.id}
          documentName={doc.name}
          dictionary={convaiExportContext.dictionary}
          descriptions={convaiExportContext.descriptions}
          analysis={analysis}
          loadedRefs={convaiExportContext.loadedRefs}
          dictionaryDirty={convaiExportContext.dictionaryDirty}
          analysisDirty={analysisDirty}
          pathsOutOfSync={convaiExportContext.pathsOutOfSync}
          onClose={() => setConvaiNoBeOpen(false)}
        />
      )}
    </div>
  );
}
