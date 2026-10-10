// Sonido suave para los avisos, generado con el propio navegador (no hay archivos de audio).
// La preferencia se guarda en este navegador. Por defecto está activado.

const CLAVE = 'dd_sonido_avisos'
let ctx = null
let ultimo = 0

export function sonidoActivo() {
  try { return localStorage.getItem(CLAVE) !== 'off' } catch { return true }
}
export function setSonidoActivo(valor) {
  try { localStorage.setItem(CLAVE, valor ? 'on' : 'off') } catch { /* sin almacenamiento: vale solo para esta sesión */ }
}

// Volumen general (0-100). Por defecto 100.
const CLAVE_VOL = 'dd_volumen_avisos'
export function volumenAvisos() {
  try { const v = parseInt(localStorage.getItem(CLAVE_VOL), 10); return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 100 } catch { return 100 }
}
export function setVolumenAvisos(v) {
  try { localStorage.setItem(CLAVE_VOL, String(Math.round(v))) } catch { /* sin almacenamiento: vale solo para esta sesión */ }
}

function contexto() {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  if (!AC) return null
  if (!ctx) ctx = new AC()
  return ctx
}

// Los navegadores solo dejan sonar el audio después de que la persona toque la pantalla una vez.
// Este desbloqueo se engancha al primer clic/tecla/toque.
export function instalarDesbloqueo() {
  if (typeof window === 'undefined') return () => {}
  const abrir = () => { const c = contexto(); if (c && c.state === 'suspended') c.resume().catch(() => {}) }
  const eventos = ['pointerdown', 'keydown', 'touchstart']
  eventos.forEach((e) => window.addEventListener(e, abrir, { passive: true }))
  return () => eventos.forEach((e) => window.removeEventListener(e, abrir))
}

// Salida común con compresor y ganancia extra: sube el volumen percibido sin que distorsione.
let cadena = null
function salida(c) {
  if (cadena && cadena.ctx === c) return cadena.entrada
  const comp = c.createDynamicsCompressor()
  comp.threshold.value = -18
  comp.ratio.value = 6
  const extra = c.createGain()
  extra.gain.value = 2.2
  comp.connect(extra).connect(c.destination)
  cadena = { ctx: c, entrada: comp }
  return comp
}

function nota(c, freq, inicio, duracion, volumen) {
  const t0 = c.currentTime + inicio
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = 'triangle' // tiene más armónicos que la onda sinusoidal y se oye bastante más fuerte
  osc.frequency.value = freq
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(volumen, t0 + 0.03)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion)
  osc.connect(g).connect(salida(c))
  osc.start(t0)
  osc.stop(t0 + duracion + 0.05)
}

// tipo: 'importante' (dos notas suaves) | 'secundaria' (una nota breve y más baja)
// forzar: se usa en el botón de probar, ignora el interruptor
export function reproducirAviso(tipo = 'importante', forzar = false) {
  if (!forzar && !sonidoActivo()) return
  const c = contexto()
  if (!c) return
  const ahora = Date.now()
  if (!forzar && ahora - ultimo < 2000) return // no suena más de una vez cada 2 s
  const sonar = () => {
    if (c.state !== 'running') return
    ultimo = Date.now()
    const vol = volumenAvisos() / 100 // 0 a 1
    if (vol <= 0) return
    if (tipo === 'importante') { nota(c, 659.25, 0, 0.45, 0.9 * vol); nota(c, 880, 0.14, 0.6, 0.8 * vol) }
    else nota(c, 784, 0, 0.35, 0.45 * vol)
  }
  if (c.state === 'suspended') c.resume().then(sonar).catch(() => {})
  else sonar()
}
