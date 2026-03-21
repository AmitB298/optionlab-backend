import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { subscribersApi } from '../../utils/api'
import toast from 'react-hot-toast'

/* ── VIX GAUGE ─────────────────────────────────────────────── */
export function VixWidget() {
  const [vix, setVix] = useState(14.32)

  useEffect(() => {
    const id = setInterval(() => {
      setVix(v => Math.max(10, Math.min(28, v + (Math.random() - 0.48) * 0.12)))
    }, 3000)
    return () => clearInterval(id)
  }, [])

  const pct = (vix - 10) / 18
  const circumference = 2 * Math.PI * 38
  const offset = circumference - pct * circumference * 0.75
  const color = vix < 13 ? '#30d158' : vix < 17 ? '#ff9f0a' : '#ff453a'
  const regime = vix < 13 ? 'LOW' : vix < 17 ? 'MODERATE' : vix < 21 ? 'HIGH' : 'EXTREME'

  return (
    <div className="bg-ink-1 border-b border-line">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-line">
        <span className="font-mono text-[10px] text-t-3 uppercase tracking-widest flex items-center gap-2">
          <span className="w-[2px] h-3 bg-amber inline-block" />INDIA VIX
        </span>
        <span className="font-mono text-[9px] text-t-4">FEAR GAUGE</span>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-4">
          {/* Ring */}
          <div className="relative w-20 h-20 shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-[225deg]">
              <circle cx="50" cy="50" r="38" fill="none" stroke="#162238" strokeWidth="7" strokeDasharray={circumference} strokeDashoffset="0" />
              <circle cx="50" cy="50" r="38" fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 1s ease, stroke 0.5s' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono font-bold text-lg leading-none" style={{ color }}>{vix.toFixed(2)}</span>
              <span className="font-mono text-[8px] text-t-4 mt-0.5">VIX</span>
            </div>
          </div>
          {/* Stats */}
          <div className="flex-1 font-mono text-[10px] space-y-1.5">
            <div className="flex justify-between text-t-4">
              <span>REGIME</span><span style={{ color }}>{regime}</span>
            </div>
            <div className="flex justify-between text-t-4">
              <span>52W HIGH</span><span className="text-t-2">22.4</span>
            </div>
            <div className="flex justify-between text-t-4">
              <span>52W LOW</span><span className="text-t-2">10.8</span>
            </div>
            <div className="flex justify-between text-t-4">
              <span>CHANGE</span>
              <span className={vix > 14.32 ? 'text-red' : 'text-green'}>
                {vix > 14.32 ? '+' : ''}{(vix - 14.32).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── OPTIONS CHAIN ─────────────────────────────────────────── */
const OC_DATA = [
  { strike: '22,700', callOI: '28.4', putOI: '6.2',  callLTP: '48',  putLTP: '182', atm: false },
  { strike: '22,600', callOI: '31.2', putOI: '8.4',  callLTP: '82',  putLTP: '148', atm: false },
  { strike: '22,500', callOI: '45.2', putOI: '22.1', callLTP: '120', putLTP: '118', atm: true  },
  { strike: '22,400', callOI: '18.6', putOI: '36.4', callLTP: '172', putLTP: '88',  atm: false },
  { strike: '22,300', callOI: '12.1', putOI: '48.9', callLTP: '228', putLTP: '58',  atm: false },
  { strike: '22,200', callOI: '8.4',  putOI: '62.1', callLTP: '298', putLTP: '34',  atm: false },
]
const MAX_OI = 65

export function OptionsChainWidget() {
  return (
    <div className="bg-ink-1 border-b border-line">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-line">
        <span className="font-mono text-[10px] text-t-3 uppercase tracking-widest flex items-center gap-2">
          <span className="w-[2px] h-3 bg-amber inline-block" />NIFTY OPTIONS CHAIN
        </span>
      </div>
      <div className="p-2">
        <table className="w-full text-[10px] font-mono border-collapse">
          <thead>
            <tr className="text-t-4">
              <th className="text-right py-1.5 px-2 text-green">CALL OI</th>
              <th className="text-right py-1.5 px-1 text-green text-[9px]">LTP</th>
              <th className="text-center py-1.5 px-2">STRIKE</th>
              <th className="text-left py-1.5 px-1 text-red text-[9px]">LTP</th>
              <th className="text-left py-1.5 px-2 text-red">PUT OI</th>
            </tr>
          </thead>
          <tbody>
            {OC_DATA.map((row) => (
              <tr key={row.strike} className={`border-t border-line/50 ${row.atm ? 'bg-amber/5' : 'hover:bg-ink-2'}`}>
                <td className="text-right px-2 py-1">
                  <div className="text-green">{row.callOI}L</div>
                  <div className="h-[3px] bg-ink-3 mt-0.5">
                    <div className="h-full bg-green/60" style={{ width: `${(parseFloat(row.callOI) / MAX_OI) * 100}%` }} />
                  </div>
                </td>
                <td className="text-right px-1 py-1 text-green text-[9px]">₹{row.callLTP}</td>
                <td className="text-center px-2 py-1">
                  <span className={`px-2 py-0.5 ${row.atm ? 'text-amber border border-amber/40 font-bold' : 'text-t-2'}`}>
                    {row.strike}
                  </span>
                </td>
                <td className="text-left px-1 py-1 text-red text-[9px]">₹{row.putLTP}</td>
                <td className="text-left px-2 py-1">
                  <div className="text-red">{row.putOI}L</div>
                  <div className="h-[3px] bg-ink-3 mt-0.5">
                    <div className="h-full bg-red/60" style={{ width: `${(parseFloat(row.putOI) / MAX_OI) * 100}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── TRENDING ──────────────────────────────────────────────── */
interface TrendItem { title: string; views: string; change: string; dir: 'up' | 'dn'; slug: string }
interface TrendingProps { items: TrendItem[] }

export function TrendingWidget({ items }: TrendingProps) {
  return (
    <div className="bg-ink-1 border-b border-line">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-line">
        <span className="font-mono text-[10px] text-t-3 uppercase tracking-widest flex items-center gap-2">
          <span className="w-[2px] h-3 bg-amber inline-block" />TRENDING NOW
        </span>
        <span className="font-mono font-bold text-[8px] bg-red text-white px-1.5 py-0.5 tracking-wider animate-blink">LIVE</span>
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex gap-2.5 px-3.5 py-2.5 border-b border-line hover:bg-ink-2 transition-colors cursor-pointer group">
          <span className="font-mono text-xl font-light text-line-3 min-w-[20px]">0{i + 1}</span>
          <div className="flex-1">
            <p className="font-sans text-[12px] font-semibold text-t-2 group-hover:text-amber transition-colors leading-snug line-clamp-2">{item.title}</p>
            <div className="font-mono text-[9px] text-t-4 mt-1">{item.views} views</div>
          </div>
          <div className={`font-mono text-[10px] font-semibold shrink-0 self-start mt-0.5 ${item.dir === 'up' ? 'text-green' : 'text-red'}`}>
            {item.dir === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── NEWSLETTER ────────────────────────────────────────────── */
export function NewsletterWidget() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubscribe = async () => {
    if (!email.includes('@')) { toast.error('Enter a valid email'); return }
    setLoading(true)
    try {
      await subscribersApi.subscribe({ email, source: 'sidebar_widget' })
      toast.success('Subscribed! First brief tomorrow at 8:30 AM IST.')
      setEmail('')
    } catch {
      toast.error('Failed to subscribe. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-ink-1 border-b border-line p-4">
      <div className="font-display font-bold text-[13px] text-t-1 mb-1">Pre-Market Brief</div>
      <p className="font-sans font-light text-[11px] text-t-3 leading-relaxed mb-3">
        AI-generated NIFTY/BANKNIFTY analysis + OI shifts + strategy ideas. Every trading day at 8:30 AM IST.
      </p>
      <div className="flex gap-0">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && handleSubscribe()}
          placeholder="trader@email.com"
          className="flex-1 bg-ink-2 border border-line-2 border-r-0 px-3 py-2 font-mono text-[12px] text-t-1 outline-none placeholder:text-t-4 focus:border-amber transition-colors"
        />
        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="px-3 py-2 border border-cyan text-cyan font-mono text-[10px] uppercase tracking-wider hover:bg-cyan hover:text-black transition-colors disabled:opacity-50"
        >
          {loading ? '...' : 'JOIN'}
        </button>
      </div>
    </div>
  )
}
