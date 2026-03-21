import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BookOpen, Clock, User, TrendingUp, AlertTriangle } from 'lucide-react'
import { articlesApi } from '../utils/api'

const ANALYSIS_CATEGORIES = [
  { id: 'all',           label: 'All Analysis' },
  { id: 'options',       label: 'Options Education' },
  { id: 'derivatives',   label: 'Derivatives' },
  { id: 'risk',          label: 'Risk Management' },
  { id: 'strategy',      label: 'Strategies' },
  { id: 'concepts',      label: 'Concepts' },
]

export default function AnalysisPage() {
  const [activeCategory, setActiveCategory] = useState('all')

  const { data, isLoading } = useQuery({
    queryKey: ['analysis-articles', activeCategory],
    queryFn: () => articlesApi.list({
      category: activeCategory === 'all' ? undefined : activeCategory,
      status: 'published',
      limit: 20,
    }).then(r => r.data),
  })

  const articles = data?.articles || []

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-mono font-semibold mb-3 tracking-widest">
            <TrendingUp size={14} />
            EDUCATIONAL ANALYSIS
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight mb-2">Analysis & Education</h1>
          <p className="text-zinc-500 text-sm max-w-xl">
            In-depth educational articles on options strategies, derivatives concepts, and market mechanics.
          </p>
        </div>

        {/* SEBI disclaimer */}
        <div className="flex gap-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl mb-6">
          <AlertTriangle size={14} className="text-amber-500/60 shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-600 font-mono leading-relaxed">
            All articles are for educational purposes only. No content constitutes investment advice,
            trading recommendations, or specific security analysis. Not SEBI registered.
          </p>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 flex-wrap mb-8">
          {ANALYSIS_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
                activeCategory === cat.id
                  ? 'bg-amber-500 text-black'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Articles */}
        {isLoading ? (
          <div className="grid gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-28 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen size={32} className="text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-500 font-mono text-sm">No articles in this category yet.</p>
            <p className="text-zinc-700 font-mono text-xs mt-1">Check back soon — new content is published regularly.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {articles.map((article: any) => (
              <Link
                key={article.id}
                to={`/article/${article.slug}`}
                className="group bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {article.category && (
                      <span className="inline-block px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] font-mono text-amber-500 mb-2">
                        {article.category}
                      </span>
                    )}
                    <h2 className="text-base font-bold text-zinc-100 group-hover:text-amber-400 transition-colors line-clamp-2 mb-1">
                      {article.title}
                    </h2>
                    {article.excerpt && (
                      <p className="text-sm text-zinc-500 line-clamp-2">{article.excerpt}</p>
                    )}
                  </div>
                  {article.cover_image && (
                    <img src={article.cover_image} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0 opacity-80" />
                  )}
                </div>
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-zinc-800">
                  {article.author_name && (
                    <span className="flex items-center gap-1.5 text-xs text-zinc-600 font-mono">
                      <User size={11} /> {article.author_name}
                    </span>
                  )}
                  {article.published_at && (
                    <span className="flex items-center gap-1.5 text-xs text-zinc-700 font-mono">
                      <Clock size={11} /> {new Date(article.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                  {article.read_time && (
                    <span className="text-xs text-zinc-700 font-mono">{article.read_time} min read</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
