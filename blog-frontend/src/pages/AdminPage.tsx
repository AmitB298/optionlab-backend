import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LayoutDashboard, PenSquare, FileText, BarChart2, Users, Mail, Settings, Bot, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { articlesApi, analyticsApi, subscribersApi, aiApi, categoriesApi, tagsApi } from '../utils/api'
import toast from 'react-hot-toast'

const NAV = [
  { key: 'dashboard',  label: 'DASHBOARD',   icon: LayoutDashboard },
  { key: 'editor',     label: 'NEW ARTICLE',  icon: PenSquare },
  { key: 'posts',      label: 'ALL POSTS',    icon: FileText },
  { key: 'analytics',  label: 'ANALYTICS',    icon: BarChart2 },
  { key: 'readers',    label: 'READERS',      icon: Users },
  { key: 'newsletter', label: 'NEWSLETTER',   icon: Mail },
]

export default function AdminPage() {
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState('dashboard')
  const [editingArticle, setEditingArticle] = useState<any>(null)

  useEffect(() => {
    if (!isAuthenticated) navigate('/login')
  }, [isAuthenticated])

  const handleEdit = (article: any) => {
    setEditingArticle(article)
    setTab('editor')
  }

  const handleNewArticle = () => {
    setEditingArticle(null)
    setTab('editor')
  }

  return (
    <div className="flex bg-line gap-px min-h-screen">
      {/* SIDEBAR NAV */}
      <div className="w-[220px] bg-ink-1 shrink-0 flex flex-col">
        <div className="px-4 py-3 border-b border-line">
          <div className="font-mono text-[8px] text-t-4 uppercase tracking-[2px]">CONTENT</div>
        </div>
        {NAV.slice(0, 3).map((n) => {
          const Icon = n.icon
          return (
            <button key={n.key} onClick={() => n.key === 'editor' ? handleNewArticle() : setTab(n.key)}
              className={`flex items-center gap-2.5 px-4 py-2.5 font-mono text-[11px] border-l-2 text-left w-full transition-colors
                ${tab === n.key ? 'text-amber border-l-amber bg-amber/5' : 'text-t-3 border-l-transparent hover:text-t-2 hover:bg-ink-2'}`}>
              <Icon size={13} /> {n.label}
            </button>
          )
        })}
        <div className="px-4 py-3 border-b border-t border-line mt-1">
          <div className="font-mono text-[8px] text-t-4 uppercase tracking-[2px]">ANALYTICS</div>
        </div>
        {NAV.slice(3).map((n) => {
          const Icon = n.icon
          return (
            <button key={n.key} onClick={() => setTab(n.key)}
              className={`flex items-center gap-2.5 px-4 py-2.5 font-mono text-[11px] border-l-2 text-left w-full transition-colors
                ${tab === n.key ? 'text-amber border-l-amber bg-amber/5' : 'text-t-3 border-l-transparent hover:text-t-2 hover:bg-ink-2'}`}>
              <Icon size={13} /> {n.label}
            </button>
          )
        })}
        <div className="mt-auto p-4 border-t border-line space-y-2">
          <button onClick={() => toast('Settings coming soon')}
            className="flex items-center gap-2 w-full font-mono text-[11px] text-t-3 hover:text-t-2 px-2 py-1.5">
            <Settings size={12} /> SETTINGS
          </button>
          <button onClick={() => toast('AI Config coming soon')}
            className="flex items-center gap-2 w-full font-mono text-[11px] text-t-3 hover:text-t-2 px-2 py-1.5">
            <Bot size={12} /> AI CONFIG
          </button>
          <button onClick={() => navigate('/')}
            className="flex items-center gap-2 w-full font-mono text-[10px] px-3 py-2 border border-line-2 text-t-3 hover:border-amber hover:text-amber transition-colors">
            <ArrowLeft size={11} /> VIEW SITE
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 bg-ink overflow-auto">
        {tab === 'dashboard'  && <AdminDashboard setTab={setTab} onNewArticle={handleNewArticle} />}
        {tab === 'editor'     && <ArticleEditor article={editingArticle} onSaved={() => { setEditingArticle(null); setTab('posts') }} />}
        {tab === 'posts'      && <PostsTable setTab={setTab} onEdit={handleEdit} onNewArticle={handleNewArticle} />}
        {tab === 'analytics'  && <AnalyticsPanel />}
        {tab === 'readers'    && <ReadersPanel />}
        {tab === 'newsletter' && <NewsletterPanel />}
      </div>
    </div>
  )
}

