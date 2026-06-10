/**
 * Renders a dictionary's Lucide icon with glossy console accent styling.
 */
import {
  BookOpen, Stethoscope, Landmark, ShoppingCart, Factory, Building2, Cpu, GraduationCap,
  type LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  BookOpen,
  Stethoscope,
  Landmark,
  ShoppingCart,
  Factory,
  Building2,
  Cpu,
  GraduationCap,
};

export interface DictionaryIconProps {
  iconKey: string;
  iconColor: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  title?: string;
}

const SIZE_CLASS = {
  xs: 'w-2.5 h-2.5',
  sm: 'w-3 h-3',
  md: 'w-3.5 h-3.5',
} as const;

export function DictionaryIcon({
  iconKey,
  iconColor,
  size = 'sm',
  className = '',
  title,
}: DictionaryIconProps) {
  const Icon = ICON_MAP[iconKey] ?? BookOpen;
  const dim = SIZE_CLASS[size];

  return (
    <span
      className={`inline-flex items-center justify-center flex-shrink-0 rounded-sm ${className}`}
      style={{
        color: iconColor,
        filter: `drop-shadow(0 0 4px ${iconColor}66)`,
      }}
      title={title}
    >
      <Icon className={dim} strokeWidth={2.25} />
    </span>
  );
}
