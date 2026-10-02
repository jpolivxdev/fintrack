import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { AuthLayout } from '@/components/auth/auth-layout'
import { FormField } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, errorMessage } from '@/lib/api'
import { DEMO_CREDENTIALS, useAuth } from '@/lib/auth'

const schema = z.object({
  email: z.string().trim().email('Informe um e-mail válido'),
  password: z.string().min(1, 'Informe sua senha'),
})
type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [demoLoading, setDemoLoading] = useState(false)
  // The link only shows when the server can actually send the e-mail.
  const { data: capabilities } = useQuery({
    queryKey: ['auth-capabilities'],
    queryFn: async () => (await api.get<{ passwordReset: boolean }>('/auth/capabilities')).data,
    staleTime: Infinity,
    retry: false,
  })
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function signIn(values: FormValues) {
    try {
      await login(values.email, values.password)
      navigate(from, { replace: true })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function signInDemo() {
    setDemoLoading(true)
    await signIn(DEMO_CREDENTIALS)
    setDemoLoading(false)
  }

  const busy = isSubmitting || demoLoading

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Entrar</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Bem-vindo de volta. Continue de onde parou.</p>

      <form onSubmit={handleSubmit(signIn)} className="mt-8 grid gap-4" noValidate>
        <FormField id="email" label="E-mail" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
          />
        </FormField>
        <FormField
          id="password"
          label="Senha"
          error={errors.password?.message}
          hint={
            capabilities?.passwordReset ? (
              <Link to="/esqueci-senha" className="font-medium text-primary-text hover:underline">
                Esqueci minha senha
              </Link>
            ) : undefined
          }
        >
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
          />
        </FormField>
        <Button type="submit" size="lg" className="mt-2" disabled={busy}>
          {isSubmitting && !demoLoading && <Loader2 className="size-4 animate-spin" />}
          Entrar
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        ou
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button variant="outline" size="lg" onClick={signInDemo} disabled={busy}>
        {demoLoading && <Loader2 className="size-4 animate-spin" />}
        Explorar com a conta demo
      </Button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        7 meses de dados de exemplo, restaurados a cada reinício do servidor.
      </p>

      <p className="mt-8 text-sm text-muted-foreground">
        Ainda não tem conta?{' '}
        <Link to="/cadastro" className="font-medium text-primary-text hover:underline">
          Criar conta
        </Link>
      </p>
    </AuthLayout>
  )
}
