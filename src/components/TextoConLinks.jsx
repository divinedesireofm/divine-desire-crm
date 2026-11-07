import { Fragment } from 'react'

// Detecta enlaces (https://…, http://… o www.…) dentro de un texto
const RE = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi
const limpiarFinal = (u) => u.replace(/[).,;:!?»\]]+$/, '') // quita puntuación pegada al final
const aHref = (u) => (/^https?:\/\//i.test(u) ? u : 'https://' + u)

export function extraerLinks(texto) {
  return [...new Set((String(texto || '').match(RE) || []).map(limpiarFinal))]
}

// Texto normal donde los enlaces son clicables (se abren en otra pestaña)
export default function TextoConLinks({ texto }) {
  const partes = String(texto || '').split(RE)
  return partes.map((p, i) => {
    if (i % 2 === 0) return <Fragment key={i}>{p}</Fragment>
    const url = limpiarFinal(p)
    const resto = p.slice(url.length)
    return (
      <Fragment key={i}>
        <a href={aHref(url)} target="_blank" rel="noopener noreferrer" className="underline break-all" style={{ color: 'var(--accent)' }} onClick={(e) => e.stopPropagation()}>{url}</a>{resto}
      </Fragment>
    )
  })
}

// Bajo un campo de edición: enlaces detectados en el texto, para poder abrirlos y probarlos
export function EnlacesDetectados({ texto }) {
  const links = extraerLinks(texto)
  if (!links.length) return null
  return (
    <p className="text-xs mt-1 flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: 'var(--text-muted)' }}>
      {links.map((u) => <a key={u} href={aHref(u)} target="_blank" rel="noopener noreferrer" className="underline break-all" style={{ color: 'var(--accent)' }}>↗ {u.length > 48 ? u.slice(0, 45) + '…' : u}</a>)}
    </p>
  )
}
