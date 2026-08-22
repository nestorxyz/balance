import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'

export const Route = createFileRoute('/auth/callback')({
  validateSearch: (search: Record<string, unknown>) => ({
    next: search.next === '/reset-password' ? '/reset-password' as const : '/' as const,
  }),
  component: AuthCallbackPage,
})

function AuthCallbackPage() {
  const { user, loading } = useAuth()
  const { next } = Route.useSearch()
  const navigate = useNavigate()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (!loading && user) {
      void navigate({ to: next })
    }
  }, [loading, navigate, next, user])

  useEffect(() => {
    const timeout = window.setTimeout(() => setTimedOut(true), 8_000)
    return () => window.clearTimeout(timeout)
  }, [])

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-3 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Verificando enlace</h1>
        <p className="text-sm text-muted-foreground">
          {timedOut
            ? 'El enlace no pudo crear una sesion. Solicita uno nuevo y abrelo en este mismo navegador.'
            : 'Estamos recuperando tu sesion de forma segura...'}
        </p>
      </div>
    </div>
  )
}
