import { useFotosModelos } from '../lib/modelPhotos'

// Círculo con la foto de la modelo; si no tiene, muestra su inicial.
export function ModelAvatar({ name, url, size = 22 }) {
  const fotos = useFotosModelos()
  const src = url !== undefined ? url : fotos[name]
  const base = { width: size, height: size, minWidth: size, borderRadius: '50%', flexShrink: 0 }
  if (src) return <img src={src} alt={name || ''} loading="lazy" style={{ ...base, objectFit: 'cover', border: '1px solid var(--border)' }} />
  return (
    <span aria-hidden="true" style={{ ...base, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: Math.max(10, Math.round(size * 0.45)), fontWeight: 600 }}>
      {(name || '?').trim().charAt(0).toUpperCase()}
    </span>
  )
}

// Foto pequeña + nombre, en línea. Úsalo donde antes se escribía solo el nombre.
export default function ModelName({ name, size = 20, className = '', style, children }) {
  if (!name) return <span className={className} style={style}>{children ?? '—'}</span>
  return (
    <span className={`inline-flex items-center gap-1.5 align-middle ${className}`} style={style}>
      <ModelAvatar name={name} size={size} />
      <span>{children ?? name}</span>
    </span>
  )
}
