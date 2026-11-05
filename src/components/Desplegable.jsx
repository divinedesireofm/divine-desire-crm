import { useEffect, useState } from 'react'

// Contenido que se despliega con animación (altura + fundido) al aparecer y se pliega al cerrarse.
// `abierto` pasa a false para cerrar; cuando termina la animación se llama a `onCerrado` (ahí se desmonta).
export default function Desplegable({ abierto = true, onCerrado, children }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    let r2
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setVisible(abierto)) })
    return () => { cancelAnimationFrame(r1); if (r2) cancelAnimationFrame(r2) }
  }, [abierto])
  useEffect(() => {
    if (abierto || !onCerrado) return undefined
    const t = setTimeout(onCerrado, 420)   // por si el navegador no avisa del fin de la transición
    return () => clearTimeout(t)
  }, [abierto]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ display: 'grid', gridTemplateRows: visible ? '1fr' : '0fr', opacity: visible ? 1 : 0, transition: 'grid-template-rows .38s cubic-bezier(.2,.8,.2,1), opacity .3s ease' }}>
      <div style={{ overflow: visible ? 'visible' : 'hidden', minHeight: 0 }}>{children}</div>
    </div>
  )
}
