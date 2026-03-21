import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Clock, User, BookOpen, TrendingUp, Shield, BarChart2, Lightbulb, ArrowRight } from 'lucide-react'
import { articlesApi } from '../utils/api'

const FILTER_TABS = [
  { key: 'all',        label: 'ALL' },
  { key: 'options',    label: 'OPTIONS' },
  { key: 'derivatives',label: 'DERIVATIVES' },
  { key: 'strategy',   label: 'STRATEGIES' },
  { key: 'risk',       label: 'RISK MGMT' },
  { key: 'concepts',   label: 'CONCEPTS' },
]

const QUICK_LINKS = [
  { to: '/learn',    icon: Lightbulb,  label: 'Learn with AI',     desc: 'Ask any options question' },
  { to: '/glossary', icon: BookOpen,   label: 'Options Glossary',  desc: '30+ terms explained' },
  { to: '/analysis', icon: TrendingUp, label: 'Analysis',          desc: 'In-depth education' },
  { to: '/tools',    icon: BarChart2,  label: 'Tools',             desc: 'Calculators & reference' },
]

export default function HomePage() {
  const [activeFilter, setActiveFilter] = useState('all')

  const { data, isLoading } = useQuery({
    queryKey: ['articles', activeFilter],
    queryFn: () => articlesApi.list(
      activeFilter !== 'all'
        ? { category: activeFilter, status: 'published', limit: 20 }
        : { status: 'published', limit: 20 }
    ).then(r => r.data),
  })

  const articles = data?.articles || []
  const featured = articles[0]
  const rest = articles.slice(1)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Hero section */}
        <div className="mb-10">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-mono font-semibold mb-3 tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            OPTIONSLAB TERMINAL
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight mb-2">
            Financial Education<br />
            <span className="text-amber-400">for Derivatives Traders</span>
          </h1>
          <p className="text-zinc-500 text-sm max-w-lg">
            In-depth articles on options strategies, Greeks, risk management, and derivatives concepts.
            Educational content only — not investment advice.
          </p>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          {QUICK_LINKS.map(({ to, icon: Icon, label, desc }) => (
            <Link
              key={to}
              to={to}
              className="group bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-amber-500/30 hover:bg-zinc-900/80 transition-all"
            >
              <Icon size={18} className="text-amber-400 mb-2 group-hover:scale-110 transition-transform" />
              <p className="text-xs font-mono font-bold text-zinc-200 group-hover:text-amber-400 transition-colors">{label}</p>
              <p className="text-[11px] text-zinc-600 mt-0.5">{desc}</p>
            </Link>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 flex-wrap mb-6">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`px-3 py-1.5 rounded text-xs font-mono font-semibold tracking-widest transition-all ${
                activeFilter === tab.key
                  ? 'bg-amber-500 text-black'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-28 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : articles.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mb-6">
              <BookOpen size={28} className="text-amber-400" />
            </div>
            <h2 className="text-xl font-black text-white mb-2">No articles yet</h2>
            <p className="text-zinc-500 text-sm mb-6 max-w-xs">
              The first articles are being prepared. Check back soon, or explore the education tools below.
            </p>
            <div className="flex gap-3">
              <Link to="/learn" className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono rounded-lg transition-all">
                <Lightbulb size={13} /> LEARN WITH AI
              </Link>
              <Link to="/glossary" className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs font-mono rounded-lg transition-all">
                <BookOpen size={13} /> GLOSSARY
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main feed */}
            <div className="lg:col-span-2 space-y-4">
              {/* Featured article */}
              {featured && (
                <Link
                  to={`/article/${featured.slug}`}
                  className="group block bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-amber-500/30 transition-all"
                >
                  {featured.cover_image && (
                    <img src={featured.cover_image} alt="" className="w-full h-48 object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                  )}
                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                      {featured.category && (
                        <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] font-mono text-amber-500">
                          {featured.category.toUpperCase()}
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-zinc-700">FEATURED</span>
                    </div>
                    <h2 className="text-lg font-black text-zinc-100 group-hover:text-amber-400 transition-colors mb-2 leading-tight">
                      {featured.title}
                    </h2>
                    {featured.excerpt && (
                      <p className="text-sm text-zinc-500 line-clamp-2 mb-3">{featured.excerpt}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {featured.author_name && (
                          <span className="flex items-center gap-1 text-xs text-zinc-600 font-mono">
                            <User size={10} /> {featured.author_name}
                          </span>
                        )}
                        {featured.published_at && (
                          <span className="flex items-center gap-1 text-xs text-zinc-700 font-mono">
                            <Clock size={10} />
                            {new Date(featured.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                      <span className="flex items-center gap-1 text-xs text-amber-400 font-mono group-hover:gap-2 transition-all">
                        READ <ArrowRight size={11} />
                      </span>
                    </div>
                  </div>
                </Link>
              )}

              {/* Article list */}
              {rest.map((article: any) => (
                <Link
                  key={article.id}
                  to={`/article/${article.slug}`}
                  className="group flex gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-all"
                >
                  {article.cover_image && (
                    <img src={article.cover_image} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0 opacity-80" />
                  )}
                  <div className="flex-1 min-w-0">
                    {article.category && (
                      <span className="inline-block px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] font-mono text-amber-500 mb-1.5">
                        {article.category.toUpperCase()}
                      </span>
                    )}
                    <h3 className="text-sm font-bold text-zinc-200 group-hover:text-amber-400 transition-colors line-clamp-2 mb-1">
                      {article.title}
                    </h3>
                    {article.excerpt && (
                      <p className="text-xs text-zinc-600 line-clamp-1">{article.excerpt}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      {article.author_name && (
                        <span className="text-[10px] text-zinc-700 font-mono">{article.author_name}</span>
                      )}
                      {article.published_at && (
                        <span className="text-[10px] text-zinc-700 font-mono">
                          {new Date(article.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                      {article.read_time && (
                        <span className="text-[10px] text-zinc-700 font-mono">{article.read_time}m read</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* About box */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Shield size={14} className="text-amber-400" />
                  <span className="text-xs font-mono font-semibold text-zinc-400 tracking-widest">ABOUT THIS PLATFORM</span>
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed mb-3">
                  OptionsLab publishes in-depth educational content on options and derivatives trading for Indian markets.
                </p>
                <p className="text-[10px] text-zinc-700 font-mono leading-relaxed">
                  Not SEBI registered · Educational only · Not investment advice
                </p>
              </div>

              {/* Quick learn */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <p className="text-xs font-mono font-semibold text-zinc-400 tracking-widest mb-3">QUICK LEARN</p>
                <div className="space-y-2">
                  {[
                    'What is Delta?',
                    'How does Theta decay work?',
                    'What is an Iron Condor?',
                    'What is IV Percentile?',
                    'How to manage a losing trade?',
                  ].map(q => (
                    <Link
                      key={q}
                      to={`/learn`}
                      className="flex items-center gap-2 text-xs text-zinc-500 hover:text-amber-400 transition-colors py-1 group"
                    >
                      <ArrowRight size={10} className="text-zinc-700 group-hover:text-amber-400 shrink-0 transition-colors" />
                      {q}
                    </Link>
                  ))}
                </div>
                <Link
                  to="/learn"
                  className="mt-4 flex items-center justify-center gap-2 w-full py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 text-xs font-mono font-semibold hover:bg-amber-500/20 transition-all"
                >
                  <Lightbulb size={12} /> ASK AI TUTOR
                </Link>
              </div>

              {/* Glossary teaser */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <p className="text-xs font-mono font-semibold text-zinc-400 tracking-widest mb-3">OPTIONS GLOSSARY</p>
                <div className="space-y-1.5">
                  {['Delta', 'Theta', 'Iron Condor', 'PCR', 'Max Pain', 'IV Percentile'].map(term => (
                    <Link key={term} to="/glossary" className="block text-xs text-zinc-600 hover:text-zinc-300 font-mono transition-colors py-0.5">
                      → {term}
                    </Link>
                  ))}
                </div>
                <Link
                  to="/glossary"
                  className="mt-3 flex items-center gap-1 text-xs text-zinc-500 hover:text-amber-400 font-mono transition-colors"
                >
                  View all 30+ terms <ArrowRight size={10} />
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
