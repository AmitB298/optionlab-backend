import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { articlesApi, aiApi } from '../utils/api'
import ArticleCard from '../components/blog/ArticleCard'
import { VixWidget, OptionsChainWidget, TrendingWidget, NewsletterWidget } from '../components/blog/Sidebar'

const FILTER_TABS = [
  { key: 'all',        label: 'ALL' },
  { key: 'nifty',     label: 'NIFTY' },
  { key: 'banknifty', label: 'BANKNIFTY' },
  { key: 'options',   label: 'OPTIONS' },
  { key: 'macro',     label: 'MACRO' },
  { key: 'technicals',label: 'TECHNICALS' },
  { key: 'briefing',  label: 'AI BRIEFS' },
]

const TRENDING_ITEMS = [
  { title: 'NIFTY 22,500 CE — 45L OI Buildup Analysis',  views: '12.4k', change: '+2.4%', dir: 'up'  as const, slug: '' },
  { title: 'RBI Policy Preview: Rate Hold Expected',       views: '9.8k',  change: '-0.3%', dir: 'dn'  as const, slug: '' },
  { title: 'BANKNIFTY Expiry Pin Dissected',               views: '8.1k',  change: '+0.8%', dir: 'up'  as const, slug: '' },
  { title: 'VIX Spike: What the Market Is Telling You',   views: '6.4k',  change: '+6.2%', dir: 'up'  as const, slug: '' },
  { title: 'FII Net Long Index Futures: Full Analysis',    views: '5.2k',  change: '+1.1%', dir: 'up'  as const, slug: '' },
]

