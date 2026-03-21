import { useNavigate } from 'react-router-dom'
import { Eye, Heart, Clock, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface Tag { id: number; name: string; slug: string; color: string }

interface Article {
  id: number
  slug: string
  title: string
  excerpt: string
  cover_emoji: string
  author_name: string
  author_initials: string
  author_color: string
  author_role: string
  cat_name: string
  cat_slug: string
  cat_color: string
  sentiment: 'bullish' | 'bearish' | 'neutral'
  ai_score: number
  read_time_min: number
  views_count: number
  likes_count: number
  comments_count: number
  published_at: string
  tags: Tag[]
  featured?: boolean
}

interface Props {
  article: Article
  variant?: 'default' | 'compact' | 'hero'
}

const TAG_COLORS: Record<string, string> = {
  nifty:       'border-amber/40 text-amber',
  banknifty:   'border-cyan/30 text-cyan',
  options:     'border-purple/30 text-purple',
  'oi-analysis': 'border-amber/40 text-amber',
  macro:       'border-green/30 text-green',
  bullish:     'border-green/30 text-green',
  bearish:     'border-red/30 text-red',
  technicals:  'border-gold/30 text-gold',
  'ai-analysis': 'border-blue/30 text-blue bg-blue/5',
  iv:          'border-gold/30 text-gold',
  vix:         'border-red/30 text-red',
  'fii-dii':   'border-green/30 text-green',
  strategy:    'border-purple/30 text-purple',
  expiry:      'border-cyan/30 text-cyan',
}

function SentimentIcon({ s }: { s: string }) {
  if (s === 'bullish')  return <span className="text-green flex items-center gap-1 text-[10px] font-mono"><TrendingUp size={10} /> BULLISH</span>
  if (s === 'bearish')  return <span className="text-red   flex items-center gap-1 text-[10px] font-mono"><TrendingDown size={10} /> BEARISH</span>
  return <span className="text-amber flex items-center gap-1 text-[10px] font-mono"><Minus size={10} /> NEUTRAL</span>
}

export default function ArticleCard({ article, variant = 'default' }: Props) {
  const navigate = useNavigate()

  if (variant === 'compact') {
    return (
      <div
        onClick={() => navigate(`/article/${article.slug}`)}
        className="flex gap-3 px-4 py-3 border-b border-line hover:bg-ink-1 transition-colors cursor-pointer group"
      >
        <div className="w-8 h-8 bg-ink-2 border border-line flex items-center justify-center text-lg shrink-0">
          {article.cover_emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-sans font-semibold text-[13px] text-t-2 group-hover:text-amber line-clamp-2 leading-tight transition-colors">
            {article.title}
          </div>
          <div className="font-mono text-[9px] text-t-4 mt-1.5 flex gap-2">
            <span>{article.author_name}</span>
            <span>·</span>
            <span>{article.read_time_min}m</span>
            <span>·</span>
            <span className="flex items-center gap-1"><Eye size={8} /> {article.views_count.toLocaleString()}</span>
          </div>
        </div>
        <div className={`font-mono text-[10px] px-1.5 py-0.5 border self-start shrink-0 ${article.sentiment === 'bullish' ? 'border-green/30 text-green' : article.sentiment === 'bearish' ? 'border-red/30 text-red' : 'border-amber/30 text-amber'}`}>
          {article.ai_score}
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={() => navigate(`/article/${article.slug}`)}
      className="flex border-b border-line bg-ink hover:bg-ink-1 transition-colors cursor-pointer group relative"
    >
      {/* Left accent bar */}
      <div className="w-[3px] bg-transparent group-hover:bg-amber transition-colors shrink-0" />

      {/* Body */}
      <div className="flex-1 px-5 py-4">
        {/* Tags */}
        <div className="flex gap-1.5 flex-wrap mb-2.5">
          {article.tags?.slice(0, 4).map((tag) => (
            <span
              key={tag.id}
              className={`font-mono text-[8px] font-bold uppercase tracking-[1px] px-1.5 py-[3px] border ${TAG_COLORS[tag.slug] || 'border-line-2 text-t-3'}`}
            >
              {tag.name}
            </span>
          ))}
          <span className={`font-mono text-[10px] px-1.5 py-[2px] border ${article.sentiment === 'bullish' ? 'border-green/30 text-green' : article.sentiment === 'bearish' ? 'border-red/30 text-red' : 'border-amber/30 text-amber'}`}>
            AI {article.ai_score}
          </span>
        </div>

        {/* Title */}
        <h2 className="font-display font-bold text-[16px] leading-snug text-t-1 mb-2 group-hover:text-amber transition-colors line-clamp-2">
          {article.title}
        </h2>

        {/* Excerpt */}
        <p className="font-sans font-light text-xs text-t-2 leading-relaxed line-clamp-2 mb-3">
          {article.excerpt}
        </p>

        {/* Meta */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center font-mono font-bold text-[8px] text-black"
              style={{ background: article.author_color }}
            >
              {article.author_initials}
            </div>
            <span className="font-sans text-xs text-t-3">{article.author_name}</span>
          </div>
          <span className="font-mono text-[10px] text-t-4">
            {article.published_at
              ? formatDistanceToNow(new Date(article.published_at), { addSuffix: true })
              : '—'}
          </span>
          <span className="flex items-center gap-1 font-mono text-[10px] text-t-4"><Clock size={9} /> {article.read_time_min}m</span>
          <span className="flex items-center gap-1 font-mono text-[10px] text-t-4"><Eye size={9} /> {article.views_count.toLocaleString()}</span>
          <span className="flex items-center gap-1 font-mono text-[10px] text-t-4"><Heart size={9} /> {article.likes_count}</span>
          <SentimentIcon s={article.sentiment} />
        </div>
      </div>

      {/* Thumb */}
      <div className="w-24 flex items-center justify-center border-l border-line bg-ink-1 text-3xl shrink-0">
        {article.cover_emoji}
      </div>
    </div>
  )
}


