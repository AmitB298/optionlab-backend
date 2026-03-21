import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Search, PenSquare, LogOut, User, Sun, Moon } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { articlesApi } from '../../utils/api'

const TICKER_DATA = [
  { sym: 'NIFTY 50',    val: '22,347', chg: '-68.4',  pct: '-0.31', dir: 'dn' as const },
  { sym: 'BANKNIFTY',   val: '47,984', chg: '+124.8', pct: '+0.26', dir: 'up' as const },
  { sym: 'FINNIFTY',    val: '23,108', chg: '-42.2',  pct: '-0.18', dir: 'dn' as const },
  { sym: 'INDIA VIX',   val: '14.32',  chg: '+0.84',  pct: '+6.23', dir: 'up' as const },
  { sym: 'USDINR',      val: '83.42',  chg: '+0.08',  pct: '+0.10', dir: 'up' as const },
  { sym: 'GOLD (MCX)',  val: '71,840', chg: '+220',   pct: '+0.31', dir: 'up' as const },
  { sym: 'SENSEX',      val: '73,428', chg: '-194',   pct: '-0.26', dir: 'dn' as const },
  { sym: 'CRUDE (MCX)', val: '6,842',  chg: '+62',    pct: '+0.92', dir: 'up' as const },
]

const MARKET_STRIP = TICKER_DATA.slice(0, 5)

const NAV_LINKS = [
  { to: '/',          label: 'TERMINAL' },
  { to: '/analysis',  label: 'OPTIONSLAB BOT' },
  { to: '/tools',     label: 'TOOLS' },
  { to: '/authors',   label: 'AUTHORS' },
]

