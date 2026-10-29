import { useEffect, useRef, useState } from 'react'

// Celda de tabla de una sola línea (todas las filas miden lo mismo):
//  - el texto largo se corta con «…» y aparece «ver más» (abre una ventanita con el texto completo)
//  - siempre hay un botón para copiar el texto
// `texto` es lo que se copia / se ve completo; `children` permite mostrar otra cosa en la celda (enlace, etiqueta…).
export default function CeldaCopia({ texto, titulo, children, muted = false, vacio = '—' }) {
  const t = texto == null ? '' : String(texto)
  const refTxt = useRef(null)
  const [corta, setCorta] = useState(false)   // ¿se está cortando el texto?
  const [copiado, setCopiado] = useState(false)
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    const el = refTxt.current
    if (!el) return undefined
    const medir = () => setCorta(el.scrollWidth > el.clientWidth + 1)
    medir()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [t, children])

  async function copiar(e) {
    e?.stopPropagation()
    try { await navigator.clipboard.writeText(t) } catch {
      const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy') } catch { /* sin portapapeles */ }
      document.body.removeChild(ta)
    }
    setCopiado(true); setTimeout(() => setCopiado(false), 1200)
  }

  if (!t.trim()) return <span style={{ color: 'var(--text-muted)' }}>{vacio}</span>

  return (
    <>
      <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
        <span ref={refTxt} className="truncate" style={{ minWidth: 0, flex: '0 1 auto', color: muted ? 'var(--text-muted)' : undefined }} title={corta ? t : undefined}>{children ?? t}</span>
        {corta && <button type="button" className="text-xs underline whitespace-nowrap shrink-0" style={{ color: 'var(--accent)' }} onClick={() => setAbierto(true)}>ver más</button>}
        <button type="button" onClick={copiar} aria-label="Copiar texto" title="Copiar texto" className="shrink-0 text-xs px-1 rounded" style={{ color: copiado ? 'var(--success)' : 'var(--text-muted)', opacity: copiado ? 1 : 0.7 }}>
          {copiado ? '✓' : '⧉'}
        </button>
      </div>
      {abierto && (
        <div onClick={() => setAbierto(false)} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
          <div onClick={(e) => e.stopPropagation()} className="rounded-lg p-5 w-full" style={{ maxWidth: 520, background: 'var(--panel)', border: '1px solid var(--border)' }}>
            {titulo && <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{titulo}</p>}
            <p className="text-sm whitespace-pre-wrap break-words mb-4" style={{ maxHeight: '60vh', overflowY: 'auto' }}>{t}</p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={copiar} className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent)' }}>{copiado ? '✓ Copiado' : 'Copiar texto'}</button>
              <button type="button" onClick={() => setAbierto(false)} className="px-3 py-1.5 rounded-md text-sm" style={{ border: '1px solid var(--border)' }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
