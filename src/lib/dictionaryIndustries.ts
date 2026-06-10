/**
 * Industry presets and default Lucide icon accents for dictionary metadata.
 */

export interface IndustryOption {
  id: string;
  label: string;
}

export const DICTIONARY_INDUSTRIES: IndustryOption[] = [
  { id: 'healthcare', label: 'Sanità' },
  { id: 'finance', label: 'Finanza' },
  { id: 'retail', label: 'Retail' },
  { id: 'manufacturing', label: 'Manifattura' },
  { id: 'public_sector', label: 'Pubblica amministrazione' },
  { id: 'technology', label: 'Tecnologia' },
  { id: 'education', label: 'Istruzione' },
  { id: 'other', label: 'Altro' },
];

export function industryLabel(id: string, custom: string | null | undefined): string {
  if (id === 'other' && custom?.trim()) return custom.trim();
  return DICTIONARY_INDUSTRIES.find((i) => i.id === id)?.label ?? id;
}

/** Default glossy-console icon key (Lucide component name) and accent color. */
export function defaultIconForIndustry(industry: string): { iconKey: string; iconColor: string } {
  switch (industry) {
    case 'healthcare':
      return { iconKey: 'Stethoscope', iconColor: '#38bdf8' };
    case 'finance':
      return { iconKey: 'Landmark', iconColor: '#fbbf24' };
    case 'retail':
      return { iconKey: 'ShoppingCart', iconColor: '#fb7185' };
    case 'manufacturing':
      return { iconKey: 'Factory', iconColor: '#a78bfa' };
    case 'public_sector':
      return { iconKey: 'Building2', iconColor: '#34d399' };
    case 'technology':
      return { iconKey: 'Cpu', iconColor: '#22d3ee' };
    case 'education':
      return { iconKey: 'GraduationCap', iconColor: '#fcd34d' };
    default:
      return { iconKey: 'BookOpen', iconColor: '#38bdf8' };
  }
}

export function validateDictionaryMeta(input: {
  name: string;
  industry: string;
  industryCustom?: string | null;
}): void {
  const name = input.name.trim();
  if (!name) throw new Error('Nome dizionario obbligatorio');
  if (!DICTIONARY_INDUSTRIES.some((i) => i.id === input.industry)) {
    throw new Error('Industry non valida');
  }
  if (input.industry === 'other' && !input.industryCustom?.trim()) {
    throw new Error('Specifica un\'industry custom');
  }
}
