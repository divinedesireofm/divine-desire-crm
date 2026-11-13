import { useEffect, useRef, useState } from 'react'

// Envuelve una tabla ancha y pone una barra de desplazamiento horizontal ARRIBA, sincronizada con la de abajo.
// Con `altoMax` la tabla tiene su propio alto con scroll vertical, y la barra vertical sale a los DOS lados (izquierda y derecha, sincronizadas).
export default function ScrollSuperior({ children, altoMax }) {
  const arriba = useRef(null)
  const abajo = useRef(null)
  const izq = useRef(null)
  const bloqueo = useRef(false)
  const bloqueoV = useRef(false)
  const [ancho, setAncho] = useState(0)
  const [hayScroll, setHayScroll] = useState(false)
  const [vert, setVert] = useState({ visible: 0, total: 0 })

  useEffect(() => {
    const el = abajo.current
    if (!el) return undefined
    const medir = () => {
      setAncho(el.scrollWidth); setHayScroll(el.scrollWidth > el.clientWidth + 1)
      if (altoMax) setVert({ visible: el.clientHeight, total: el.scrollHeight > el.clientHeight + 1 ? el.scrollHeight : 0 })
    }
    medir()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(medir)
    ro.observe(el); if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [children, altoMax])

  const sync = (origen, destino) => () => {
    if (bloqueo.current) { bloqueo.current = false; return }
    if (!destino.current || destino.current.scrollLeft === origen.current.scrollLeft) return
    bloqueo.current = true
    destino.current.scrollLeft = origen.current.scrollLeft
  }
  const syncV = (origen, destino) => () => {
    if (bloqueoV.current) { bloqueoV.current = false; return }
    if (!destino.current || destino.current.scrollTop === origen.current.scrollTop) return
    bloqueoV.current = true
    destino.current.scrollTop = origen.current.scrollTop
  }
  const lateral = altoMax && vert.total > 0

  return (
    <div>
      <div ref={arriba} onScroll={sync(arriba, abajo)} aria-label="Desplazamiento horizontal de la tabla"
        style={{ overflowX: 'auto', overflowY: 'hidden', height: hayScroll ? 16 : 0, marginLeft: lateral ? 16 : 0, borderBottom: hayScroll ? '1px solid var(--border)' : 'none' }}>
        <div style={{ width: ancho, height: 1 }} />
      </div>
      <div style={{ display: 'flex' }}>
        {lateral && (
          <div ref={izq} onScroll={syncV(izq, abajo)} aria-label="Desplazamiento vertical de la tabla (lado izquierdo)" data-scroll-izq
            style={{ width: 16, flex: 'none', height: vert.visible, overflowY: 'scroll', overflowX: 'hidden', borderRight: '1px solid var(--border)' }}>
            <div style={{ height: vert.total, width: 1 }} />
          </div>
        )}
        <div ref={abajo} onScroll={(e) => { sync(abajo, arriba)(e); if (lateral) syncV(abajo, izq)() }} className="overflow-x-auto"
          style={altoMax ? { flex: 1, minWidth: 0, maxHeight: altoMax, overflowY: 'auto' } : undefined}>{children}</div>
      </div>
    </div>
  )
}
