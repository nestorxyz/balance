import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/signup')({
  component: SignupPage,
})

function SignupPage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Balance</h1>
        <div className="space-y-3 rounded-md border border-border bg-card p-5">
          <h2 className="font-semibold">Registro cerrado</h2>
          <p className="text-sm text-muted-foreground">
            Esta es una instancia privada y no acepta cuentas nuevas.
          </p>
        </div>
        <Link to="/login" className="text-sm text-foreground underline underline-offset-4 hover:text-foreground/80">
          Volver al login
        </Link>
      </div>
    </div>
  )
}