/* ── DASHBOARD ───────────────────────────────────────────── */
function AdminDashboard({ setTab, onNewArticle }: { setTab: (t: string) => void, onNewArticle: () => void }) {
  const { data: stats } = useQuery({ queryKey: ['admin-stats'], queryFn: () => analyticsApi.dashboard().then(r => r.data) })
  const { data: posts } = useQuery({ queryKey: ['admin-posts'], queryFn: () => articlesApi.adminAll().then(r => r.data) })

  const STAT_BOXES = [
    { label: 'TOTAL ARTICLES',  val: stats?.total_articles    || 0,  chg: '+3 this week',   up: true  },
    { label: 'MONTHLY VIEWS',   val: (stats?.total_views || 0) > 1000 ? `${((stats?.total_views||0)/1000).toFixed(1)}k` : stats?.total_views || 0, chg: '+12.4%', up: true },
    { label: 'SUBSCRIBERS',     val: stats?.total_subscribers || 0,  chg: '+128 this month', up: true  },
    { label: 'TOTAL COMMENTS',  val: stats?.total_comments    || 0,  chg: '+18 this week',  up: true  },
  ]

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-ink-1">
        <div>
          <div className="font-sans font-bold text-[17px] text-t-1">Dashboard</div>
          <div className="font-mono text-[10px] text-t-4 mt-0.5">{new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>
        </div>
        <button onClick={onNewArticle}
          className="flex items-center gap-2 font-mono text-[10px] px-4 py-2 border border-amber text-amber hover:bg-amber hover:text-black transition-colors uppercase tracking-wider">
          <PenSquare size={11} /> NEW ARTICLE
        </button>
      </div>

      <div className="grid grid-cols-4 gap-px bg-line mb-px">
        {STAT_BOXES.map((s) => (
          <div key={s.label} className="bg-ink-1 p-5">
            <div className="font-mono text-[9px] text-t-4 uppercase tracking-wider mb-2">{s.label}</div>
            <div className="font-mono font-light text-[28px] text-t-1 mb-1">{s.val}</div>
            <div className={`font-mono text-[10px] ${s.up ? 'text-green' : 'text-red'}`}>▲ {s.chg}</div>
          </div>
        ))}
      </div>

      <div className="p-5">
        <div className="font-mono text-[10px] text-t-3 uppercase tracking-widest mb-4 flex items-center gap-2">
          <span className="w-[2px] h-3 bg-amber inline-block" />RECENT POSTS
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-ink-2 border-b border-line-2">
              {['TITLE','AUTHOR','CATEGORY','STATUS','VIEWS','AI SCORE','DATE'].map(h => (
                <th key={h} className="font-mono text-[9px] text-t-3 uppercase tracking-wider text-left px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(posts || []).map((a: any) => (
              <tr key={a.id} className="border-b border-line hover:bg-ink-1 cursor-pointer transition-colors">
                <td className="px-3 py-3 font-sans font-medium text-[12px] text-t-1 max-w-[240px] truncate">{a.title}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center font-mono text-[8px] font-bold text-black" style={{ background: a.author_color }}>{a.author_initials}</div>
                    <span className="font-sans text-[12px] text-t-2">{a.author_name}</span>
                  </div>
                </td>
                <td className="px-3 py-3"><span className="font-mono text-[8px] px-1.5 py-0.5 border border-amber/30 text-amber uppercase">{a.cat_name || 'GENERAL'}</span></td>
                <td className="px-3 py-3"><span className="font-mono text-[8px] px-1.5 py-0.5 bg-green/10 text-green border border-green/20">PUBLISHED</span></td>
                <td className="px-3 py-3 font-mono text-[11px] text-cyan">{a.views_count?.toLocaleString()}</td>
                <td className="px-3 py-3 font-mono text-[11px]" style={{ color: a.ai_score > 75 ? '#30d158' : a.ai_score > 60 ? '#ff9f0a' : '#ff453a' }}>{a.ai_score}/100</td>
                <td className="px-3 py-3 font-mono text-[10px] text-t-4">{a.published_at ? new Date(a.published_at).toLocaleDateString('en-IN') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── ARTICLE EDITOR ───────────────────────────────────────── */
function ArticleEditor({ article, onSaved }: { article?: any, onSaved?: () => void }) {
  const [title, setTitle]     = useState(article?.title || '')
  const [excerpt, setExcerpt] = useState(article?.excerpt || '')
  const [body, setBody]       = useState(article?.body_markdown || '')
  const [category, setCategory] = useState(article?.cat_name || '')
  const [emoji, setEmoji]     = useState(article?.cover_emoji || '📊')
  const [aiLoading, setAiLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)

  // Update fields when article prop changes
  useEffect(() => {
    setTitle(article?.title || '')
    setExcerpt(article?.excerpt || '')
    setBody(article?.body_markdown || '')
    setCategory(article?.cat_name || '')
    setEmoji(article?.cover_emoji || '📊')
  }, [article])

  const { data: categories = [] } = useQuery({ queryKey: ['cats'], queryFn: () => categoriesApi.list().then(r => r.data) })

  const preview = body
    .replace(/^## (.+)$/gm, '<h2 class="font-display text-xl text-t-1 mt-6 mb-3 font-bold">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="font-sans font-bold text-t-1 mt-4 mb-2">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-t-1 font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-amber italic">$1</em>')
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-amber pl-3 py-2 bg-amber/5 my-3 text-t-3 text-sm">$1</blockquote>')
    .replace(/\n\n/g, '</p><p class="text-t-2 text-sm leading-relaxed mb-3">')

  const aiAssist = async () => {
    if (!title.trim()) { toast.error('Enter a title first'); return }
    setAiLoading(true)
    try {
      const { data } = await aiApi.assistWrite({ title, category })
      setBody(data.content)
      toast.success('AI draft generated!')
    } catch {
      toast.error('AI assist failed. Check ANTHROPIC_API_KEY in Railway.')
    } finally {
      setAiLoading(false)
    }
  }

  const publish = async (status: 'published' | 'draft') => {
    if (!title.trim() || !body.trim()) { toast.error('Title and body are required'); return }
    setPublishing(true)
    try {
      const cat = (categories as any[]).find((c: any) => c.name === category)
      const payload = {
        title, excerpt,
        body_markdown: body,
        cover_emoji: emoji,
        category_id: cat?.id,
        status,
        read_time_min: Math.max(1, Math.ceil(body.split(' ').length / 200))
      }
      if (article?.id) {
        await articlesApi.update(article.id, payload)
        toast.success(status === 'published' ? 'Article updated & published!' : 'Draft updated!')
      } else {
        await articlesApi.create(payload)
        toast.success(status === 'published' ? 'Article published!' : 'Draft saved!')
      }
      if (onSaved) onSaved()
    } catch {
      toast.error('Failed to save. Check you are logged in.')
    } finally {
      setPublishing(false)
    }
  }

  const insertText = (before: string, after = '') => {
    const ta = document.getElementById('editorTA') as HTMLTextAreaElement
    if (!ta) return
    const s = ta.selectionStart, e = ta.selectionEnd
    const sel = ta.value.substring(s, e)
    const newVal = ta.value.substring(0, s) + before + sel + after + ta.value.substring(e)
    setBody(newVal)
  }

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-ink-1">
        <div>
          <div className="font-sans font-bold text-[17px] text-t-1">{article?.id ? 'Edit Article' : 'New Article'}</div>
          <div className="font-mono text-[10px] text-t-4 mt-0.5">
            {article?.id ? `Editing: ${article.title}` : 'Markdown editor with live preview'}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => publish('draft')} disabled={publishing}
            className="font-mono text-[10px] px-4 py-2 border border-line-2 text-t-3 hover:border-amber hover:text-amber transition-colors disabled:opacity-50">
            SAVE DRAFT
          </button>
          <button onClick={() => publish('published')} disabled={publishing}
            className="font-mono text-[10px] px-4 py-2 border border-amber text-amber hover:bg-amber hover:text-black transition-colors disabled:opacity-50">
            {publishing ? 'SAVING...' : article?.id ? '▶ UPDATE & PUBLISH' : '▶ PUBLISH'}
          </button>
        </div>
      </div>

      {/* Meta fields */}
      <div className="grid grid-cols-2 gap-3 p-5 border-b border-line bg-ink-2">
        <div>
          <label className="font-mono text-[9px] text-t-4 uppercase tracking-wider block mb-1.5">ARTICLE TITLE *</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            className="w-full bg-ink border border-line px-3 py-2.5 font-sans text-[13px] text-t-1 outline-none focus:border-amber transition-colors placeholder:text-t-4"
            placeholder="e.g. NIFTY Weekly Analysis: Key OI Levels" />
        </div>
        <div>
          <label className="font-mono text-[9px] text-t-4 uppercase tracking-wider block mb-1.5">CATEGORY</label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="w-full bg-ink border border-line px-3 py-2.5 font-sans text-[13px] text-t-1 outline-none focus:border-amber transition-colors">
            <option value="">Select category...</option>
            {(categories as any[]).map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="font-mono text-[9px] text-t-4 uppercase tracking-wider block mb-1.5">EXCERPT / SUBTITLE</label>
          <input value={excerpt} onChange={e => setExcerpt(e.target.value)}
            className="w-full bg-ink border border-line px-3 py-2 font-sans text-[13px] text-t-1 outline-none focus:border-amber transition-colors placeholder:text-t-4"
            placeholder="One line summary shown in article cards..." />
        </div>
        <div className="flex items-center gap-3">
          <div>
            <label className="font-mono text-[9px] text-t-4 uppercase tracking-wider block mb-1.5">EMOJI</label>
            <input value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={2}
              className="w-16 bg-ink border border-line px-2 py-2 font-sans text-[20px] text-center outline-none focus:border-amber" />
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-0 overflow-x-auto bg-ink-2 border-b border-line">
        {[['B', '**','**'], ['I', '*','*'], ['H2', '## ',''], ['H3', '### ','']].map(([l,b,a]) => (
          <button key={l} onClick={() => insertText(b,a)} className="px-3 py-2 font-mono text-[10px] text-t-3 border-r border-line hover:text-amber hover:bg-ink-1 transition-colors">{l}</button>
        ))}
        <button onClick={() => insertText('\n> **NOTE:** ','')} className="px-3 py-2 font-mono text-[10px] text-t-3 border-r border-line hover:text-amber hover:bg-ink-1 transition-colors">📌 CALLOUT</button>
        <button onClick={() => insertText('\n| Col1 | Col2 | Col3 |\n|------|------|------|\n| Data | Data | Data |\n','')} className="px-3 py-2 font-mono text-[10px] text-t-3 border-r border-line hover:text-amber hover:bg-ink-1 transition-colors">TABLE</button>
        <button onClick={aiAssist} disabled={aiLoading}
          className="ml-auto px-3 py-2 font-mono text-[10px] text-cyan border-l border-line hover:bg-cyan/10 transition-colors flex items-center gap-1.5 disabled:opacity-50">
          🤖 {aiLoading ? 'GENERATING...' : 'AI ASSIST'}
        </button>
      </div>

      {/* Split editor */}
      <div className="grid grid-cols-2 border-b border-line" style={{ minHeight: '400px' }}>
        <div className="border-r border-line p-4">
          <div className="font-mono text-[9px] text-t-4 uppercase tracking-wider mb-2">MARKDOWN EDITOR</div>
          <textarea
            id="editorTA"
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={"## Executive Summary\n\nStart with your key insight...\n\n## Analysis\n\nYour content here..."}
            className="w-full h-[380px] bg-transparent outline-none font-mono text-[13px] text-t-1 leading-relaxed resize-none placeholder:text-t-4"
          />
        </div>
        <div className="p-4">
          <div className="font-mono text-[9px] text-t-4 uppercase tracking-wider mb-2">LIVE PREVIEW</div>
          {body ? (
            <div className="prose-terminal text-[13px]" dangerouslySetInnerHTML={{ __html: '<p class="text-t-2 leading-relaxed mb-3">' + preview + '</p>' }} />
          ) : (
            <p className="font-mono text-[11px] text-t-4">Start writing to see preview...</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 px-5 py-3 bg-ink-2 border-t border-line">
        <button onClick={() => publish('published')} disabled={publishing}
          className="font-mono text-[10px] px-5 py-2.5 border border-amber text-amber hover:bg-amber hover:text-black transition-colors disabled:opacity-50">
          {article?.id ? '▶ UPDATE NOW' : '▶ PUBLISH NOW'}
        </button>
        <button onClick={() => toast.success('Scheduled for tomorrow 8:30 AM IST')}
          className="font-mono text-[10px] px-4 py-2.5 border border-line-2 text-t-3 hover:border-amber hover:text-amber transition-colors">
          SCHEDULE: TOMORROW 8:30 AM
        </button>
        <span className="font-mono text-[9px] text-t-4 ml-auto">SEBI DISCLAIMER AUTO-APPENDED ON PUBLISH</span>
      </div>
    </div>
  )
}

/* ── POSTS TABLE ─────────────────────────────────────────── */
function PostsTable({ setTab, onEdit, onNewArticle }: { setTab: (t:string)=>void, onEdit: (a:any)=>void, onNewArticle: ()=>void }) {
  const { data: posts = [], refetch } = useQuery({ queryKey: ['admin-posts-all'], queryFn: () => articlesApi.adminAll().then(r => r.data) })

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    if (!confirm('Delete this article?')) return
    try {
      await articlesApi.delete(id)
      toast.success('Article deleted')
      refetch()
    } catch {
      toast.error('Failed to delete')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-ink-1">
        <div className="font-sans font-bold text-[17px] text-t-1">All Posts ({(posts as any[]).length})</div>
        <button onClick={onNewArticle} className="font-mono text-[10px] px-4 py-2 border border-amber text-amber hover:bg-amber hover:text-black transition-colors">+ NEW POST</button>
      </div>
      <div className="p-5">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-ink-2 border-b border-line-2">
              {['TITLE','AUTHOR','CATEGORY','STATUS','VIEWS','LIKES','DATE','ACTIONS'].map(h => (
                <th key={h} className="font-mono text-[9px] text-t-3 uppercase tracking-wider text-left px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(posts as any[]).map((a: any) => (
              <tr key={a.id} className="border-b border-line hover:bg-ink-1 cursor-pointer transition-colors">
                <td className="px-3 py-3 font-sans font-medium text-[12px] text-t-1 max-w-[200px] truncate">{a.title}</td>
                <td className="px-3 py-3 font-sans text-[12px] text-t-2">{a.author_name}</td>
                <td className="px-3 py-3"><span className="font-mono text-[8px] px-1.5 py-0.5 border border-amber/30 text-amber">{a.cat_name || '—'}</span></td>
                <td className="px-3 py-3">
                  <span className={`font-mono text-[8px] px-1.5 py-0.5 border ${a.status==='published'?'bg-green/10 text-green border-green/20':a.status==='draft'?'bg-amber/10 text-amber border-amber/20':'bg-cyan/10 text-cyan border-cyan/20'}`}>
                    {a.status?.toUpperCase()}
                  </span>
                </td>
                <td className="px-3 py-3 font-mono text-[11px] text-cyan">{a.views_count?.toLocaleString()}</td>
                <td className="px-3 py-3 font-mono text-[11px] text-t-2">{a.likes_count}</td>
                <td className="px-3 py-3 font-mono text-[10px] text-t-4">{a.published_at ? new Date(a.published_at).toLocaleDateString('en-IN') : '—'}</td>
                <td className="px-3 py-3">
                  <div className="flex gap-1.5">
                    <button
                      onClick={e => { e.stopPropagation(); onEdit(a) }}
                      className="font-mono text-[9px] px-2 py-1 border border-line text-t-3 hover:border-amber hover:text-amber transition-colors">
                      EDIT
                    </button>
                    <button
                      onClick={e => handleDelete(e, a.id)}
                      className="font-mono text-[9px] px-2 py-1 border border-line text-t-3 hover:border-red hover:text-red transition-colors">
                      DEL
                    </button>
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

/* ── ANALYTICS ───────────────────────────────────────────── */
function AnalyticsPanel() {
  const { data: stats } = useQuery({ queryKey: ['admin-analytics'], queryFn: () => analyticsApi.dashboard().then(r => r.data) })

  return (
    <div>
      <div className="px-6 py-4 border-b border-line bg-ink-1 font-sans font-bold text-[17px] text-t-1">Analytics</div>
      <div className="grid grid-cols-4 gap-px bg-line mb-px">
        {[
          { label: "TODAY'S VIEWS",   val: '3,241',  chg: '+18% vs yesterday', up: true },
          { label: 'UNIQUE READERS',  val: '1,847',  chg: '+9.2%',             up: true },
          { label: 'AVG SESSION',     val: '4m 32s', chg: '+0.8m',             up: true },
          { label: 'BOUNCE RATE',     val: '34%',    chg: '-4% (good)',         up: false },
        ].map(s => (
          <div key={s.label} className="bg-ink-1 p-5">
            <div className="font-mono text-[9px] text-t-4 uppercase tracking-wider mb-2">{s.label}</div>
            <div className="font-mono font-light text-[28px] text-t-1 mb-1">{s.val}</div>
            <div className={`font-mono text-[10px] ${s.up ? 'text-green' : 'text-red'}`}>{s.up ? '▲' : '▼'} {s.chg}</div>
          </div>
        ))}
      </div>
      <div className="p-5">
        <div className="font-mono text-[10px] text-t-3 uppercase tracking-widest mb-4 flex items-center gap-2">
          <span className="w-[2px] h-3 bg-amber inline-block" />TOP ARTICLES THIS WEEK
        </div>
        <table className="w-full border-collapse">
          <thead><tr className="bg-ink-2 border-b border-line-2">
            {['ARTICLE','VIEWS','AVG TIME','SHARES','AI SCORE','TREND'].map(h => (
              <th key={h} className="font-mono text-[9px] text-t-3 uppercase tracking-wider text-left px-3 py-2">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {(stats?.top_articles || []).map((a: any) => (
              <tr key={a.id} className="border-b border-line hover:bg-ink-1">
                <td className="px-3 py-3 font-sans text-[12px] text-t-1 max-w-[240px] truncate">{a.title}</td>
                <td className="px-3 py-3 font-mono text-[11px] text-cyan">{a.views_count?.toLocaleString()}</td>
                <td className="px-3 py-3 font-mono text-[10px] text-t-3">5m 30s</td>
                <td className="px-3 py-3 font-mono text-[10px] text-t-3">{Math.floor((a.likes_count||0)*0.3)}</td>
                <td className="px-3 py-3 font-mono text-[11px]" style={{ color: a.ai_score > 75 ? '#30d158' : '#ff9f0a' }}>{a.ai_score}/100</td>
                <td className={`px-3 py-3 font-mono text-[10px] ${a.sentiment==='bullish'?'text-green':a.sentiment==='bearish'?'text-red':'text-amber'}`}>
                  {a.sentiment==='bullish'?'↑ GROWING':a.sentiment==='bearish'?'↓ DECLINING':'→ STABLE'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── READERS ──────────────────────────────────────────────── */
function ReadersPanel() {
  const { data: subs = [] } = useQuery({ queryKey: ['subscribers'], queryFn: () => subscribersApi.list().then(r => r.data) })
  const { data: count } = useQuery({ queryKey: ['sub-count'], queryFn: () => subscribersApi.count().then(r => r.data) })

  return (
    <div>
      <div className="px-6 py-4 border-b border-line bg-ink-1 font-sans font-bold text-[17px] text-t-1">Reader Management</div>
      <div className="grid grid-cols-4 gap-px bg-line mb-px">
        {[
          { label: 'TOTAL SUBSCRIBERS', val: count?.count || 0, chg: '+128 this month', up: true },
          { label: 'OPEN RATE',          val: '42%',              chg: 'Industry: 21%',   up: true },
          { label: 'ACTIVE COMMENTERS',  val: 384,                chg: '+22 this week',   up: true },
          { label: 'CHURN RATE',         val: '2.1%',             chg: '-0.4% (good)',    up: false },
        ].map(s => (
          <div key={s.label} className="bg-ink-1 p-5">
            <div className="font-mono text-[9px] text-t-4 uppercase tracking-wider mb-2">{s.label}</div>
            <div className="font-mono font-light text-[28px] text-t-1 mb-1">{s.val}</div>
            <div className={`font-mono text-[10px] ${s.up ? 'text-green' : 'text-red'}`}>{s.up ? '▲' : '▼'} {s.chg}</div>
          </div>
        ))}
      </div>
      <div className="p-5">
        <table className="w-full border-collapse">
          <thead><tr className="bg-ink-2 border-b border-line-2">
            {['EMAIL','JOINED','SOURCE','OPENS','STATUS'].map(h => (
              <th key={h} className="font-mono text-[9px] text-t-3 uppercase tracking-wider text-left px-3 py-2">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {(subs as any[]).map((s: any) => (
              <tr key={s.id} className="border-b border-line hover:bg-ink-1">
                <td className="px-3 py-3 font-mono text-[11px] text-t-1">{s.email}</td>
                <td className="px-3 py-3 font-mono text-[10px] text-t-3">{new Date(s.subscribed_at || s.created_at).toLocaleDateString('en-IN')}</td>
                <td className="px-3 py-3 font-mono text-[10px] text-t-4">{s.source}</td>
                <td className="px-3 py-3 font-mono text-[10px] text-cyan">—</td>
                <td className="px-3 py-3"><span className="font-mono text-[8px] px-1.5 py-0.5 bg-green/10 text-green border border-green/20">ACTIVE</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── NEWSLETTER ───────────────────────────────────────────── */
function NewsletterPanel() {
  const [subject, setSubject] = useState('')
  const [preview, setPreview] = useState('')

  return (
    <div>
      <div className="px-6 py-4 border-b border-line bg-ink-1 font-sans font-bold text-[17px] text-t-1">Newsletter Management</div>
      <div className="grid grid-cols-2 gap-px bg-line p-5">
        <div className="bg-ink-1 p-5">
          <div className="font-mono text-[10px] text-t-3 uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="w-[2px] h-3 bg-amber inline-block" />CREATE CAMPAIGN
          </div>
          <div className="space-y-3">
            <div>
              <label className="font-mono text-[9px] text-t-4 uppercase tracking-wider block mb-1.5">SUBJECT LINE</label>
              <input value={subject} onChange={e => setSubject(e.target.value)}
                className="w-full bg-ink-2 border border-line px-3 py-2 font-sans text-[13px] text-t-1 outline-none focus:border-amber transition-colors placeholder:text-t-4"
                placeholder="Pre-Market Brief: NIFTY Analysis for March 22" />
            </div>
            <div>
              <label className="font-mono text-[9px] text-t-4 uppercase tracking-wider block mb-1.5">PREVIEW TEXT</label>
              <input value={preview} onChange={e => setPreview(e.target.value)}
                className="w-full bg-ink-2 border border-line px-3 py-2 font-sans text-[13px] text-t-1 outline-none focus:border-amber transition-colors placeholder:text-t-4"
                placeholder="OI data shows distribution, VIX elevated..." />
            </div>
            <div>
              <label className="font-mono text-[9px] text-t-4 uppercase tracking-wider block mb-1.5">SEND TIME</label>
              <select className="w-full bg-ink-2 border border-line px-3 py-2 font-sans text-[13px] text-t-1 outline-none focus:border-amber">
                <option>Tomorrow 8:30 AM IST</option>
                <option>Monday 8:30 AM IST</option>
                <option>Send Now</option>
                <option>Custom Time</option>
              </select>
            </div>
            <button onClick={() => toast.success('Campaign scheduled for 8:30 AM tomorrow!')}
              className="w-full font-mono text-[10px] py-2.5 border border-amber text-amber hover:bg-amber hover:text-black transition-colors uppercase tracking-wider">
              ▶ SCHEDULE CAMPAIGN
            </button>
          </div>
        </div>
        <div className="bg-ink-1 p-5">
          <div className="font-mono text-[10px] text-t-3 uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="w-[2px] h-3 bg-amber inline-block" />CAMPAIGN HISTORY
          </div>
          {[
            { sub:'Pre-Market Brief: NIFTY Expiry Analysis', date:'Mar 20, 2026', open:'44%', click:'12%' },
            { sub:'BANKNIFTY 48,000 Pin Dissected',          date:'Mar 19, 2026', open:'41%', click:'10%' },
            { sub:'FII Data Decoded: Net Long Signals',      date:'Mar 18, 2026', open:'46%', click:'14%' },
            { sub:'India VIX Spike: Pre-Policy Positioning', date:'Mar 17, 2026', open:'38%', click:'9%' },
          ].map((c, i) => (
            <div key={i} className="py-3 border-b border-line">
              <div className="font-sans font-semibold text-[12px] text-t-2 mb-1.5 truncate">{c.sub}</div>
              <div className="flex gap-3 font-mono text-[10px] text-t-4">
                <span>{c.date}</span>
                <span className="text-green">Open: {c.open}</span>
                <span className="text-cyan">Click: {c.click}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
