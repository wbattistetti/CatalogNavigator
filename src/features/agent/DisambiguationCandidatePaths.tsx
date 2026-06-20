/**
 * Collapsible list of catalog paths involved in a disambiguation step.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const META_TEXT = 'font-mono text-sm leading-relaxed';

function sortPaths(paths: string[]): string[] {
  return [...paths].sort((a, b) => a.localeCompare(b, 'it'));
}

export function DisambiguationCandidatePaths({
  paths,
  defaultOpen = false,
  label = 'Path in gioco',
}: {
  paths: string[];
  defaultOpen?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const sorted = sortPaths(paths.filter((p) => p.trim()));

  if (sorted.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 ${META_TEXT} text-emerald-300/80 hover:text-emerald-200 w-full text-left`}
        aria-expanded={open}
      >
        <ChevronDown
          className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        {label} ({sorted.length})
      </button>
      {open && (
        <ul className={`mt-1 max-h-36 overflow-y-auto space-y-0.5 ${META_TEXT} text-emerald-200/85 list-disc pl-[18px]`}>
          {sorted.map((path) => (
            <li key={path} className="break-all">{path}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
