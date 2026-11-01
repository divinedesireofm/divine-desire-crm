import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from '../context/AuthContext'

// Un chatter tiene el reporte pendiente cuando su último movimiento de asistencia es «salida»
// y desde que entró no ha enviado ningún reporte de turno ni ha marcado «ya lo envié».
export function useReportePendiente() {
  const { profile, hasRole } = useAuth()
  const aplica = !!profile && hasRole('chatter')
  const [pendiente, setPendiente] = useState(null) // null | { salidaId }

  const comprobar = useCallback(async () => {
    if (!aplica) { setPendiente(null); return }
    const { data: ev, error } = await supabase.from('attendance_events').select('id, tipo, created_at').eq('chatter_id', profile.id).order('created_at', { ascending: false }).limit(30)
    if (error || !ev?.length || ev[0].tipo !== 'salida') { setPendiente(null); return }
    const salida = ev[0]
    const entrada = ev.slice(1).find((e) => e.tipo === 'entrada')
    const desde = entrada ? entrada.created_at : new Date(new Date(salida.created_at).getTime() - 14 * 3600 * 1000).toISOString()
    const [{ data: ack }, { data: rep }] = await Promise.all([
      supabase.from('shift_report_acks').select('event_id').eq('event_id', salida.id).limit(1),
      supabase.from('shift_reports').select('id').eq('chatter_id', profile.id).gte('created_at', desde).limit(1),
    ])
    setPendiente(ack?.length || rep?.length ? null : { salidaId: salida.id })
  }, [aplica, profile])

  useEffect(() => {
    comprobar()
    const poll = setInterval(comprobar, 15000)
    window.addEventListener('attendance-changed', comprobar)
    window.addEventListener('shift-report-sent', comprobar)
    return () => { clearInterval(poll); window.removeEventListener('attendance-changed', comprobar); window.removeEventListener('shift-report-sent', comprobar) }
  }, [comprobar])

  // Si en realidad ya lo había enviado, se marca como enviado y listo
  async function marcarEnviado() {
    if (!pendiente) return
    const { error } = await supabase.from('shift_report_acks').insert([{ event_id: pendiente.salidaId, chatter_id: profile.id }])
    if (error && !String(error.message).includes('duplicate')) return error.message.includes('shift_report_acks') ? 'Falta ejecutar la migración 73 en Supabase.' : error.message
    await comprobar()
    return null
  }

  return { pendiente, marcarEnviado, comprobar }
}
