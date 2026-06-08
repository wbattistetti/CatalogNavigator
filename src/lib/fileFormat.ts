import type { KbFileFormat } from './supabase';

export function detectFileFormat(file: File): KbFileFormat {
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();

  if (name.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
  if (name.endsWith('.docx') || mime.includes('wordprocessingml')) return 'docx';
  if (name.endsWith('.xlsx') || mime.includes('spreadsheetml')) return 'xlsx';
  if (name.endsWith('.csv') || mime === 'text/csv') return 'csv';
  if (name.endsWith('.json') || mime === 'application/json') return 'json';
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'md';
  if (mime.startsWith('image/')) return 'image';
  return 'txt';
}

export function isBinaryFormat(format: KbFileFormat): boolean {
  return format === 'pdf' || format === 'docx' || format === 'image';
}

export function isTabularFormat(format: KbFileFormat): boolean {
  return format === 'xlsx' || format === 'csv';
}

export function formatLabel(format: KbFileFormat): string {
  const labels: Record<KbFileFormat, string> = {
    pdf: 'PDF',
    docx: 'Word',
    xlsx: 'Excel',
    csv: 'CSV',
    json: 'JSON',
    md: 'Markdown',
    txt: 'Text',
    image: 'Image',
  };
  return labels[format] ?? format.toUpperCase();
}

export function formatColor(format: KbFileFormat): string {
  const colors: Record<KbFileFormat, string> = {
    pdf: 'text-red-400 border-red-400/30 bg-red-400/10',
    docx: 'text-blue-400 border-blue-400/30 bg-blue-400/10',
    xlsx: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
    csv: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
    json: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
    md: 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10',
    txt: 'text-slate-400 border-slate-400/30 bg-slate-400/10',
    image: 'text-purple-400 border-purple-400/30 bg-purple-400/10',
  };
  return colors[format] ?? 'text-slate-400 border-slate-400/30 bg-slate-400/10';
}
