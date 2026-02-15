import type { ViewState } from './types'

interface BreadcrumbsProps {
  breadcrumbs: string[]
  onNavigate: (viewState: ViewState, breadcrumbIndex: number) => void
}

export function Breadcrumbs({ breadcrumbs, onNavigate }: BreadcrumbsProps) {
  if (breadcrumbs.length === 0) return null

  return (
    <nav className="agent-instructions-breadcrumbs" aria-label="Breadcrumb">
      {breadcrumbs.map((crumb, idx) => (
        <span key={idx}>
          {idx > 0 && <span className="breadcrumb-separator"> / </span>}
          <button
            type="button"
            className="breadcrumb-link"
            onClick={() => {
              if (idx === 0) {
                onNavigate('agents', 0)
              } else if (idx === 1) {
                onNavigate('agent-instructions', 1)
              }
            }}
          >
            {crumb}
          </button>
        </span>
      ))}
    </nav>
  )
}