export default function HomePage() {
  const [activeFilter, setActiveFilter] = useState('all')
  const [briefing, setBriefing] = useState<{ title?: string; body?: string } | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [heroQuestion, setHeroQuestion] = useState('')
  const [heroAnswer, setHeroAnswer] = useState('')
  const [heroLoading, setHeroLoading] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['articles', activeFilter],
    queryFn: () => articlesApi.list(activeFilter !== 'all' ? { cat: activeFilter, limit: 20 } : { limit: 20 }).then(r => r.data),
  })

  useEffect(() => { loadBriefing() }, [])

  const loadBriefing = async () => {
    setBriefingLoading(true)
    try {
      // Try to get existing briefing first
      const { data: existing } = await aiApi.getBriefing()
      if (existing) { setBriefing(existing); return }
      // Generate if none exists
      const { data: generated } = await aiApi.briefing()
      setBriefing(generated)
    } catch {
      setBriefing({ body: 'NIFTY consolidates below the critical 22,500 CE resistance wall. The 45.2 lakh call concentration at 22,500 remains the primary overhead pressure — bulls need a decisive close above this level with volume to shift the structure. BANKNIFTY shows relative strength, trading above its own max pain level of 47,900 ahead of weekly expiry. India VIX at 14.3 suggests moderate fear — elevated for the current spot level.\n\nWatch Level: 22,500 CE max OI wall. Break above on volume = bullish trigger. Break below 22,180 = bearish confirmation.' })
    } finally {
      setBriefingLoading(false)
    }
  }

  const askHero = async () => {
    if (!heroQuestion.trim() || heroLoading) return
    setHeroLoading(true)
    setHeroAnswer('')
    try {
      const { data } = await aiApi.chat({ question: heroQuestion })
      setHeroAnswer(data.response)
    } catch {
      setHeroAnswer('AI service unavailable. Please check ANTHROPIC_API_KEY in backend .env')
    } finally {
      setHeroLoading(false)
    }
  }

  return (
    <div>
      {/* SENTIMENT ROW */}
      <div className="grid grid-cols-4 border-b border-line bg-line gap-px">
        {[
          { label: 'NIFTY SENTIMENT',  val: 'BEARISH',  color: 'text-red',   pct: 35, sub: 'PCR 0.73 · Rising call OI' },
          { label: 'BANKNIFTY',         val: 'NEUTRAL',  color: 'text-amber', pct: 55, sub: 'Max pain 47,900 · Flat OI' },
          { label: 'MARKET BREADTH',    val: 'NEGATIVE', color: 'text-red',   pct: 32, sub: 'Adv 624 · Dec 1,218' },
          { label: 'AI CONFIDENCE',     val: '72/100',   color: 'text-cyan',  pct: 72, sub: 'Model updated 08:31 IST' },
        ].map((s) => (
          <div key={s.label} className="bg-ink-1 px-4 py-3">
            <div className="font-mono text-[9px] text-t-3 uppercase tracking-wider mb-1.5">{s.label}</div>
            <div className="h-1 bg-ink-3 mb-1.5">
              <div className={`h-full transition-all duration-1000 ${s.color.replace('text-', 'bg-')}`} style={{ width: `${s.pct}%` }} />
            </div>
            <div className={`font-mono font-semibold text-[15px] leading-none ${s.color}`}>{s.val}</div>
            <div className="font-mono text-[9px] text-t-4 mt-1">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_300px] bg-line gap-px">
        {/* MAIN */}
        <div className="bg-ink flex flex-col">
          {/* AI BRIEFING HERO */}
          <div className="bg-ink-1 border-b border-line p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-full bg-gradient-to-l from-cyan/5 to-transparent pointer-events-none" />
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-cyan animate-pulse-glow" />
              <span className="font-mono text-[9px] text-cyan uppercase tracking-[2px]">AI Morning Briefing</span>
              <span className="font-mono text-[9px] text-t-4 ml-auto">
                {new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })} · 08:30 IST
              </span>
            </div>

            <h1 className="font-display font-bold text-[24px] leading-tight text-t-1 mb-3 max-w-2xl">
              NIFTY Faces <em className="text-amber not-italic">Critical Resistance</em> at 22,500 — OI Data Signals Distribution Phase
            </h1>

            {briefingLoading ? (
              <div className="flex items-center gap-2 font-mono text-[12px] text-t-4 mb-4">
                <RefreshCw size={12} className="animate-spin" /> Generating AI briefing...
              </div>
            ) : (
              <div className="font-sans font-light text-[13px] text-t-2 leading-relaxed mb-4 max-w-2xl whitespace-pre-line">
                {briefing?.body || 'Loading briefing...'}
              </div>
            )}

            <div className="flex gap-2 mb-4 flex-wrap">
              {[
                { label: '▲ BULL CASE: 22,520+ breakout', cls: 'border-green/30 text-green' },
                { label: '▼ BEAR CASE: Close below 22,180', cls: 'border-red/30 text-red' },
                { label: '→ KEY LEVEL: 22,500 CE MAX OI', cls: 'border-amber/30 text-amber' },
              ].map(b => (
                <span key={b.label} className={`font-mono text-[10px] px-2.5 py-1 border ${b.cls}`}>{b.label}</span>
              ))}
              <button
                onClick={loadBriefing}
                disabled={briefingLoading}
                className="font-mono text-[10px] px-2.5 py-1 border border-line-2 text-t-3 hover:border-amber hover:text-amber transition-colors ml-auto flex items-center gap-1"
              >
                <RefreshCw size={9} className={briefingLoading ? 'animate-spin' : ''} /> REFRESH
              </button>
            </div>

            {/* Ask AI inline */}
            <div className="flex gap-0 max-w-xl">
              <input
                value={heroQuestion}
                onChange={e => setHeroQuestion(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && askHero()}
                placeholder="Ask the AI: What does today's PCR of 0.72 mean for NIFTY?"
                className="flex-1 bg-ink-2 border border-line-2 border-r-0 px-3 py-2.5 font-mono text-[12px] text-t-1 outline-none placeholder:text-t-4 focus:border-amber transition-colors"
              />
              <button
                onClick={askHero}
                disabled={heroLoading}
                className="px-4 border border-amber text-amber hover:bg-amber hover:text-black font-mono text-[10px] uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {heroLoading ? <RefreshCw size={11} className="animate-spin" /> : '▶'} ANALYZE
              </button>
            </div>
            {heroAnswer && (
              <div className="mt-3 bg-ink-2 border border-line border-l-2 border-l-cyan px-4 py-3 font-sans font-light text-[13px] text-t-2 leading-relaxed max-w-2xl whitespace-pre-wrap">
                {heroAnswer}
              </div>
            )}
          </div>

          {/* FILTER TABS */}
          <div className="flex overflow-x-auto bg-ink-1 border-b border-line">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.8px] border-r border-line border-b-2 whitespace-nowrap transition-all
                  ${activeFilter === tab.key
                    ? 'text-amber border-b-amber bg-amber/5'
                    : 'text-t-3 border-b-transparent hover:text-t-2 hover:bg-ink-2'}`}
              >
                {tab.label}
                <span className="ml-1.5 bg-ink-3 font-mono text-[9px] px-1 text-t-4">
                  {tab.key === 'all' ? data?.total || 0 : data?.articles?.filter((a: any) => a.cat_slug === tab.key).length || ''}
                </span>
              </button>
            ))}
          </div>

          {/* ARTICLES */}
          {isLoading ? (
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="flex border-b border-line bg-ink animate-pulse">
                <div className="w-[3px] bg-transparent" />
                <div className="flex-1 px-5 py-4 space-y-2">
                  <div className="h-3 bg-ink-3 rounded w-1/4" />
                  <div className="h-5 bg-ink-3 rounded w-3/4" />
                  <div className="h-3 bg-ink-3 rounded w-full" />
                  <div className="h-3 bg-ink-3 rounded w-2/3" />
                </div>
                <div className="w-24 bg-ink-1 border-l border-line" />
              </div>
            ))
          ) : (
            data?.articles?.map((article: any) => (
              <ArticleCard key={article.id} article={article} />
            ))
          )}
        </div>

        {/* SIDEBAR */}
        <div className="bg-ink flex flex-col">
          <VixWidget />
          <OptionsChainWidget />
          <TrendingWidget items={TRENDING_ITEMS} />
          <NewsletterWidget />
        </div>
      </div>
    </div>
  )
}

