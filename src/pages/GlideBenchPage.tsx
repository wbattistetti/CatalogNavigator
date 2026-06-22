/**
 * Dev-only Glide scroll benchmark: CSV → precalculated chips → grid (no live segmentation).
 */
import { useEffect, useState } from 'react';
import { parseTabularText } from '../lib/parseTabular';
import { buildGlideBenchScrollRows } from './glideBench/buildGlideBenchScrollRows';
import { GlideBenchSegmentGrid } from './glideBench/GlideBenchSegmentGrid';
import type { GlideBenchRow } from './glideBench/glideBenchTypes';

const BENCH_CSV_URL = '/benchmark/FRM_VET_2_90_20260615.csv';

type LoadPhase = 'loading' | 'ready' | 'error';

interface BenchMeta {
  fetchMs: number | null;
  parseMs: number | null;
  buildMs: number | null;
  error: string | null;
}

interface ScrollRange {
  firstRow: number;
  lastRow: number;
}

export function GlideBenchPage() {
  const [phase, setPhase] = useState<LoadPhase>('loading');
  const [loadingLabel, setLoadingLabel] = useState('Download CSV…');
  const [meta, setMeta] = useState<BenchMeta>({
    fetchMs: null,
    parseMs: null,
    buildMs: null,
    error: null,
  });
  const [benchRows, setBenchRows] = useState<GlideBenchRow[]>([]);
  const [scrollRange, setScrollRange] = useState<ScrollRange | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadingLabel('Download CSV…');
      const fetchStart = performance.now();

      let response: Response;
      try {
        response = await fetch(BENCH_CSV_URL);
      } catch (err) {
        if (cancelled) return;
        setPhase('error');
        setMeta({
          fetchMs: null,
          parseMs: null,
          buildMs: null,
          error: err instanceof Error ? err.message : 'Download CSV fallito',
        });
        return;
      }

      const fetchMs = Math.round(performance.now() - fetchStart);

      if (!response.ok) {
        if (cancelled) return;
        setPhase('error');
        setMeta({
          fetchMs,
          parseMs: null,
          buildMs: null,
          error: `CSV non trovato (${response.status}). Copia FRM_VET_2_90_20260615.csv in public/benchmark/.`,
        });
        return;
      }

      setLoadingLabel('Parsing CSV…');
      const parseStart = performance.now();
      const text = await response.text();
      const parsed = parseTabularText(text);
      const parseMs = Math.round(performance.now() - parseStart);

      if (cancelled) return;

      if (!parsed) {
        setPhase('error');
        setMeta({
          fetchMs,
          parseMs,
          buildMs: null,
          error: 'CSV non valido o senza intestazioni',
        });
        return;
      }

      setLoadingLabel('Preparazione griglia…');
      const buildStart = performance.now();
      const rows = buildGlideBenchScrollRows(parsed);
      const buildMs = Math.round(performance.now() - buildStart);

      if (cancelled) return;

      setBenchRows(rows);
      setPhase('ready');
      setMeta({
        fetchMs,
        parseMs,
        buildMs,
        error: null,
      });
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase === 'loading') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 font-mono text-sm text-emerald-400/60">
        <span>{loadingLabel}</span>
        <span className="text-[10px] text-emerald-400/35">
          Scroll test · chip precalcolati · nessuna segmentazione live
        </span>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 px-6 font-mono text-sm text-red-400">
        <p>{meta.error ?? 'Errore sconosciuto'}</p>
        {meta.fetchMs !== null && (
          <p className="text-emerald-400/50">fetch {meta.fetchMs} ms</p>
        )}
      </div>
    );
  }

  const { fetchMs, parseMs, buildMs } = meta;
  const totalMs = (fetchMs ?? 0) + (parseMs ?? 0) + (buildMs ?? 0);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0a1510]">
      <div className="flex-shrink-0 border-b border-[#1a3a2a] px-3 py-1.5 font-mono text-[10px] text-emerald-400/60">
        Glide scroll test · {benchRows.length.toLocaleString('it-IT')} righe · chip precalcolati (colonne CSV)
        {fetchMs !== null && ` · fetch ${fetchMs} ms`}
        {parseMs !== null && ` · parse ${parseMs} ms`}
        {buildMs !== null && ` · build ${buildMs} ms`}
        {totalMs > 0 && ` · totale ${totalMs} ms`}
        {scrollRange !== null && (
          <>
            {' · visibili '}
            {scrollRange.firstRow.toLocaleString('it-IT')}
            {'–'}
            {scrollRange.lastRow.toLocaleString('it-IT')}
          </>
        )}
        {' · click segmentazione per overlay editor'}
      </div>
      <div className="flex min-h-0 flex-1">
        <GlideBenchSegmentGrid
          rows={benchRows}
          onScrollRegion={(firstRow, lastRow) => setScrollRange({ firstRow, lastRow })}
        />
      </div>
    </div>
  );
}
