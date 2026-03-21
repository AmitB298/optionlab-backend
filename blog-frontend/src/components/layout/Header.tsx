import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Search, PenSquare, LogOut, User, Sun, Moon, X, BookOpen } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { articlesApi } from '../../utils/api'

const NAV_LINKS = [
  { to: '/',           label: 'TERMINAL' },
  { to: '/analysis',   label: 'ANALYSIS' },
  { to: '/tools',      label: 'TOOLS' },
  { to: '/learn',      label: 'LEARN' },
  { to: '/glossary',   label: 'GLOSSARY' },
  { to: '/authors',    label: 'AUTHORS' },
]

export default function Header() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const resp = await articlesApi.list({ search: query, limit: 6 })
        setResults(resp.data?.articles || [])
      } catch { setResults([]) }
      finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  function handleLogout() {
    logout()
    navigate('/')
  }

  function closeSearch() {
    setShowSearch(false)
    setQuery('')
    setResults([])
  }

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm">
        {/* Brand + Nav row */}
        <div className="flex items-center gap-6 px-4 h-14">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-2 shrink-0 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-content font-black text-white text-xs font-mono flex items-center justify-center">
              OL
            </div>
            <span className="font-black text-white tracking-tight text-base hidden sm:block">
              Options<span className="text-amber-400">Lab</span>
            </span>
          </Link>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-1 flex-1">
            {NAV_LINKS.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={`px-3 py-1.5 rounded text-xs font-mono font-semibold tracking-widest transition-all ${
                  isActive(to)
                    ? 'text-amber-400 bg-amber-400/10'
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setShowSearch(s => !s)}
              className="p-2 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
              aria-label="Search"
            >
              <Search size={16} />
            </button>

            <button
              onClick={() => setDark(d => !d)}
              className="p-2 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
              aria-label="Toggle theme"
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {user ? (
              <>
                {user.is_admin && (
                  <Link
                    to="/admin"
                    className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                  >
                    <User size={13} /> ADMIN
                  </Link>
                )}
                <Link
                  to="/write"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-black text-xs font-mono font-bold transition-all"
                >
                  <PenSquare size={13} /> WRITE
                </Link>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-all"
                  aria-label="Logout"
                >
                  <LogOut size={15} />
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-zinc-700 text-zinc-400 hover:border-amber-500/50 hover:text-amber-400 text-xs font-mono font-semibold transition-all"
              >
                SIGN IN
              </Link>
            )}
          </div>
        </div>

        {/* SEBI Disclaimer bar */}
        <div className="px-4 py-1.5 bg-zinc-900/80 border-t border-zinc-800/60">
          <p className="text-[10px] text-zinc-600 font-mono text-center leading-tight">
            <span className="text-amber-600/70 font-semibold">DISCLAIMER:</span>{' '}
            OptionsLab is a financial education platform. Content is for informational purposes only and does not constitute investment advice or recommendations.
            Not SEBI registered. Do not make investment decisions based on this content. Trading involves substantial risk of loss.
          </p>
        </div>
      </header>

      {/* Search overlay */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/60 backdrop-blur-sm" onClick={closeSearch}>
          <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
              <Search size={16} className="text-zinc-500 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search articles, concepts, strategies..."
                className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 outline-none font-mono"
              />
              <button onClick={closeSearch} className="text-zinc-600 hover:text-zinc-300 transition-colors">
                <X size={16} />
              </button>
            </div>
            {results.length > 0 && (
              <ul className="max-h-80 overflow-y-auto">
                {results.map((a: any) => (
                  <li key={a.id}>
                    <Link
                      to={`/article/${a.slug}`}
                      onClick={closeSearch}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-zinc-800 transition-colors group"
                    >
                      <BookOpen size={14} className="text-zinc-600 mt-0.5 shrink-0 group-hover:text-amber-400 transition-colors" />
                      <div>
                        <p className="text-sm text-zinc-200 font-medium group-hover:text-amber-400 transition-colors line-clamp-1">{a.title}</p>
                        {a.excerpt && <p className="text-xs text-zinc-600 mt-0.5 line-clamp-1">{a.excerpt}</p>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {query && !searching && results.length === 0 && (
              <p className="px-4 py-6 text-sm text-zinc-600 font-mono text-center">No articles found for "{query}"</p>
            )}
            {searching && (
              <p className="px-4 py-6 text-sm text-zinc-600 font-mono text-center animate-pulse">Searching...</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}

