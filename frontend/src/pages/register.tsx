import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { AuthLayout } from '@/components/auth/auth-layout'
import { FormField } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'

// Mirrors the API's rules so the user hears about them before submitting.
const schema = z.object({
  name: z.string().trim().min(1, 'Informe seu nome').max(80, 'Máximo de 80 caracteres'),
  email: z.string().trim().email('Informe um e-mail válido').max(160),
  password: z
    .string()
    .min(8, 'Mínimo de 8 caracteres')
    .max(72, 'Máximo de 72 caracteres')
    .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, 'Use ao menos uma letra e um número'),
})
type FormValues = z.infer<typeof schema>

export function RegisterPage() {
  const { register: signUp } = useAuth()
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    try {
      await signUp(values.name, values.email, values.password)
      toast.success('Conta criada. Já separamos 10 categorias para você começar.')
      navigate('/', { replace: true })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Criar conta</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Leva menos de um minuto. Sem cartão, sem complicação.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 grid gap-4" noValidate>
        <FormField id="name" label="Nome" error={errors.name?.message}>
          <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...register('name')} />
        </FormField>
        <FormField id="email" label="E-mail" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            aria-invalid={!!errors.email}
            {...register('email')}
          />
        </FormField>
        <FormField
          id="password"
          label="Senha"
          error={errors.password?.message}
          hint="Ao menos 8 caracteres, com letras e números."
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
        </FormField>
        <Button type="submit" size="lg" className="mt-2" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Criar conta
        </Button>
      </form>

      <p className="mt-8 text-sm text-muted-foreground">
        Já tem conta?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </AuthLayout>
  )
}
