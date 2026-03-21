// ── AI ANALYSIS PAGE ────────────────────────────────────────
import AIChat from '../components/ai/AIChat'
import { useQuery } from '@tanstack/react-query'
import { articlesApi } from '../utils/api'
import ArticleCard from '../components/blog/ArticleCard'
import { useState } from 'react'

export function AnalysisPage() {
  const [pcrPut, setPcrPut] = useState(25840000)
  const [pcrCall, setPcrCall] = useState(35200000)

  const pcr = (pcrPut / pcrCall).toFixed(2)
  const pcrSignal = parseFloat(pcr) < 0.7 ? { text: 'EXTREME BEARISH — Heavy call dominance', color: 'text-red' }
    : parseFloat(pcr) < 0.85 ? { text: 'BEARISH — Put/Call imbalance', color: 'text-red' }
    : parseFloat(pcr) < 1.0  ? { text: 'MILDLY BEARISH', color: 'text-amber' }
    : parseFloat(pcr) < 1.2  ? { text: 'MILDLY BULLISH', color: 'text-amber' }
    : parseFloat(pcr) < 1.5  ? { text: 'BULLISH — Put heavy', color: 'text-green' }
    : { text: 'EXTREME BULLISH — Contrarian sell signal', color: 'text-green' }

  const { data } = useQuery({
    queryKey: ['articles-analysis'],
    queryFn: () => articlesApi.list({ limit: 6 }).then(r => r.data),
  })

  const OI_STRIKES = [22000,22100,22200,22300,22400,22500,22600,22700,22800,22900,23000]
  const CALL_OI    = [4,6,10,18,28,45,31,22,14,9,6]
  const PUT_OI     = [68,55,44,38,30,22,12,8,5,3,2]
  const MAX_OI     = 70

  const IV_DATA = [
    { sym:'NIFTY',     iv:'13.8%', rank:'22nd', pcr:'0.73', mp:'22,300', sig:'SELL',     sigC:'text-red' },
    { sym:'BANKNIFTY', iv:'15.2%', rank:'45th', pcr:'0.91', mp:'47,900', sig:'NEUTRAL',  sigC:'text-amber' },
    { sym:'FINNIFTY',  iv:'12.9%', rank:'18th', pcr:'0.84', mp:'23,000', sig:'SELL',     sigC:'text-red' },
    { sym:'RELIANCE',  iv:'18.4%', rank:'72nd', pcr:'1.12', mp:'2,900',  sig:'BUY VOL',  sigC:'text-green' },
  ]

  return (
    <div className="grid grid-cols-[1fr_300px] bg-line gap-px">
      <div className="bg-ink">
        <div className="p-5">
          <AIChat />
        </div>

        {/* OI Distribution */}
        <div className="border-t border-line p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-[10px] text-t-3 uppercase tracking-widest flex items-center gap-2">
              <span className="w-[2px] h-3 bg-amber inline-block" />OI DISTRIBUTION — NIFTY WEEKLY
            </span>
            <div className="flex gap-4 font-mono text-[10px]">
              <span className="text-green">■ CALL OI</span>
              <span className="text-red">■ PUT OI</span>
            </div>
          </div>
          <div className="flex items-end gap-1 h-28 mb-2">
            {OI_STRIKES.map((s, i) => (
              <div key={s} className="flex flex-col items-center flex-1 gap-0.5">
                <div className="w-full bg-green/70 rounded-sm" style={{ height: `${(CALL_OI[i]/MAX_OI)*100}%`, opacity: s===22500?1:0.7 }} />
                <div className="w-full bg-red/70 rounded-sm" style={{ height: `${(PUT_OI[i]/MAX_OI)*100}%`, opacity: s===22500?1:0.7 }} />
              </div>
            ))}
          </div>
          <div className="flex gap-1">
            {OI_STRIKES.map(s => (
              <div key={s} className={`flex-1 text-center font-mono text-[8px] ${s===22500?'text-amber':'text-t-4'}`}>{s}</div>
            ))}
          </div>
        </div>

        {/* Deep dive articles */}
        <div className="border-t border-line">
          <div className="px-5 py-3 bg-ink-1 border-b border-line font-mono text-[10px] text-t-3 uppercase tracking-widest flex items-center gap-2">
            <span className="w-[2px] h-3 bg-amber inline-block" />DEEP DIVE ANALYSIS
          </div>
          {data?.articles?.map((a: any) => <ArticleCard key={a.id} article={a} />)}
        </div>
      </div>

      {/* Right column */}
      <div className="bg-ink space-y-px">
        {/* PCR */}
        <div className="bg-ink-1 border-b border-line p-4">
          <div className="font-mono text-[10px] text-t-3 uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="w-[2px] h-3 bg-amber inline-block" />PCR CALCULATOR
          </div>
          <div className="space-y-2 mb-3">
            <div>
              <label className="font-mono text-[9px] text-t-4 uppercase tracking-wider block mb-1">PUT OI</label>
              <input type="number" value={pcrPut} onChange={e => setPcrPut(Number(e.target.value))}
                className="w-full bg-ink-2 border border-line px-3 py-1.5 font-mono text-[12px] text-t-1 outline-none focus:border-amber" />
            </div>
            <div>
              <label className="font-mono text-[9px] text-t-4 uppercase tracking-wider block mb-1">CALL OI</label>
              <input type="number" value={pcrCall} onChange={e => setPcrCall(Number(e.target.value))}
                className="w-full bg-ink-2 border border-line px-3 py-1.5 font-mono text-[12px] text-t-1 outline-none focus:border-amber" />
            </div>
          </div>
          <div className="font-mono text-[9px] text-t-4 uppercase tracking-wider mb-1">RESULT</div>
          <div className="font-mono font-light text-[28px] text-cyan mb-2">{pcr}</div>
          <div className={`font-mono text-[10px] ${pcrSignal.color}`}>{pcrSignal.text}</div>
        </div>

        {/* IV */}
        <div className="bg-ink-1 border-b border-line p-4">
          <div className="font-mono text-[10px] text-t-3 uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="w-[2px] h-3 bg-amber inline-block" />IV SNAPSHOT
          </div>
          <table className="w-full text-[10px] font-mono border-collapse">
            <thead><tr className="text-t-4 border-b border-line">
              <th className="text-left py-1.5">SYM</th><th>IV%</th><th>RANK</th><th>PCR</th>
            </tr></thead>
            <tbody>
              {IV_DATA.map(d => (
                <tr key={d.sym} className="border-b border-line/50 hover:bg-ink-2">
                  <td className="py-1.5 font-bold text-t-1">{d.sym}</td>
                  <td className="text-center text-cyan">{d.iv}</td>
                  <td className="text-center text-t-3">{d.rank}</td>
                  <td className={`text-center ${parseFloat(d.pcr)<0.85?'text-red':parseFloat(d.pcr)>1.15?'text-green':'text-amber'}`}>{d.pcr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Max Pain */}
        <div className="bg-ink-1 p-4">
          <div className="font-mono text-[10px] text-t-3 uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="w-[2px] h-3 bg-amber inline-block" />MAX PAIN LEVELS
          </div>
          {[
            { sym:'NIFTY',     mp:'22,300', curr:'22,347', dist:'-47' },
            { sym:'BANKNIFTY', mp:'47,900', curr:'47,984', dist:'-84' },
            { sym:'FINNIFTY',  mp:'23,000', curr:'23,108', dist:'-108' },
          ].map(d => (
            <div key={d.sym} className="bg-ink-2 border border-line p-3 mb-2 font-mono">
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-amber font-bold">{d.sym}</span>
                <span className="text-t-4">{d.dist} pts away</span>
              </div>
              <div className="text-[16px] font-light text-t-1">MP: {d.mp}</div>
              <div className="text-[10px] text-t-4 mt-0.5">Spot: {d.curr}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── TOOLS PAGE ───────────────────────────────────────────────
export function ToolsPage() {
  const TOOLS = [
    { name:'OI Pulse',         desc:'Real-time OI change detection. Long/short buildup & unwinding signals.', icon:'📡', badge:'LIVE' },
    { name:'IV Surface (3D)',  desc:'Interactive SVI/SABR implied vol surface. Spot mispriced strikes instantly.', icon:'🌐', badge:'NEW' },
    { name:'Max Pain Engine',  desc:'Theoretical pain level calculation across all active strikes with history.', icon:'💊', badge:null },
    { name:'PCR Analyzer',     desc:'Put-Call Ratio trend with historical context and overbought/oversold signals.', icon:'⚖️', badge:null },
    { name:'Options Payoff',   desc:'Multi-leg strategy builder with real-time P&L curves and IV scenarios.', icon:'📐', badge:'NEW' },
    { name:'FII/DII Tracker',  desc:'Daily participant-wise NSE data. Index future & option positioning history.', icon:'🏛️', badge:'LIVE' },
    { name:'Unusual OI Scanner', desc:'Identifies abnormal OI buildup vs 5-day average. Surface institutional activity.', icon:'🔍', badge:'LIVE' },
    { name:'Greeks Calculator', desc:'Full options Greeks including third-order: Vanna, Volga, Speed, Color.', icon:'🔢', badge:null },
    { name:'Gamma Exposure',   desc:'Net dealer gamma exposure (GEX) map. Identify pin risk and gamma flip levels.', icon:'⚡', badge:'BETA' },
    { name:'Vol Forecaster',   desc:'AI-powered short-term IV forecast using GARCH + sentiment signals.', icon:'🤖', badge:'AI' },
    { name:'Skew Monitor',     desc:'Live put-call skew tracking with historical context. Identify vol market extremes.', icon:'📊', badge:null },
    { name:'Earnings Calendar', desc:'F&O-eligible earnings schedule with historical IV expansion/crush data.', icon:'📅', badge:null },
  ]

  return (
    <div className="p-5">
      <div className="font-mono text-[10px] text-t-3 uppercase tracking-widest mb-4 flex items-center gap-2">
        <span className="w-[2px] h-3 bg-amber inline-block" />ANALYSIS TOOLBOX — {TOOLS.length} INSTRUMENTS
      </div>
      <div className="grid grid-cols-3 gap-px bg-line mb-px">
        {TOOLS.map((t, i) => (
          <div key={t.name} className="bg-ink-1 p-5 hover:bg-ink-2 transition-colors cursor-pointer group relative">
            {t.badge && (
              <span className={`absolute top-3 right-3 font-mono text-[8px] font-bold px-1.5 py-0.5 border tracking-wider
                ${t.badge==='LIVE' ? 'bg-red/10 text-red border-red/30'
                : t.badge==='BETA' ? 'bg-purple/10 text-purple border-purple/30'
                : 'bg-cyan/10 text-cyan border-cyan/30'}`}>
                {t.badge}
              </span>
            )}
            <div className="text-[26px] mb-3">{t.icon}</div>
            <div className="font-sans font-bold text-[13px] text-t-2 mb-1.5 group-hover:text-amber transition-colors">{t.name}</div>
            <div className="font-sans font-light text-[11px] text-t-3 leading-relaxed">{t.desc}</div>
            <div className="absolute bottom-2 right-2.5 font-mono text-[8px] text-line-3">[{i+1}/{TOOLS.length}]</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── AUTHORS PAGE ─────────────────────────────────────────────
export function AuthorsPage() {
  const { data: authors = [], isLoading } = useQuery({
    queryKey: ['authors'],
    queryFn: () => import('../utils/api').then(m => m.authorsApi.list()).then(r => r.data),
  })
  const { data: articles } = useQuery({
    queryKey: ['articles-all'],
    queryFn: () => articlesApi.list({ limit: 20 }).then(r => r.data),
  })

  if (isLoading) return <div className="p-6 font-mono text-t-4 text-[11px]">Loading authors...</div>

  return (
    <div>
      <div className="px-5 py-3 border-b border-line bg-ink-1 font-mono text-[10px] text-t-3 uppercase tracking-widest flex items-center gap-2">
        <span className="w-[2px] h-3 bg-amber inline-block" />RESEARCH TEAM — {authors.length} ANALYSTS
      </div>
      <div className="grid grid-cols-4 gap-px bg-line mb-px">
        {authors.map((a: any) => (
          <div key={a.id} className="bg-ink-1 p-6 hover:bg-ink-2 transition-colors cursor-pointer">
            <div className="w-12 h-12 rounded-full flex items-center justify-center font-mono font-bold text-xl text-black mb-4" style={{ background: a.avatar_color }}>
              {a.initials}
            </div>
            <div className="font-sans font-bold text-[15px] text-t-1 mb-1">{a.name}</div>
            <div className="font-mono text-[10px] text-amber mb-3">{a.role}</div>
            <p className="font-sans font-light text-[11px] text-t-3 leading-relaxed mb-4 line-clamp-3">{a.bio}</p>
            <div className="flex gap-4 font-mono text-[10px] text-t-4">
              <div><span className="block text-t-2 text-[14px] font-semibold">{a.articles_count}</span>Articles</div>
              <div><span className="block text-t-2 text-[14px] font-semibold">{a.followers_count >= 1000 ? `${(a.followers_count/1000).toFixed(1)}k` : a.followers_count}</span>Followers</div>
              <div><span className="block text-t-2 text-[14px] font-semibold">{a.accuracy_pct}%</span>Accuracy</div>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="px-5 py-3 bg-ink-1 border-b border-line font-mono text-[10px] text-t-3 uppercase tracking-widest flex items-center gap-2">
          <span className="w-[2px] h-3 bg-amber inline-block" />ALL ARTICLES
        </div>
        {articles?.articles?.map((a: any) => <ArticleCard key={a.id} article={a} />)}
      </div>
    </div>
  )
}

// ── LOGIN PAGE ───────────────────────────────────────────────
import { useState as useStateL } from 'react'
import { useNavigate as useNavL } from 'react-router-dom'
import { authApi } from '../utils/api'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'

export function LoginPage() {
  const [email, setEmail] = useStateL('')
  const [password, setPassword] = useStateL('')
  const [loading, setLoading] = useStateL(false)
  const { setAuth } = useAuthStore()
  const nav = useNavL()

  const handleLogin = async () => {
    if (!email || !password) { toast.error('Enter email and password'); return }
    setLoading(true)
    try {
      const { data } = await authApi.login({ email, password })
      setAuth(data.token, data.author)
      toast.success(`Welcome, ${data.author.name}!`)
      nav('/admin')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="bg-ink-1 border border-line w-full max-w-sm">
        <div className="px-6 py-4 border-b border-line bg-ink-2">
          <div className="font-mono text-[10px] text-t-3 uppercase tracking-widest">AUTHOR LOGIN</div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="font-mono text-[9px] text-t-4 uppercase tracking-wider block mb-1.5">EMAIL</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-ink-2 border border-line px-3 py-2.5 font-mono text-[13px] text-t-1 outline-none focus:border-amber transition-colors placeholder:text-t-4"
              placeholder="rahul@optionslab.in" />
          </div>
          <div>
            <label className="font-mono text-[9px] text-t-4 uppercase tracking-wider block mb-1.5">PASSWORD</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleLogin()}
              className="w-full bg-ink-2 border border-line px-3 py-2.5 font-mono text-[13px] text-t-1 outline-none focus:border-amber transition-colors placeholder:text-t-4"
              placeholder="••••••••" />
          </div>
          <button onClick={handleLogin} disabled={loading}
            className="w-full font-mono text-[11px] uppercase tracking-wider py-2.5 border border-amber text-amber hover:bg-amber hover:text-black transition-colors disabled:opacity-50">
            {loading ? 'SIGNING IN...' : '▶ SIGN IN'}
          </button>
          <p className="font-mono text-[9px] text-t-4 text-center">
            Default: rahul@optionslab.in / admin123
          </p>
        </div>
      </div>
    </div>
  )
}

