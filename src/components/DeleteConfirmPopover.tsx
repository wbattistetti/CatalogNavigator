/**
 * Inline delete confirmation popover (replaces native window.confirm).
 */
import { useEffect, useRef, type ReactNode } from 'react';

interface DeleteConfirmPopoverProps {
  message: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  confirming?: boolean;
  align?: 'left' | 'right';
}

export function DeleteConfirmPopover({
  message,
  onConfirm,
  onCancel,
  confirming = false,
  align = 'right',
}: DeleteConfirmPopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [onCancel]);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      className={`absolute z-50 top-full mt-1.5 w-56 rounded border border-[#1a3a2a] bg-[#0a1510] shadow-xl p-3 ${
        align === 'right' ? 'right-0' : 'left-0'
      }`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <p className="font-mono text-xs text-emerald-300/80 leading-relaxed mb-3">
        {message}
      </p>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={confirming}
          className="px-3 py-1 font-mono text-xs text-emerald-400/60 border border-[#1a3a2a] rounded hover:text-emerald-300/90 hover:bg-[#111] transition-colors disabled:opacity-40"
        >
          Annulla
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirming}
          className="px-3 py-1 font-mono text-xs text-white bg-red-600 border border-red-500 rounded hover:bg-red-500 transition-colors disabled:opacity-40"
        >
          {confirming ? 'Eliminazione…' : 'Conferma'}
        </button>
      </div>
    </div>
  );
}
