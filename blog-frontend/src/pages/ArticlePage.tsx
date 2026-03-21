import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Eye, Heart, Clock, Share2, MessageSquare, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { articlesApi, commentsApi } from '../utils/api'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import ArticleCard from '../components/blog/ArticleCard'

export default function ArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [progress, setProgress] = useState(0)
  const [liked, setLiked] = useState(false)
  const [likesCount, setLikesCount] = useState(0)
  const [commentName, setCommentName] = useState('')
  const [commentEmail, setCommentEmail] = useState('')
  const [commentBody, setCommentBody] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)

  const { data: article, isLoading, isError } = useQuery({
    queryKey: ['article', slug],
    queryFn: () => articlesApi.bySlug(slug!).then(r => r.data),
    enabled: !!slug,
  })

  const { data: comments = [], refetch: refetchComments } = useQuery({
    queryKey: ['comments', article?.id],
    queryFn: () => commentsApi.list(article!.id).then(r => r.data),
    enabled: !!article?.id,
  })

  const { data: related = [] } = useQuery({
    queryKey: ['related', article?.cat_slug],
    queryFn: () => articlesApi.list({ cat: article!.cat_slug, limit: 4 }).then(r =>
      r.data.articles.filter((a: any) => a.id !== article?.id).slice(0, 3)
    ),
    enabled: !!article?.cat_slug,
  })

  useEffect(() => {
    if (article) setLikesCount(article.likes_count || 0)
  }, [article])

  useEffect(() => {
    const onScroll = () => {
      const el = document.getElementById('article-body')
      if (!el) return
      const rect = el.getBoundingClientRect()
      const total = el.offsetHeight - window.innerHeight
      setProgress(Math.min(100, Math.max(0, (-rect.top / total) * 100)))
    }
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleLike = async () => {
    if (liked || !article) return
    setLiked(true)
    setLikesCount(c => c + 1)
    try { await articlesApi.like(article.slug) } catch { /* silent */ }
  }

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href)
    toast.success('Link copied to clipboard!')
  }

  const submitComment = async () => {
    if (!commentName || !commentBody) { toast.error('Name and comment are required'); return }
    if (!article) return
    setSubmittingComment(true)
    try {
      await commentsApi.create(article.id, { author_name: commentName, author_email: commentEmail, body: commentBody })
      toast.success('Comment posted!')
      setCommentBody('')
      refetchComments()
    } catch {
      toast.error('Failed to post comment. Please try again.')
    } finally {
      setSubmittingComment(false)
    }
  }

  if (isLoading) return (
    <div className="max-w-4xl mx-auto px-6 py-12 animate-pulse space-y-4">
      <div className="h-4 bg-ink-2 rounded w-1/4" />
      <div className="h-8 bg-ink-2 rounded w-3/4" />
      <div className="h-4 bg-ink-2 rounded w-full" />
      <div className="h-4 bg-ink-2 rounded w-2/3" />
    </div>
  )

  if (isError || !article) return (
    <div className="text-center py-24 font-mono text-t-4">
      <div className="text-4xl mb-4">404</div>
      <div>Article not found</div>
      <button onClick={() => navigate('/')} className="mt-4 font-mono text-[11px] text-amber border border-amber/30 px-4 py-2 hover:bg-amber hover:text-black transition-colors">
        ← BACK TO TERMINAL
      </button>
    </div>
  )

  return (
    <>
      {/* Reading progress */}
      <div className="fixed top-[88px] left-0 right-0 h-[2px] bg-ink-2 z-30">
        <div className="h-full bg-gradient-to-r from-amber to-cyan transition-all duration-100" style={{ width: `${progress}%` }} />
      </div>

      <div className="grid grid-cols-[1fr_280px] bg-line gap-px">
        {/* MAIN */}
        <div className="bg-ink">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-6 py-3 border-b border-line bg-ink-1 font-mono text-[10px] text-t-3 uppercase tracking-wider hover:text-amber transition-colors w-full"
          >
            ← BACK TO TERMINAL
          </button>

          <div className="px-10 py-8 max-w-3xl" id="article-body">
            {/* Tags */}
            <div className="flex gap-1.5 flex-wrap mb-4">
              {article.tags?.map((tag: any) => (
                <span key={tag.id} className="font-mono text-[8px] font-bold uppercase tracking-[1px] px-1.5 py-[3px] border border-line-2 text-t-3">
                  {tag.name}
                </span>
              ))}
              <span className={`font-mono text-[10px] px-1.5 py-[2px] border ${article.sentiment === 'bullish' ? 'border-green/30 text-green' : article.sentiment === 'bearish' ? 'border-red/30 text-red' : 'border-amber/30 text-amber'}`}>
                AI SCORE: {article.ai_score}/100
              </span>
            </div>

            {/* Title */}
            <h1 className="font-display font-bold text-[32px] leading-tight text-t-1 mb-4">{article.title}</h1>

            {/* Subtitle */}
            {article.subtitle && (
              <div className="border-l-2 border-amber pl-4 mb-6 font-sans font-light text-[15px] text-t-2 leading-relaxed">
                {article.subtitle}
              </div>
            )}

            {/* Meta bar */}
            <div className="flex border border-line bg-ink-1 mb-8 text-[10px] font-mono flex-wrap">
              <div className="flex items-center gap-2 px-4 py-2.5 border-r border-line">
                <div className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-[9px] text-black" style={{ background: article.author_color }}>
                  {article.author_initials}
                </div>
                <div>
                  <div className="text-t-2 font-medium">{article.author_name}</div>
                  <div className="text-t-4 text-[9px]">{article.author_role}</div>
                </div>
              </div>
              <div className="flex items-center gap-1 px-4 py-2.5 border-r border-line text-t-3">
                <Clock size={9} /> {article.read_time_min} min read
              </div>
              <div className="flex items-center gap-1 px-4 py-2.5 border-r border-line text-t-3">
                <Eye size={9} /> {article.views_count?.toLocaleString()} views
              </div>
              <div className="flex items-center gap-1 px-4 py-2.5 border-r border-line text-t-3">
                <MessageSquare size={9} /> {comments.length} comments
              </div>
              <div className="px-4 py-2.5 text-t-4 ml-auto">
                {article.published_at ? formatDistanceToNow(new Date(article.published_at), { addSuffix: true }) : '—'}
              </div>
            </div>

            {/* Body */}
            <div className="prose-terminal">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {article.body_markdown}
              </ReactMarkdown>
            </div>

            {/* Share row */}
            <div className="flex items-center gap-2 py-5 border-t border-line mt-8 flex-wrap">
              <span className="font-mono text-[9px] text-t-4 uppercase tracking-[1.5px] mr-2">SHARE:</span>
              <button onClick={handleShare} className="flex items-center gap-1.5 font-mono text-[10px] px-3 py-1.5 border border-line text-t-3 hover:border-amber hover:text-amber transition-colors">
                <Share2 size={10} /> COPY LINK
              </button>
              <button onClick={() => toast.success('Shared to Twitter!')} className="font-mono text-[10px] px-3 py-1.5 border border-line text-t-3 hover:border-amber hover:text-amber transition-colors">𝕏 TWITTER</button>
              <button onClick={() => toast.success('Shared to Telegram!')} className="font-mono text-[10px] px-3 py-1.5 border border-line text-t-3 hover:border-cyan hover:text-cyan transition-colors">TELEGRAM</button>
              <button onClick={() => toast.success('Shared to WhatsApp!')} className="font-mono text-[10px] px-3 py-1.5 border border-line text-t-3 hover:border-green hover:text-green transition-colors">WHATSAPP</button>
              <button
                onClick={handleLike}
                className={`flex items-center gap-1.5 font-mono text-[10px] px-3 py-1.5 border ml-auto transition-colors
                  ${liked ? 'border-red/40 text-red bg-red/5' : 'border-line text-t-3 hover:border-red hover:text-red'}`}
              >
                <Heart size={10} fill={liked ? 'currentColor' : 'none'} /> {likesCount}
              </button>
            </div>
          </div>

          {/* COMMENTS */}
          <div className="px-10 py-8 border-t border-line">
            <div className="font-mono text-[10px] text-t-3 uppercase tracking-widest mb-5 flex items-center gap-2">
              <span className="w-[2px] h-3 bg-amber inline-block" />DISCUSSION ({comments.length})
            </div>

            {/* Comment form */}
            <div className="bg-ink-1 border border-line p-4 mb-6">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="font-mono text-[9px] text-t-4 uppercase tracking-wider block mb-1">YOUR NAME *</label>
                  <input value={commentName} onChange={e => setCommentName(e.target.value)} className="w-full bg-ink-2 border border-line px-3 py-2 font-sans text-[13px] text-t-1 outline-none focus:border-amber transition-colors placeholder:text-t-4" placeholder="Trader name" />
                </div>
                <div>
                  <label className="font-mono text-[9px] text-t-4 uppercase tracking-wider block mb-1">EMAIL (OPTIONAL)</label>
                  <input value={commentEmail} onChange={e => setCommentEmail(e.target.value)} className="w-full bg-ink-2 border border-line px-3 py-2 font-sans text-[13px] text-t-1 outline-none focus:border-amber transition-colors placeholder:text-t-4" placeholder="email@example.com" />
                </div>
              </div>
              <textarea
                value={commentBody}
                onChange={e => setCommentBody(e.target.value)}
                className="w-full bg-ink-2 border border-line px-3 py-2 font-sans text-[13px] text-t-1 outline-none focus:border-amber transition-colors min-h-[80px] resize-none placeholder:text-t-4 block mb-3"
                placeholder="Share your market view or ask a question about this analysis..."
              />
              <button
                onClick={submitComment}
                disabled={submittingComment}
                className="font-mono text-[10px] px-4 py-2 border border-amber text-amber hover:bg-amber hover:text-black transition-colors disabled:opacity-50"
              >
                {submittingComment ? 'POSTING...' : '▶ POST COMMENT'}
              </button>
            </div>

            {/* Comments list */}
            <div className="space-y-0">
              {comments.map((c: any) => (
                <div key={c.id} className="flex gap-3 py-4 border-b border-line">
                  <div className="w-8 h-8 bg-ink-3 border border-line flex items-center justify-center font-mono font-bold text-[11px] text-amber shrink-0">
                    {c.author_name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-sans font-semibold text-[13px] text-t-2">{c.author_name}</span>
                      <span className="font-mono text-[9px] text-t-4">
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="font-sans font-light text-[13px] text-t-2 leading-relaxed">{c.body}</p>
                    <button
                      onClick={() => commentsApi.like(c.id).then(() => refetchComments())}
                      className="font-mono text-[10px] text-t-4 hover:text-amber transition-colors mt-2 flex items-center gap-1"
                    >
                      <Heart size={9} /> {c.likes_count} · Reply
                    </button>
                  </div>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="font-mono text-[11px] text-t-4 py-4 text-center">No comments yet. Be the first to share your view.</p>
              )}
            </div>
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="bg-ink border-l border-line">
          <div className="sticky top-[88px]">
            <div className="px-4 py-3 border-b border-line bg-ink-1">
              <span className="font-mono text-[10px] text-t-3 uppercase tracking-widest flex items-center gap-2">
                <span className="w-[2px] h-3 bg-amber inline-block" />RELATED ANALYSIS
              </span>
            </div>
            {related.map((r: any) => (
              <ArticleCard key={r.id} article={r} variant="compact" />
            ))}

            <div className="p-4 border-t border-line">
              <div className="font-display font-bold text-[13px] mb-2 text-t-1">Get This Analysis Daily</div>
              <p className="font-sans font-light text-[11px] text-t-3 leading-relaxed mb-3">AI-generated pre-market briefs every trading day at 8:30 AM IST.</p>
              <input type="email" className="w-full bg-ink-2 border border-line px-3 py-2 font-mono text-[12px] text-t-1 outline-none focus:border-amber transition-colors block mb-2 placeholder:text-t-4" placeholder="your@email.com" />
              <button onClick={() => toast.success('Subscribed!')} className="w-full font-mono text-[10px] py-2 border border-cyan text-cyan hover:bg-cyan hover:text-black transition-colors">
                SUBSCRIBE FREE
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

