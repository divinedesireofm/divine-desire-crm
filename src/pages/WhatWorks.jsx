import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Panel, PageHeader } from '../components/ui'

const CATEGORIA_LABEL = { rol: 'Rol / personaje', pregunta_fan: 'Responde pregunta de fan', chiste_texto: 'Chiste de texto', cuerpo_estetica: 'Cuerpo y estética', romantico: 'Conexión romántica', humor_remate: 'Humor con remate', otro: 'Otro' }

function ratio(n, d, mult = 1) { if (!n || !d) return null; return (Number(n) / Number(d)) * mult }

export default function WhatWorks() {
  const [reels, setReels] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('reels').select('*, instagram_accounts(username)').then(({ data }) => {
      setReels(data || [])
      setLoading(false)
    })
  }, [])

  const conRatio = reels
    .map((r) => ({ ...r, _por1000: ratio(r.seguidores_ganados, r.alcance, 1000) }))
    .filter((r) => r._por1000 !== null)

  const porCategoria = {}
  conRatio.forEach((r) => {
    const cat = r.categoria || 'otro'
    if (!porCategoria[cat]) porCategoria[cat] = []
    porCategoria[cat].push(r._por1000)
  })
  const ranking = Object.entries(porCategoria)
    .map(([cat, valores]) => ({
      categoria: cat,
      media: valores.reduce((a, b) => a + b, 0) / valores.length,
      n: valores.length,
    }))
    .sort((a, b) => b.media - a.media)

  const top10 = [...conRatio].sort((a, b) => b._por1000 - a._por1000).slice(0, 10)

  return (
    <div>
      <PageHeader title="Lo que funciona" subtitle="Qué formatos de reel rinden mejor, consolidado entre todas las cuentas." />

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
      ) : conRatio.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Todavía no hay suficientes reels con alcance y seguidores registrados en ninguna cuenta.</p>
      ) : (
        <>
          <Panel className="p-5 mb-6">
            <p className="text-sm font-medium mb-4">Ranking de formatos (seguidores por cada 1.000 de alcance, de media)</p>
            <div className="space-y-2">
              {ranking.map((r, i) => (
                <div key={r.categoria} className="flex items-center gap-3 p-2 rounded-md" style={{ background: 'var(--panel-alt)' }}>
                  <span className="font-display font-semibold gold-text w-6">{i + 1}</span>
                  <span className="text-sm flex-1">{CATEGORIA_LABEL[r.categoria] || r.categoria}</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.n} reel(s)</span>
                  <strong style={{ color: r.media >= 12 ? 'var(--success)' : 'var(--danger)' }}>{r.media.toFixed(1)}</strong>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-5">
            <p className="text-sm font-medium mb-4">Top 10 reels individuales</p>
            <div className="space-y-2">
              {top10.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-2 rounded-md" style={{ background: 'var(--panel-alt)' }}>
                  <div className="flex-1">
                    <p className="text-sm">{r.titulo}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {r.instagram_accounts?.username} · {CATEGORIA_LABEL[r.categoria] || '—'} · {r.fecha_publicacion}
                    </p>
                  </div>
                  <strong style={{ color: 'var(--success)' }}>{r._por1000.toFixed(1)}</strong>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}
