import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

export const Route = createFileRoute('/reset-password')({
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { user, loading, updatePassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (password !== confirmation) {
      setError('Las passwords no coinciden')
      return
    }

    setSubmitting(true)
    try {
      await updatePassword(password)
      void navigate({ to: '/' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la password')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="flex min-h-[80vh] items-center justify-center text-sm text-muted-foreground">Cargando...</div>
  }

  if (!user) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          Este enlace no contiene una sesion valida. Solicita un enlace nuevo desde el login.
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Nueva password</h1>
          <p className="mt-1 text-sm text-muted-foreground">Elige una password de al menos 8 caracteres.</p>
        </div>
        <div className="rounded-md border border-border bg-card p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm text-muted-foreground">Password nueva</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-sm border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-2 focus:ring-ring/20 focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password-confirmation" className="text-sm text-muted-foreground">Repetir password</label>
              <input
                id="password-confirmation"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="w-full rounded-sm border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-2 focus:ring-ring/20 focus:outline-none"
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Guardando...' : 'Guardar password'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
