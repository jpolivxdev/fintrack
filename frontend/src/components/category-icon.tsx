import {
  Baby,
  Banknote,
  Briefcase,
  Bus,
  Car,
  CircleDollarSign,
  Coffee,
  Dumbbell,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  PawPrint,
  Plane,
  Receipt,
  Repeat,
  Shirt,
  ShoppingCart,
  Smartphone,
  Tag,
  TrendingUp,
  Utensils,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/** Curated set (keeps the bundle small); keys are the names the API stores. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  laptop: Laptop,
  'trending-up': TrendingUp,
  banknote: Banknote,
  landmark: Landmark,
  'circle-dollar-sign': CircleDollarSign,
  gift: Gift,
  home: House,
  utensils: Utensils,
  'shopping-cart': ShoppingCart,
  coffee: Coffee,
  car: Car,
  fuel: Fuel,
  bus: Bus,
  plane: Plane,
  'heart-pulse': HeartPulse,
  dumbbell: Dumbbell,
  'gamepad-2': Gamepad2,
  film: Film,
  'graduation-cap': GraduationCap,
  repeat: Repeat,
  smartphone: Smartphone,
  zap: Zap,
  receipt: Receipt,
  shirt: Shirt,
  'paw-print': PawPrint,
  baby: Baby,
}

export const CATEGORY_COLORS = [
  '#8b5cf6', '#6366f1', '#3b82f6', '#06b6d4', '#14b8a6', '#22c55e',
  '#eab308', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#64748b',
]

export function CategoryIcon({
  icon,
  color,
  className,
  size = 'md',
}: {
  icon: string | null
  color: string | null
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const Icon = (icon && CATEGORY_ICONS[icon]) || Tag
  const tint = color ?? '#8b5cf6'
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg',
        size === 'sm' && 'size-7 [&_svg]:size-3.5',
        size === 'md' && 'size-9 [&_svg]:size-4',
        size === 'lg' && 'size-11 [&_svg]:size-5',
        className,
      )}
      style={{ backgroundColor: `color-mix(in oklch, ${tint} 18%, transparent)`, color: tint }}
      aria-hidden
    >
      <Icon strokeWidth={2} />
    </span>
  )
}