export default function Header() {
  const { isAuthenticated, user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)
  const [dark, setDark] = useState(true)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true) }
      if (e.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  return (
    <>
      {/* LIVE TICKER */}
      <div className="bg-ink-1 border-b border-line h-7 overflow-hidden flex items-center">
        <div className="bg-amber text-black font-mono font-bold text-[9px] tracking-widest px-3 h-full flex items-center shrink-0 uppercase">
          LIVE
        </div>
        <div className="overflow-hidden flex-1">
          <div className="flex animate-ticker w-max gap-0">
            {[...TICKER_DATA, ...TICKER_DATA].map((item, i) => (
              <div key={i} className="flex items-center gap-2 px-5 border-r border-line h-7 font-mono text-[11px] whitespace-nowrap">
                <span className="text-amber font-semibold">{item.sym}</span>
                <span className="text-t-1">{item.val}</span>
                <span className={item.dir === 'up' ? 'text-green' : 'text-red'}>
                  {item.dir === 'up' ? '▲' : '▼'} {item.chg} ({item.pct}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-40 bg-ink/97 backdrop-blur-sm border-b border-line">
        {/* ROW 1: Logo + Market Strip + Actions */}
        <div className="flex items-center h-[52px] border-b border-line">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-0 px-4 border-r border-line h-full shrink-0">
            <div className="w-8 h-8 border border-amber flex items-center justify-center font-mono font-bold text-[11px] text-amber relative mr-2.5">
              <span className="absolute inset-[3px] border border-amber/20" />
              OL
            </div>
            <div>
              <div className="font-sans font-bold text-[15px] text-t-1 leading-none">
                Options<span className="text-amber">Lab</span>
              </div>
              <div className="font-mono text-[8px] text-t-3 tracking-widest mt-0.5 uppercase">
                Market Intelligence
              </div>
            </div>
          </Link>

          {/* Market Strip */}
          <div className="flex flex-1 overflow-hidden">
            {MARKET_STRIP.map((item) => (
              <div key={item.sym} className="flex items-center gap-2 px-4 border-r border-line h-[52px] min-w-[130px] flex-1">
                <div>
                  <div className="font-mono text-[9px] text-t-3 uppercase tracking-wider leading-none">{item.sym}</div>
                  <div className="font-mono font-semibold text-[15px] text-t-1 leading-tight mt-0.5">{item.val}</div>
                  <div className={`font-mono text-[11px] ${item.dir === 'up' ? 'text-green' : 'text-red'}`}>
                    {item.dir === 'up' ? '▲' : '▼'} {item.chg} ({item.pct}%)
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 px-4 border-l border-line h-full shrink-0">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-8 h-8 border border-line-2 flex items-center justify-center text-t-2 hover:border-amber hover:text-amber transition-colors"
              title="Search [Ctrl+K]"
            >
              <Search size={14} />
            </button>
            <button
              onClick={() => setDark(!dark)}
              className="w-8 h-8 border border-line-2 flex items-center justify-center text-t-2 hover:border-amber hover:text-amber transition-colors font-mono text-[9px]"
            >
              {dark ? <Moon size={13} /> : <Sun size={13} />}
            </button>
            {isAuthenticated ? (
              <>
                <button
                  onClick={() => navigate('/admin')}
                  className="flex items-center gap-1.5 px-3 h-8 border border-t-3 text-t-3 hover:border-amber hover:text-amber font-mono text-[10px] uppercase tracking-wider transition-colors"
                >
                  <User size={11} /> {user?.initials}
                </button>
                <button
                  onClick={logout}
                  className="flex items-center gap-1.5 px-3 h-8 border border-line text-t-3 hover:border-red hover:text-red font-mono text-[10px] transition-colors"
                >
                  <LogOut size={11} />
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="flex items-center gap-1.5 px-3 h-8 border border-t-4 text-t-3 hover:border-amber hover:text-amber font-mono text-[10px] uppercase tracking-wider transition-colors"
              >
                SIGN IN
              </Link>
            )}
            <Link
              to="/admin/editor"
              className="flex items-center gap-1.5 px-4 h-8 border border-amber text-amber hover:bg-amber hover:text-black font-mono text-[10px] uppercase tracking-wider transition-colors"
            >
              <PenSquare size={11} /> WRITE
            </Link>
          </div>
        </div>

        {/* ROW 2: Navigation */}
        <div className="flex items-center h-9 overflow-x-auto scrollbar-hide">
          {NAV_LINKS.map((link) => {
            const active = location.pathname === link.to
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`flex items-center gap-1.5 px-5 h-9 font-mono text-[11px] uppercase tracking-[0.8px] border-r border-line border-b-2 whitespace-nowrap transition-all
                  ${active
                    ? 'text-amber border-b-amber bg-amber/5'
                    : 'text-t-3 border-b-transparent hover:text-t-2 hover:bg-ink-2'
                  }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-amber shadow-[0_0_6px_#ff9f0a]' : 'bg-current opacity-40'}`} />
                {link.label}
                {link.to === '/analysis' && (
                  <span className="bg-red text-white font-mono font-bold text-[8px] px-1.5 py-0.5 tracking-wider animate-blink">AI</span>
                )}
              </Link>
            )
          })}
          {isAuthenticated && (
            <Link
              to="/admin"
              className={`flex items-center gap-1.5 px-5 h-9 font-mono text-[11px] uppercase tracking-[0.8px] border-r border-line border-b-2 whitespace-nowrap transition-all
                ${location.pathname.startsWith('/admin')
                  ? 'text-amber border-b-amber bg-amber/5'
                  : 'text-t-3 border-b-transparent hover:text-t-2 hover:bg-ink-2'
                }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />
              ADMIN
            </Link>
          )}
        </div>
      </header>

      {/* SEARCH OVERLAY */}
      {searchOpen && (
        <div className="fixed inset-0 bg-ink/90 z-50 flex items-start justify-center pt-28" onClick={() => setSearchOpen(false)}>
          <SearchBox onClose={() => setSearchOpen(false)} />
        </div>
      )}
    </>
  )
}

function SearchBox({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const [results, setResults] = useState<{ title: string; slug: string; emoji: string; author_name: string }[]>([])

  useEffect(() => {
    if (!q.trim()) { setResults([]); return }
    const timer = setTimeout(async () => {
      try {
        const resp = await articlesApi.list({ search: q, limit: 6 })
        setResults(resp.data.articles || [])
      } catch { setResults([]) }
    }, 300)
    return () => clearTimeout(timer)
  }, [q])

  return (
    <div className="bg-ink-1 border border-line-2 w-[580px] max-w-[90vw] animate-fade-up" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-3 px-4 border-b border-line h-12">
        <Search size={16} className="text-amber shrink-0" />
        <input
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search articles, symbols, strategies..."
          className="flex-1 bg-transparent border-none outline-none font-mono text-sm text-t-1 placeholder:text-t-4"
        />
        <button onClick={onClose} className="text-t-3 hover:text-t-1 font-mono text-lg leading-none">×</button>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {results.length === 0 && q && (
          <div className="px-4 py-6 text-center font-mono text-[11px] text-t-4">No results for "{q}"</div>
        )}
        {results.map((r) => (
          <button
            key={r.slug}
            onClick={() => { navigate(`/article/${r.slug}`); onClose() }}
            className="w-full flex items-center gap-3 px-4 py-3 border-b border-line hover:bg-ink-2 text-left transition-colors"
          >
            <span className="text-xl">{r.emoji || '📊'}</span>
            <div>
              <div className="font-sans font-semibold text-sm text-t-2">{r.title}</div>
              <div className="font-mono text-[9px] text-t-4 mt-1">{r.author_name}</div>
            </div>
          </button>
        ))}
      </div>
      <div className="flex gap-4 px-4 py-2 border-t border-line font-mono text-[9px] text-t-4">
        <span>↑↓ NAVIGATE</span><span>↵ SELECT</span><span>ESC CLOSE</span>
      </div>
    </div>
  )
}



