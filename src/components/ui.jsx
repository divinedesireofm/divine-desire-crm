export function Panel({ children, className = '', style = {} }) {
  return (
    <div
      className={`rounded-lg border animate-in ${className}`}
      style={{ background: 'var(--panel)', borderColor: 'var(--border)', ...style }}
    >
      {children}
    </div>
  )
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: { background: 'var(--accent)', color: '#0B1020' },
    ghost: { background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)' },
    danger: { background: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)' },
  }
  return (
    <button
      className={`px-4 py-2 rounded-md text-sm font-medium transition-opacity hover:opacity-85 disabled:opacity-40 ${className}`}
      style={styles[variant]}
      {...props}
    >
      {children}
    </button>
  )
}

const STATUS_COLORS = {
  activa: 'var(--success)',
  firmado: 'var(--success)',
  pausada: 'var(--gold)',
  en_negociacion: 'var(--gold)',
  en_preparacion: 'var(--accent)',
  negociando: 'var(--gold)',
  contactado: 'var(--gold)',
  en_conversacion: 'var(--gold)',
  calentando: 'var(--accent)',
  nuevo: 'var(--accent)',
  en_revision: 'var(--danger)',
  suspendida: 'var(--danger)',
  baneada: 'var(--danger)',
  baja: 'var(--danger)',
  descartado: 'var(--text-muted)',
}

function capitalizar(s) {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || 'var(--text-muted)'
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: `${color}22`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {capitalizar(status?.replaceAll('_', ' '))}
    </span>
  )
}

export function Input({ style, ...props }) {
  return (
    <input
      className="w-full px-3 py-2 rounded-md text-sm outline-none focus:ring-1"
      style={{
        background: 'var(--panel-alt)',
        border: '1px solid var(--border)',
        color: 'var(--text)',
        ...style,
      }}
      {...props}
    />
  )
}

export function Select({ children, ...props }) {
  return (
    <select
      className="w-full px-3 py-2 rounded-md text-sm outline-none"
      style={{
        background: 'var(--panel-alt)',
        border: '1px solid var(--border)',
        color: 'var(--text)',
      }}
      {...props}
    >
      {children}
    </select>
  )
}

export function Table({ columns, rows, renderRow }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {columns.map((col) => (
              <th
                key={col}
                className="text-left px-4 py-3 font-medium"
                style={{ color: 'var(--text-muted)' }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                Todavía no hay datos aquí.
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={row.id ?? i} style={{ borderBottom: '1px solid var(--border)' }}>
                {renderRow(row)}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export function Td({ children }) {
  return <td className="px-4 py-3 align-middle">{children}</td>
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl font-semibold font-display">{title}</h1>
        {subtitle && <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
