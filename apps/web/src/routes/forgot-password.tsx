import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await requestPasswordReset(email)
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el correo de recuperacion')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Recuperar acceso</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Te enviaremos un enlace para definir una password nueva.
          </p>
        </div>

        <div className="rounded-md border border-border bg-card p-5">
          {submitted ? (
            <p className="text-sm text-muted-foreground">
              Si el correo pertenece a una cuenta, recibiras las instrucciones en breve.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm text-muted-foreground">Email</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-sm border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-2 focus:ring-ring/20 focus:outline-none"
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Enviando...' : 'Enviar enlace'}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-sm">
          <Link to="/login" className="text-foreground underline underline-offset-4 hover:text-foreground/80">
            Volver al login
          </Link>
        </p>
      </div>
    </div>
  )
}
