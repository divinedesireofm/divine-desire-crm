// Antigüedad de una cuenta a partir de su fecha de creación (AAAA-MM-DD), a día `hasta` (por defecto hoy).
// Devuelve «2 años y 3 meses», «5 meses», «12 días»… o '' si no hay fecha.
export function antiguedadDe(creada, hasta) {
  const m = String(creada || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  const h = String(hasta || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  const hoy = h ? new Date(+h[1], +h[2] - 1, +h[3]) : new Date()
  const ini = new Date(+m[1], +m[2] - 1, +m[3])
  if (hoy < ini) return 'aún no creada'
  let meses = (hoy.getFullYear() - ini.getFullYear()) * 12 + (hoy.getMonth() - ini.getMonth())
  if (hoy.getDate() < ini.getDate()) meses -= 1
  if (meses < 1) {
    const dias = Math.max(0, Math.round((new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) - ini) / 86400000))
    return dias === 1 ? '1 día' : `${dias} días`
  }
  const a = Math.floor(meses / 12), r = meses % 12
  const pa = a === 1 ? '1 año' : `${a} años`
  const pm = r === 1 ? '1 mes' : `${r} meses`
  return a === 0 ? pm : r === 0 ? pa : `${pa} y ${pm}`
}
