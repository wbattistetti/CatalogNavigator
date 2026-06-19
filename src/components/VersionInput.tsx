/**
 * Major.minor version fields with optional qualifier (alpha, beta, …).
 */
import type { ProjectInfo } from '../types/project';

interface VersionInputProps {
  major: number;
  minor: number;
  qualifier: string;
  onChange: (patch: Pick<ProjectInfo, 'versionMajor' | 'versionMinor' | 'versionQualifier'>) => void;
}

const QUALIFIERS = [
  { value: 'alpha', label: 'Alpha' },
  { value: 'beta', label: 'Beta' },
  { value: 'rc', label: 'RC' },
  { value: '', label: 'Release' },
];

export function VersionInput({ major, minor, qualifier, onChange }: VersionInputProps) {
  return (
    <div className="flex gap-2 items-center">
      <input
        type="number"
        min={0}
        value={major}
        onChange={(e) => onChange({ versionMajor: Number(e.target.value) || 0, versionMinor: minor, versionQualifier: qualifier })}
        className="w-16 px-2 py-2 rounded bg-[#0a1510] border border-[#c9a84c]/30 text-[#e8d48b] font-mono text-sm focus:outline-none focus:border-[#c9a84c]/60"
      />
      <span className="text-[#c9a84c]/60 font-mono">.</span>
      <input
        type="number"
        min={0}
        value={minor}
        onChange={(e) => onChange({ versionMajor: major, versionMinor: Number(e.target.value) || 0, versionQualifier: qualifier })}
        className="w-16 px-2 py-2 rounded bg-[#0a1510] border border-[#c9a84c]/30 text-[#e8d48b] font-mono text-sm focus:outline-none focus:border-[#c9a84c]/60"
      />
      <select
        value={qualifier}
        onChange={(e) => onChange({ versionMajor: major, versionMinor: minor, versionQualifier: e.target.value })}
        className="flex-1 min-w-0 px-2 py-2 rounded bg-[#0a1510] border border-[#c9a84c]/30 text-[#e8d48b] font-mono text-sm focus:outline-none focus:border-[#c9a84c]/60"
      >
        {QUALIFIERS.map((q) => (
          <option key={q.value || 'release'} value={q.value}>{q.label}</option>
        ))}
      </select>
    </div>
  );
}
