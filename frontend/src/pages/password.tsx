import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Eye, EyeOff, Loader2, MailCheck } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { AuthLayout } from '@/components/auth/auth-layout'
import { FormField } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, errorMessage } from '@/lib/api'

const ease = [0.16, 1, 0.3, 1] as const

const forgotSchema = z.object({ email: z.string().trim().email('Informe um e-mail válido') })

/** Step 1: ask for the link. Same answer whether the account exists or not. */
export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema) })

  async function onSubmit(v: z.infer<typeof forgotSchema>) {
    try {
      await api.post('/auth/forgot-password', { email: v.email })
      setSentTo(v.email.trim())
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <AuthLayout>
      {sentTo ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }} className="grid gap-4">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary-text">
            <MailCheck className="size-6" />
          </span>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Confira seu e-mail</h1>
          <p className="text-sm text-muted-foreground">
            Se <strong className="text-foreground">{sentTo}</strong> tiver conta no FinTrack, um link para criar uma nova senha chega em instantes. Ele vale por 30
            minutos e funciona uma vez.
          </p>
          <p className="text-sm text-muted-foreground">Não chegou? Veja o spam ou peça de novo daqui a pouco.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setSentTo(null)}>
              Pedir de novo
            </Button>
            <Button asChild variant="ghost">
              <Link to="/login">Voltar para o login</Link>
            </Button>
          </div>
        </motion.div>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Esqueceu a senha?</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Acontece. Informe seu e-mail e mandamos um link para criar uma nova.</p>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 grid gap-4" noValidate>
            <FormField id="forgot-email" label="E-mail" error={errors.email?.message}>
              <Input
                id="forgot-email"
                type="email"
                autoComplete="email"
                placeholder="voce@exemplo.com"
                aria-invalid={!!errors.email}
                {...register('email')}
              />
            </FormField>
            <Button type="submit" size="lg" className="mt-2" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Enviar link
            </Button>
          </form>
          <p className="mt-8 text-sm text-muted-foreground">
            Lembrou?{' '}
            <Link to="/login" className="font-medium text-primary-text hover:underline">
              Voltar para o login
            </Link>
          </p>
        </>
      )}
    </AuthLayout>
  )
}

const resetSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Use pelo menos 8 caracteres')
      .max(72, 'Use no máximo 72 caracteres')
      .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, 'Use letras e números'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'As senhas não são iguais' })

/** Step 2: the e-mailed link lands here with #token=... (never sent to any server log). */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '')
  const [show, setShow] = useState(false)
  const [done, setDone] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) })

  async function onSubmit(v: z.infer<typeof resetSchema>) {
    try {
      await api.post('/auth/reset-password', { token, password: v.password })
      // Drop the token from the address bar and history.
      window.history.replaceState(null, '', window.location.pathname)
      setDone(true)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return (
      <AuthLayout>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Link inválido</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Esse link está incompleto ou já foi usado. Peça um novo, leva um minuto.</p>
        <Button asChild size="lg" className="mt-8">
          <Link to="/esqueci-senha">Pedir novo link</Link>
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      {done ? (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease }} className="grid gap-4">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-income/15 text-income">
            <CheckCircle2 className="size-6" />
          </span>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Senha nova, tudo certo</h1>
          <p className="text-sm text-muted-foreground">Por segurança, saímos de todos os aparelhos. Entre de novo com a senha nova.</p>
          <Button size="lg" className="mt-2" onClick={() => navigate('/login', { replace: true })}>
            Entrar
          </Button>
        </motion.div>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Crie uma nova senha</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Pelo menos 8 caracteres, com letras e números.</p>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 grid gap-4" noValidate>
            <FormField id="new-password" label="Nova senha" error={errors.password?.message}>
              <div className="relative">
                <Input
                  id="new-password"
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="pr-11"
                  aria-invalid={!!errors.password}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label={show ? 'Esconder senha' : 'Mostrar senha'}
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </FormField>
            <FormField id="confirm-password" label="Repita a senha" error={errors.confirm?.message}>
              <Input id="confirm-password" type={show ? 'text' : 'password'} autoComplete="new-password" aria-invalid={!!errors.confirm} {...register('confirm')} />
            </FormField>
            <Button type="submit" size="lg" className="mt-2" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Salvar nova senha
            </Button>
          </form>
        </>
      )}
    </AuthLayout>
  )
}
