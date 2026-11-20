// Alertas calculadas al vuelo a partir de las lecturas guardadas (ig_profile_stats). No gastan créditos.
// filas: [{ id, username, modelo, lectura_error, historial: [lecturas de más nueva a más vieja] }]
const DIA = 86400000
const sev = { alta: 0, media: 1, info: 2 }

export function computeAlertas(filas, ahora = Date.now()) {
  const out = []
  const add = (f, tipo, severidad, titulo, detalle, fecha) => out.push({ id: f.id + ':' + tipo, account_id: f.id, username: f.username, modelo: f.modelo || null, tipo, severidad, titulo, detalle, fecha: fecha || null })

  for (const f of filas) {
    const h = f.historial || []
    const ult = h[0]

    if (f.lectura_error === 'no_encontrada') add(f, 'caida', 'alta', 'Cuenta no encontrada', 'ScrapeCreators ya no encuentra este perfil: puede estar suspendido, eliminado o haber cambiado de nombre.', f.lectura_error_at)

    // Cambios entre lecturas consecutivas (últimos 10 días)
    for (let i = 0; i < h.length - 1 && i < 6; i++) {
      const a = h[i], b = h[i + 1]
      if (ahora - new Date(a.captured_at).getTime() > 10 * DIA) break
      if (b.external_url !== undefined && a.external_url !== undefined && (a.external_url || '') !== (b.external_url || '')) add(f, 'enlace', 'alta', 'Cambió el enlace de la bio', `Antes: ${b.external_url || '(vacío)'} → Ahora: ${a.external_url || '(vacío)'}`, a.captured_at)
      if (a.biography != null && b.biography != null && (a.biography || '') !== (b.biography || '')) add(f, 'bio', 'media', 'Cambió la biografía', 'El texto de la bio es distinto al de la lectura anterior.', a.captured_at)
      if (a.full_name != null && b.full_name != null && (a.full_name || '') !== (b.full_name || '')) add(f, 'nombre', 'media', 'Cambió el nombre del perfil', `Antes: ${b.full_name || '(vacío)'} → Ahora: ${a.full_name || '(vacío)'}`, a.captured_at)
    }

    // Seguidores que bajan de golpe: contra la lectura de hace ≥20 h dentro de los últimos 8 días
    if (ult && ult.followers != null) {
      const ref = h.slice(1).find((s) => s.followers != null && new Date(ult.captured_at) - new Date(s.captured_at) >= 20 * 3600000 && new Date(ult.captured_at) - new Date(s.captured_at) <= 8 * DIA)
      if (ref && ref.followers > 0) {
        const dif = ult.followers - ref.followers, pct = (dif / ref.followers) * 100
        if (dif <= -10 && pct <= -3) add(f, 'seguidores', pct <= -8 ? 'alta' : 'media', 'Seguidores a la baja', `${ref.followers.toLocaleString('es-ES')} → ${ult.followers.toLocaleString('es-ES')} (${pct.toFixed(1).replace('.', ',')}%)`, ult.captured_at)
      }
    }

    // Vistas de reels: caída o pico frente a la lectura anterior con reels
    const conReels = h.filter((s) => s.avg_reel_views != null && Number(s.avg_reel_views) > 0)
    if (conReels.length >= 2) {
      const a = Number(conReels[0].avg_reel_views), b = Number(conReels[1].avg_reel_views)
      if (b >= 50) {
        const pct = ((a - b) / b) * 100
        if (pct <= -40) add(f, 'vistas_baja', 'media', 'Las vistas de reels se desploman', `Media por reel: ${Math.round(b).toLocaleString('es-ES')} → ${Math.round(a).toLocaleString('es-ES')} (${pct.toFixed(0)}%)`, conReels[0].captured_at)
        else if (pct >= 100) add(f, 'vistas_pico', 'info', 'Pico de vistas en reels', `Media por reel: ${Math.round(b).toLocaleString('es-ES')} → ${Math.round(a).toLocaleString('es-ES')} (+${pct.toFixed(0)}%). Mira qué reel tira y repítelo.`, conReels[0].captured_at)
      }
    }

    // Días sin publicar
    if (ult && ult.last_post_at) {
      const d = Math.floor((ahora - new Date(ult.last_post_at).getTime()) / DIA)
      if (d >= 14) add(f, 'sin_publicar', 'alta', `${d} días sin publicar`, 'Más de dos semanas sin contenido nuevo: el alcance se resiente.', ult.last_post_at)
      else if (d >= 7) add(f, 'sin_publicar', 'media', `${d} días sin publicar`, 'Una semana o más sin contenido nuevo.', ult.last_post_at)
    }
  }
  return out.sort((x, y) => sev[x.severidad] - sev[y.severidad] || String(x.username).localeCompare(String(y.username)))
}
