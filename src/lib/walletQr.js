import jsQR from './vendor/jsqr'

// Contratos de los tokens conocidos (en minúsculas) -> { moneda, red }
const TOKENS = {
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { moneda: 'usdc', red: 'eth' },
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { moneda: 'usdt', red: 'eth' },
  '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': { moneda: 'usdc', red: 'bsc' },
  '0x55d398326f99059ff775485246999027b3197955': { moneda: 'usdt', red: 'bsc' },
}
const CHAINS = { 1: 'eth', 56: 'bsc' }
// Qué método de cobro (clave de WALLETS) corresponde a cada moneda + red
const SLOTS = { 'usdc|eth': 'usdc_eth', 'usdc|bsc': 'usdc_bsc', 'usdt|bsc': 'usdt_bsc' }
export const NOMBRE_SLOT = { usdc_eth: 'USDC · ETH', usdc_bsc: 'USDC · BSC', usdt_bsc: 'USDT · BSC', binance: 'Binance' }
const RE_EVM = /^0x[0-9a-fA-F]{40}$/

// Lee el texto de un QR dentro de una imagen (prueba varios tamaños por si está borrosa o es una captura grande)
export function leerQr(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const mayor = Math.max(img.width, img.height)
        const escalas = [...new Set([1600, 1000, 700, 450].map((max) => Math.min(1, max / mayor)))]
        for (const k of escalas) {
          const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k))
          const c = document.createElement('canvas'); c.width = w; c.height = h
          const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h)
          const r = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' })
          if (r && r.data) { URL.revokeObjectURL(url); resolve(r.data.trim()); return }
        }
      } catch { /* sin lectura */ }
      resolve(null)
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

// Interpreta el texto de un QR de billetera.
// Devuelve { direccion, moneda, red, slot, ambiguo, aviso }.
//  - slot: método de cobro detectado (usdc_eth, usdc_bsc, usdt_bsc, binance) o null
//  - ambiguo: dirección EVM sin red ni moneda en el QR (puede ser ETH o BSC): hay que elegir
export function analizarQr(texto) {
  const t = String(texto || '').trim()
  if (!t) return { direccion: '', slot: null, aviso: 'El QR está vacío.' }
  // EIP-681: ethereum:0xTOKEN@56/transfer?address=0xDESTINO&uint256=...
  const m = t.match(/^(?:ethereum|bnb|binancesmartchain|smartchain|pay)[:-](?:pay-)?(0x[0-9a-fA-F]{40})(?:@(\d+))?(?:\/(\w+))?(?:\?(.*))?$/i)
  if (m) {
    const [, addr, chain, fn, query] = m
    const red = CHAINS[Number(chain || 1)] || null
    const params = new URLSearchParams(query || '')
    const tok = TOKENS[addr.toLowerCase()]
    const destino = fn === 'transfer' && RE_EVM.test(params.get('address') || '') ? params.get('address') : addr
    const moneda = tok?.moneda || null
    const redFinal = tok?.red || red
    const slot = moneda && redFinal ? SLOTS[moneda + '|' + redFinal] || null : null
    return { direccion: destino, moneda, red: redFinal, slot, ambiguo: !slot }
  }
  if (RE_EVM.test(t)) return { direccion: t, moneda: null, red: null, slot: null, ambiguo: true }
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(t)) return { direccion: t, moneda: null, red: 'tron', slot: null, aviso: 'Es una dirección TRON (TRC20): esa red no está entre los métodos de cobro (USDC ETH, USDC BSC, USDT BSC, Binance).' }
  if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,60}$/.test(t)) return { direccion: t, moneda: null, red: 'btc', slot: null, aviso: 'Es una dirección Bitcoin: no está entre los métodos de cobro.' }
  if (/binance\.com|bnbpay|binancepay/i.test(t)) return { direccion: t, moneda: null, red: null, slot: 'binance' }
  if (/^\d{6,12}$/.test(t)) return { direccion: t, moneda: null, red: null, slot: 'binance', aviso: null }
  return { direccion: t, moneda: null, red: null, slot: null, aviso: 'No reconozco el formato de este QR; lo he dejado como texto en el campo que elijas.' }
}
