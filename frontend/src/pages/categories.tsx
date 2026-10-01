import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { CATEGORY_COLORS, CATEGORY_ICONS, CategoryIcon } from '@/components/category-icon'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { FormField } from '@/components/form-field'
import { SegmentedControl } from '@/components/segmented-control'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useCategories, useDeleteCategory, useSaveCategory } from '@/hooks/queries'
import { errorMessage } from '@/lib/api'
import type { Category, TransactionType } from '@/lib/types'
import { cn } from '@/lib/utils'

export function CategoriesPage() {
  const { data: categories = [], isLoading } = useCategories()
  const remove = useDeleteCategory()
  const [dialog, setDialog] = useState<{ open: boolean; editing?: Category; type: TransactionType }>({ open: false, type: 'EXPENSE' })
  const [toDelete, setToDelete] = useState<Category | null>(null)

  async function confirmDelete() {
    if (!toDelete) return
    try {
      await remove.mutateAsync(toDelete.id)
      toast.success('Categoria excluída.')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setToDelete(null)
    }
  }

  const groups: Array<{ type: TransactionType; title: string }> = [
    { type: 'EXPENSE', title: 'Despesas' },
    { type: 'INCOME', title: 'Receitas' },
  ]

  return (
    <div className="grid min-w-0 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Categorias</h1>
          <p className="mt-1 text-sm text-muted-foreground">Organize suas transações do seu jeito.</p>
        </div>
        <Button onClick={() => setDialog({ open: true, type: 'EXPENSE' })}>
          <Plus className="size-4" /> Nova categoria
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {groups.map((group) => {
          const items = categories.filter((c) => c.type === group.type)
          return (
            <section key={group.type} className="min-w-0 rounded-2xl border bg-card">
              <header className="flex items-center justify-between border-b px-5 py-4">
                <h2 className="font-semibold">
                  {group.title} <span className="font-normal text-muted-foreground tabular">· {items.length}</span>
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setDialog({ open: true, type: group.type })}>
                  <Plus className="size-4" /> Adicionar
                </Button>
              </header>
              {isLoading ? (
                <div className="grid gap-3 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : items.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">Nenhuma categoria de {group.title.toLowerCase()}.</p>
              ) : (
                <ul className="divide-y">
                  {items.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                      <CategoryIcon icon={c.icon} color={c.color} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground tabular">
                          {c.transactionCount === 0 ? 'Sem transações' : `${c.transactionCount} transação(ões)`}
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Ações para ${c.name}`}>
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setDialog({ open: true, editing: c, type: c.type })}>
                            <Pencil className="size-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={c.transactionCount > 0}
                            onSelect={() => setToDelete(c)}
                            title={c.transactionCount > 0 ? 'Mova ou exclua as transações antes' : undefined}
                          >
                            <Trash2 className="size-4" />
                            {c.transactionCount > 0 ? 'Excluir (tem transações)' : 'Excluir'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}>
        <DialogContent className="sm:max-w-md">
          {dialog.open && (
            <CategoryForm editing={dialog.editing} initialType={dialog.type} onDone={() => setDialog((d) => ({ ...d, open: false }))} />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Excluir categoria?"
        description={toDelete ? `"${toDelete.name}" e seus orçamentos serão removidos.` : ''}
        confirmLabel="Excluir"
        onConfirm={confirmDelete}
      />
    </div>
  )
}

const schema = z.object({
  name: z.string().trim().min(1, 'Dê um nome à categoria').max(50, 'Máximo de 50 caracteres'),
  type: z.enum(['EXPENSE', 'INCOME']),
  color: z.string(),
  icon: z.string(),
})
type Values = z.infer<typeof schema>

function CategoryForm({ editing, initialType, onDone }: { editing?: Category; initialType: TransactionType; onDone: () => void }) {
  const save = useSaveCategory()
  const typeLocked = !!editing && editing.transactionCount > 0
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: editing?.name ?? '',
      type: editing?.type ?? initialType,
      color: editing?.color ?? CATEGORY_COLORS[0],
      icon: editing?.icon ?? 'shopping-cart',
    },
  })
  const [color, icon, name] = watch(['color', 'icon', 'name'])

  async function onSubmit(values: Values) {
    try {
      await save.mutateAsync({
        id: editing?.id,
        input: typeLocked ? { name: values.name, color: values.color, icon: values.icon } : values,
      })
      toast.success(editing ? 'Categoria atualizada.' : 'Categoria criada.')
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{editing ? 'Editar categoria' : 'Nova categoria'}</DialogTitle>
        <DialogDescription className="flex items-center gap-2">
          <CategoryIcon icon={icon} color={color} size="sm" />
          {name.trim() || 'Pré-visualização'}
        </DialogDescription>
      </DialogHeader>

      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <div className="grid gap-1.5">
            <SegmentedControl
              ariaLabel="Tipo da categoria"
              value={field.value}
              onChange={(v) => !typeLocked && field.onChange(v)}
              options={[
                { value: 'EXPENSE', label: 'Despesa' },
                { value: 'INCOME', label: 'Receita' },
              ]}
            />
            {typeLocked && <p className="text-xs text-muted-foreground">O tipo não pode mudar porque a categoria já tem transações.</p>}
          </div>
        )}
      />

      <FormField id="cat-name" label="Nome" error={errors.name?.message}>
        <Input id="cat-name" autoFocus maxLength={50} {...register('name')} />
      </FormField>

      <Controller
        control={control}
        name="color"
        render={({ field }) => (
          <fieldset className="grid gap-2">
            <Label asChild><legend>Cor</legend></Label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => field.onChange(c)}
                  aria-label={`Cor ${c}`}
                  aria-pressed={field.value === c}
                  className="flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110 aria-pressed:ring-2 aria-pressed:ring-ring"
                  style={{ backgroundColor: c }}
                >
                  {field.value === c && <Check className="size-3.5 text-white" />}
                </button>
              ))}
            </div>
          </fieldset>
        )}
      />

      <Controller
        control={control}
        name="icon"
        render={({ field }) => (
          <fieldset className="grid gap-2">
            <Label asChild><legend>Ícone</legend></Label>
            <div className="grid grid-cols-9 gap-1.5">
              {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => field.onChange(key)}
                  aria-label={`Ícone ${key}`}
                  aria-pressed={field.value === key}
                  className={cn(
                    'flex aspect-square items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    field.value === key && 'bg-accent text-foreground ring-1 ring-ring',
                  )}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
          </fieldset>
        )}
      />

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Salvar
        </Button>
      </DialogFooter>
    </form>
  )
}
