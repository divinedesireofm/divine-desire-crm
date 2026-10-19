import { useEffect, useRef, useState } from 'react'

// Símbolo ⓘ que muestra el significado al pasar el ratón (o al pulsar en el móvil).
// El cuadro se posiciona con «fixed» para que no lo recorte ninguna tabla con scroll.
export default function InfoTip({ texto }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)
  // En el móvil se cierra al tocar en cualquier otro sitio
  useEffect(() => {
    if (!pos) return
    const fuera = (e) => { if (!ref.current?.contains(e.target)) setPos(null) }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [pos])
  if (!texto) return null
  function abrir() {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const ancho = Math.min(300, window.innerWidth - 24)
    const left = Math.max(12, Math.min(r.left + r.width / 2 - ancho / 2, window.innerWidth - ancho - 12))
    const arriba = r.top > 170
    setPos({ left, ancho, top: arriba ? undefined : r.bottom + 8, bottom: arriba ? window.innerHeight - r.top + 8 : undefined })
  }
  const cerrar = () => setPos(null)
  return (
    <span
      ref={ref}
      className="inline-flex align-middle ml-1.5 cursor-help select-none"
      onMouseEnter={abrir} onMouseLeave={cerrar}
      onClick={(e) => { e.stopPropagation(); abrir() }}
      role="img" aria-label={texto} tabIndex={0} onFocus={abrir} onBlur={cerrar}
    >
      <span
        className="inline-flex items-center justify-center rounded-full font-semibold"
        style={{ width: 15, height: 15, fontSize: 10, lineHeight: 1, border: '1px solid var(--text-muted)', color: 'var(--text-muted)', fontStyle: 'normal' }}
      >i</span>
      {pos && (
        <span
          className="fixed z-[100] rounded-md px-3 py-2 text-xs font-normal normal-case text-left pointer-events-none"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.ancho, background: 'var(--panel-alt)', border: '1px solid var(--border)', color: 'var(--text)', boxShadow: '0 8px 24px rgba(0,0,0,.45)', lineHeight: 1.45, whiteSpace: 'normal' }}
        >
          {texto}
        </span>
      )}
    </span>
  )
}
