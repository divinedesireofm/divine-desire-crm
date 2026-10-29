import { useEffect, useRef, useState } from 'react'

// Envuelve una tabla ancha y pone una barra de desplazamiento horizontal ARRIBA, sincronizada con la de abajo.
export default function ScrollSuperior({ children }) {
  const arriba = useRef(null)
  const abajo = useRef(null)
  const bloqueo = useRef(false)
  const [ancho, setAncho] = useState(0)
  const [hayScroll, setHayScroll] = useState(false)

  useEffect(() => {
    const el = abajo.current
    if (!el) return undefined
    const medir = () => { setAncho(el.scrollWidth); setHayScroll(el.scrollWidth > el.clientWidth + 1) }
    medir()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(medir)
    ro.observe(el); if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [children])

  const sync = (origen, destino) => () => {
    if (bloqueo.current) { bloqueo.current = false; return }
    if (!destino.current || destino.current.scrollLeft === origen.current.scrollLeft) return
    bloqueo.current = true
    destino.current.scrollLeft = origen.current.scrollLeft
  }

  return (
    <div>
      <div ref={arriba} onScroll={sync(arriba, abajo)} aria-label="Desplazamiento horizontal de la tabla"
        style={{ overflowX: 'auto', overflowY: 'hidden', height: hayScroll ? 16 : 0, borderBottom: hayScroll ? '1px solid var(--border)' : 'none' }}>
        <div style={{ width: ancho, height: 1 }} />
      </div>
      <div ref={abajo} onScroll={sync(abajo, arriba)} className="overflow-x-auto">{children}</div>
    </div>
  )
}
