/**
 * Floating panel for expanded tabular cell text (double-click) — selectable for Ctrl+A / Ctrl+C.
 * Rendered in #portal with fixed positioning so parent overflow-hidden does not clip it.
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { estimateTabularExpandEditorSize } from './tabularExpandCellLayout';

export interface TabularCellExpandAnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TabularCellExpandPopoverProps {
  value: string;
  columnWidthPx: number;
  anchorRect: TabularCellExpandAnchorRect;
  onClose: () => void;
}

function resolvePortalRoot(): HTMLElement {
  return document.getElementById('portal') ?? document.body;
}

export function TabularCellExpandPopover({
  value,
  columnWidthPx,
  anchorRect,
  onClose,
}: TabularCellExpandPopoverProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { width, height } = estimateTabularExpandEditorSize(value, columnWidthPx);

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onClose]);

  const maxLeft = Math.max(8, window.innerWidth - width - 8);
  const maxTop = Math.max(8, window.innerHeight - height - 40);
  const left = Math.min(Math.max(8, anchorRect.x), maxLeft);
  const top = Math.min(Math.max(8, anchorRect.y), maxTop);

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[9999] rounded border border-emerald-400/40 bg-[#0a1510] shadow-2xl overflow-hidden pointer-events-auto"
      style={{
        top,
        left,
        width,
        maxWidth: 'min(720px, 92vw)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <textarea
        ref={textareaRef}
        readOnly
        value={value}
        aria-label="Contenuto cella — seleziona e copia"
        className="block w-full resize-none bg-[#0d0d0d] px-2 py-2 font-mono text-xs leading-[18px] text-emerald-100/95 border-0 outline-none whitespace-pre-wrap break-words selection:bg-emerald-400/25"
        style={{ height, minHeight: height }}
      />
      <p className="px-2 py-1 border-t border-[#1a3a2a] font-mono text-[10px] text-emerald-400/45">
        Ctrl+A · Ctrl+C · Esc chiudi
      </p>
    </div>,
    resolvePortalRoot(),
  );
}
