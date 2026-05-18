import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground">404</h1>
        <p className="mt-2 text-lg text-muted-foreground">Page not found</p>
        <Link
          to="/operator"
          className="mt-4 inline-block rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Back to Operator Dashboard
        </Link>
      </div>
    </div>
  )
}
