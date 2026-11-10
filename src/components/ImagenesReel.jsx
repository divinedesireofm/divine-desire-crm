import { useEffect, useRef, useState } from 'react'
import { urlVideo } from '../lib/planVideos'

function Mini({ img, onQuitar }) {
  const [url, setUrl] = useState('')
  useEffect(() => { let vivo = true; urlVideo(img.path).then((u) => { if (vivo && u) setUrl(u) }); return () => { vivo = false } }, [img.path])
  return (
    <div className="relative" style={{ width: 84, height: 84 }}>
      <a href={url || undefined} target="_blank" rel="noopener noreferrer" title={`${img.nombre || 'Imagen'} (clic para ampliar)`}>
        {url ? <img src={url} alt={img.nombre || 'Imagen'} style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
          : <div style={{ width: 84, height: 84, borderRadius: 8, background: 'var(--panel-alt)', border: '1px solid var(--border)' }} />}
      </a>
      {onQuitar && <button type="button" onClick={onQuitar} title="Quitar imagen" className="absolute -top-2 -right-2 rounded-full text-xs leading-none" style={{ width: 20, height: 20, background: 'var(--danger)', color: '#fff' }}>×</button>}
    </div>
  )
}

// Imágenes de aclaración de un reel. En el editor se suben y quitan; en lectura solo se ven.
export default function ImagenesReel({ imagenes = [], editable = false, subiendo = false, onSubir, onQuitar }) {
  const ref = useRef(null)
  if (!editable && !imagenes.length) return null
  return (
    <div className="mt-2" data-imagenes>
      {imagenes.length > 0 && <div className="flex flex-wrap gap-3 mb-2">{imagenes.map((im) => <Mini key={im.path} img={im} onQuitar={editable ? () => onQuitar(im) : null} />)}</div>}
      {editable && (
        <>
          <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; if (fs.length) onSubir(fs) }} />
          <button type="button" onClick={() => ref.current?.click()} disabled={subiendo} className="text-xs underline" style={{ color: 'var(--accent)' }}>
            {subiendo ? 'Subiendo…' : `🖼️ Añadir imágenes de aclaración${imagenes.length ? ` · ${imagenes.length}` : ''} (opcional)`}
          </button>
        </>
      )}
    </div>
  )
}
