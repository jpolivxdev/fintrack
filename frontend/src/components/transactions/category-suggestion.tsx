import { Sparkles } from 'lucide-react'
import { CategoryIcon } from '@/components/category-icon'
import type { CategorySuggestion } from '@/hooks/queries-ai'
import type { Category } from '@/lib/types'

/**
 * A suggestion, never a decision: the user taps to use it. The name shown
 * comes from the household's own category list, not from the AI's text.
 */
export function CategorySuggestionChip({
  suggestion,
  category,
  onAccept,
}: {
  suggestion: CategorySuggestion
  category: Pick<Category, 'name' | 'icon' | 'color'>
  onAccept: () => void
}) {
  const source = suggestion.origem === 'regra' ? 'pela descrição' : `pela IA · ${Math.round(suggestion.confianca * 100)}%`
  return (
    <button
      type="button"
      onClick={onAccept}
      className="inline-flex max-w-full items-center gap-1.5 justify-self-start rounded-full border border-dashed border-primary/50 bg-primary/5 px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-primary/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Sparkles className="size-3.5 shrink-0 text-primary" aria-hidden />
      <span className="truncate">
        Usar <CategoryIcon icon={category.icon} color={category.color} size="sm" className="mx-0.5 inline-flex size-4 rounded align-[-3px]" />
        <strong className="font-medium">{category.name}</strong>
      </span>
      <span className="shrink-0 text-muted-foreground">({source})</span>
    </button>
  )
}
