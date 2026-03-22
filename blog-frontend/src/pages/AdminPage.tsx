import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  LayoutDashboard, PenSquare, FileText, BarChart2, Users, Mail,
  Settings, ArrowLeft, Bold, Italic, Heading2, Heading3,
  Quote, Code, List, ListOrdered, Minus, Link2, Image, Eye,
  EyeOff, Maximize2, Minimize2, Save, Send, Clock, Tag,
  Star, StarOff, Hash, X, Search,
  AlignLeft, Type, Sparkles, Globe, Share2
} from 'lucide-react'
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

  const handleEdit = (article: any) => { setEditingArticle(article); setTab('editor') }
  const handleNewArticle = () => { setEditingArticle(null); setTab('editor') }

  return (
    <div className="flex bg-line gap-px min-h-screen">
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
          <button onClick={() => navigate('/')}
            className="flex items-center gap-2 w-full font-mono text-[10px] px-3 py-2 border border-line-2 text-t-3 hover:border-amber hover:text-amber transition-colors">
            <ArrowLeft size={11} /> VIEW SITE
          </button>
        </div>
      </div>

      <div className="flex-1 bg-ink overflow-auto">
        {tab === 'dashboard'  && <AdminDashboard onNewArticle={handleNewArticle} />}
        {tab === 'editor'     && <ArticleEditor article={editingArticle} onSaved={() => { setEditingArticle(null); setTab('posts') }} />}
        {tab === 'posts'      && <PostsTable onEdit={handleEdit} onNewArticle={handleNewArticle} />}
        {tab === 'analytics'  && <AnalyticsPanel />}
        {tab === 'readers'    && <ReadersPanel />}
        {tab === 'newsletter' && <NewsletterPanel />}
      </div>
    </div>
  )
}

/* ── DASHBOARD ─────────────────────────────────────────────── */
function AdminDashboard({ onNewArticle }: { onNewArticle: () => void }) {
  const { data: stats } = useQuery({ queryKey: ['admin-stats'], queryFn: () => analyticsApi.dashboard().then(r => r.data) })
  const { data: posts }  = useQuery({ queryKey: ['admin-posts'], queryFn: () => articlesApi.adminAll().then(r => r.data) })

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-ink-1">
        <div>
          <div className="font-sans font-bold text-[17px] text-t-1">Dashboard</div>
          <div className="font-mono text-[10px] text-t-4 mt-0.5">{new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>
        </div>
        <button onClick={onNewArticle} className="flex items-center gap-2 font-mono text-[10px] px-4 py-2 border border-amber text-amber hover:bg-amber hover:text-black transition-colors uppercase tracking-wider">
          <PenSquare size={11} /> NEW ARTICLE
        </button>
      </div>
      <div className="grid grid-cols-4 gap-px bg-line mb-px">
        {[
          { label: 'TOTAL ARTICLES', val: stats?.total_articles || 0 },
          { label: 'TOTAL VIEWS',    val: stats?.total_views || 0 },
          { label: 'SUBSCRIBERS',    val: stats?.total_subscribers || 0 },
          { label: 'COMMENTS',       val: stats?.total_comments || 0 },
        ].map((s) => (
          <div key={s.label} className="bg-ink-1 p-5">
            <div className="font-mono text-[9px] text-t-4 uppercase tracking-wider mb-2">{s.label}</div>
            <div className="font-mono font-light text-[28px] text-t-1">{s.val}</div>
          </div>
        ))}
      </div>
      <div className="p-5">
        <div className="font-mono text-[10px] text-t-3 uppercase tracking-widest mb-4">RECENT POSTS</div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-ink-2 border-b border-line-2">
              {['TITLE','STATUS','VIEWS','DATE'].map(h => (
                <th key={h} className="font-mono text-[9px] text-t-3 uppercase tracking-wider text-left px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(posts || []).slice(0,5).map((a: any) => (
              <tr key={a.id} className="border-b border-line hover:bg-ink-1 transition-colors">
                <td className="px-3 py-3 font-sans font-medium text-[12px] text-t-1 max-w-[300px] truncate">{a.title}</td>
                <td className="px-3 py-3"><span className="font-mono text-[8px] px-1.5 py-0.5 bg-green/10 text-green border border-green/20">{a.status?.toUpperCase()}</span></td>
                <td className="px-3 py-3 font-mono text-[11px] text-cyan">{a.views_count || 0}</td>
                <td className="px-3 py-3 font-mono text-[10px] text-t-4">{a.published_at ? new Date(a.published_at).toLocaleDateString('en-IN') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── ADVANCED ARTICLE EDITOR ──────────────────────────────── */
function ArticleEditor({ article, onSaved }: { article?: any, onSaved?: () => void }) {
  const [title, setTitle]       = useState(article?.title || '')
  const [subtitle, setSubtitle] = useState(article?.subtitle || '')
  const [excerpt, setExcerpt]   = useState(article?.excerpt || '')
  const [body, setBody]         = useState(article?.body_markdown || '')
  const [category, setCategory] = useState(article?.cat_name || '')
  const [emoji, setEmoji]       = useState(article?.cover_emoji || '📊')
  const [featured, setFeatured] = useState(article?.featured || false)
  const [seoTitle, setSeoTitle] = useState(article?.seo_title || '')
  const [seoDesc, setSeoDesc]   = useState(article?.seo_description || '')
  const [viewMode, setViewMode] = useState<'write'|'split'|'preview'>('split')
  const [fullscreen, setFullscreen] = useState(false)
  const [aiLoading, setAiLoading]   = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [autoSaved, setAutoSaved]   = useState<Date|null>(null)
  const [showSEO, setShowSEO]       = useState(false)
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [linkUrl, setLinkUrl]   = useState('')
  const [linkText, setLinkText] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)
  const autoSaveRef = useRef<any>(null)

  const { data: categories = [] } = useQuery({ queryKey: ['cats'], queryFn: () => categoriesApi.list().then(r => r.data) })

  useEffect(() => {
    setTitle(article?.title || '')
    setSubtitle(article?.subtitle || '')
    setExcerpt(article?.excerpt || '')
    setBody(article?.body_markdown || '')
    setCategory(article?.cat_name || '')
    setEmoji(article?.cover_emoji || '📊')
    setFeatured(article?.featured || false)
    setSeoTitle(article?.seo_title || '')
    setSeoDesc(article?.seo_description || '')
  }, [article])

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0
  const readTime  = Math.max(1, Math.ceil(wordCount / 200))
  const slug      = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const insertAt = useCallback((before: string, after = '', placeholder = '') => {
    const ta = taRef.current
    if (!ta) return
    const s = ta.selectionStart, e = ta.selectionEnd
    const sel = ta.value.substring(s, e) || placeholder
    const newVal = ta.value.substring(0, s) + before + sel + after + ta.value.substring(e)
    setBody(newVal)
    setTimeout(() => { ta.focus(); const np = s + before.length + sel.length; ta.setSelectionRange(np, np) }, 10)
  }, [])

  const TOOLBAR: any[] = [
    { icon: Bold,        tip: 'Bold (Ctrl+B)',   fn: () => insertAt('**','**','bold') },
    { icon: Italic,      tip: 'Italic (Ctrl+I)', fn: () => insertAt('*','*','italic') },
    { sep: true },
    { icon: Heading2,    tip: 'H2',  fn: () => insertAt('\n## ','','Heading') },
    { icon: Heading3,    tip: 'H3',  fn: () => insertAt('\n### ','','Heading') },
    { icon: Type,        tip: 'H4',  fn: () => insertAt('\n#### ','','Heading') },
    { sep: true },
    { icon: Quote,       tip: 'Quote',      fn: () => insertAt('\n> ','','quote') },
    { icon: Code,        tip: 'Inline code', fn: () => insertAt('`','`','code') },
    { icon: AlignLeft,   tip: 'Code block', fn: () => insertAt('\n```\n','\n```\n','code') },
    { sep: true },
    { icon: List,        tip: 'Bullet list',   fn: () => insertAt('\n- ','','item') },
    { icon: ListOrdered, tip: 'Ordered list',  fn: () => insertAt('\n1. ','','item') },
    { icon: Minus,       tip: 'Divider',        fn: () => insertAt('\n\n---\n\n','') },
    { sep: true },
    { icon: Link2,       tip: 'Link',   fn: () => setShowLinkDialog(true) },
    { icon: Image,       tip: 'Image',  fn: () => insertAt('\n![','](https://)\n','alt text') },
    { sep: true },
    { icon: Hash,        tip: 'Callout', fn: () => insertAt('\n> 📌 **NOTE:** ','','callout text') },
    { icon: Share2,      tip: 'Table',   fn: () => insertAt('\n| Col 1 | Col 2 | Col 3 |\n|-------|-------|-------|\n| Data  | Data  | Data  |\n','') },
  ]

  const renderPreview = (md: string) => md
    .replace(/^## (.+)$/gm, '<h2 style="font-size:18px;font-weight:700;color:#e2e8f0;margin:24px 0 12px">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:15px;font-weight:700;color:#e2e8f0;margin:18px 0 8px">$1</h3>')
    .replace(/^#### (.+)$/gm, '<h4 style="font-size:13px;font-weight:700;color:#c8d5e8;margin:14px 0 6px">$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#f0f4f8;font-weight:600">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em style="color:#ff9f0a;font-style:italic">$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:#1a2535;color:#64d2ff;font-family:monospace;font-size:12px;padding:2px 6px">$1</code>')
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:2px solid #ff9f0a;padding:8px 12px;background:rgba(255,159,10,0.05);margin:16px 0;color:#8fa4be;font-style:italic">$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li style="color:#8fa4be;font-size:13px;margin:4px 0;margin-left:16px;list-style:disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li style="color:#8fa4be;font-size:13px;margin:4px 0;margin-left:16px;list-style:decimal">$1</li>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #1e2d45;margin:24px 0"/>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#ff9f0a;text-decoration:underline" target="_blank">$1</a>')
    .replace(/\n\n/g, '</p><p style="color:#8fa4be;font-size:13px;line-height:1.8;margin:0 0 16px">')

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') { e.preventDefault(); insertAt('**','**','bold') }
      if (e.key === 'i') { e.preventDefault(); insertAt('*','*','italic') }
      if (e.key === 's') { e.preventDefault(); publish('draft') }
    }
  }

  const insertLink = () => {
    insertAt(`[${linkText || 'link'}](`, ')', linkUrl)
    setShowLinkDialog(false); setLinkUrl(''); setLinkText('')
  }

  const aiAssist = async () => {
    if (!title.trim()) { toast.error('Enter a title first'); return }
    setAiLoading(true)
    try {
      const { data } = await aiApi.assistWrite({ title, category })
      setBody(data.content)
      toast.success('AI draft generated!')
    } catch { toast.error('AI assist failed') }
    finally { setAiLoading(false) }
  }

  const publish = async (status: 'published' | 'draft') => {
    if (!title.trim() || !body.trim()) { toast.error('Title and body required'); return }
    setPublishing(true)
    try {
      const cat = (categories as any[]).find((c: any) => c.name === category)
      const payload = { title, subtitle, excerpt, body_markdown: body, cover_emoji: emoji, category_id: cat?.id, status, featured, seo_title: seoTitle || title, seo_description: seoDesc || excerpt, read_time_min: readTime }
      if (article?.id) { await articlesApi.update(article.id, payload) } 
      else { await articlesApi.create(payload) }
      toast.success(status === 'published' ? '✅ Published!' : '📝 Draft saved!')
      if (status === 'published' && onSaved) onSaved()
    } catch { toast.error('Failed to save') }
    finally { setPublishing(false) }
  }

  return (
    <div className={`flex flex-col ${fullscreen ? 'fixed inset-0 z-50 bg-ink' : 'min-h-screen'}`} style={{height: fullscreen ? '100vh' : 'calc(100vh - 0px)'}}>

      {/* TOP BAR */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-line bg-ink-1 shrink-0 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-[9px] text-t-4 shrink-0">{article?.id ? 'EDITING' : 'NEW'}</span>
          {autoSaved && <span className="font-mono text-[9px] text-green shrink-0">✓ Saved {autoSaved.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span>}
          <span className="font-mono text-[9px] text-t-4 shrink-0">{wordCount}w · {readTime}m read</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex border border-line overflow-hidden mr-1">
            {(['write','split','preview'] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)} title={m}
                className={`px-2 py-1.5 font-mono text-[9px] transition-colors ${viewMode === m ? 'bg-amber text-black' : 'text-t-3 hover:text-t-1'}`}>
                {m==='write'?<AlignLeft size={10}/>:m==='split'?<Eye size={10}/>:<EyeOff size={10}/>}
              </button>
            ))}
          </div>
          <button onClick={() => setFullscreen(!fullscreen)} className="p-1.5 border border-line text-t-3 hover:text-amber hover:border-amber transition-colors">
            {fullscreen ? <Minimize2 size={11}/> : <Maximize2 size={11}/>}
          </button>
          <button onClick={() => setShowSEO(!showSEO)} className={`flex items-center gap-1 px-2 py-1.5 font-mono text-[9px] border transition-colors ${showSEO?'border-amber text-amber':'border-line text-t-3 hover:border-amber hover:text-amber'}`}>
            <Globe size={10}/> SEO
          </button>
          <button onClick={() => publish('draft')} disabled={publishing}
            className="flex items-center gap-1 px-3 py-1.5 font-mono text-[9px] border border-line text-t-3 hover:border-amber hover:text-amber transition-colors disabled:opacity-40">
            <Save size={10}/> DRAFT
          </button>
          <button onClick={() => publish('published')} disabled={publishing}
            className="flex items-center gap-1 px-4 py-1.5 font-mono text-[9px] border border-amber text-amber hover:bg-amber hover:text-black transition-colors disabled:opacity-40">
            <Send size={10}/> {publishing ? '...' : article?.id ? 'UPDATE' : 'PUBLISH'}
          </button>
        </div>
      </div>

      {/* SEO PANEL */}
      {showSEO && (
        <div className="bg-ink-2 border-b border-line px-4 py-3 grid grid-cols-3 gap-3 shrink-0">
          <div>
            <label className="font-mono text-[8px] text-t-4 uppercase tracking-wider block mb-1">SEO TITLE <span className={seoTitle.length>60?'text-red':'text-t-4'}>({seoTitle.length}/60)</span></label>
            <input value={seoTitle} onChange={e=>setSeoTitle(e.target.value)} placeholder={title}
              className="w-full bg-ink border border-line px-2 py-1.5 font-sans text-[12px] text-t-1 outline-none focus:border-amber"/>
          </div>
          <div>
            <label className="font-mono text-[8px] text-t-4 uppercase tracking-wider block mb-1">META DESC <span className={seoDesc.length>160?'text-red':'text-t-4'}>({seoDesc.length}/160)</span></label>
            <input value={seoDesc} onChange={e=>setSeoDesc(e.target.value)} placeholder={excerpt}
              className="w-full bg-ink border border-line px-2 py-1.5 font-sans text-[12px] text-t-1 outline-none focus:border-amber"/>
          </div>
          <div>
            <label className="font-mono text-[8px] text-t-4 uppercase tracking-wider block mb-1">URL PREVIEW</label>
            <div className="font-mono text-[10px] text-cyan bg-ink border border-line px-2 py-1.5 truncate">/blog/article/{slug || 'your-title-here'}</div>
          </div>
        </div>
      )}

      {/* META ROW */}
      <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-line bg-ink-2 shrink-0">
        <div className="col-span-1">
          <label className="font-mono text-[8px] text-t-4 block mb-1">EMOJI</label>
          <input value={emoji} onChange={e=>setEmoji(e.target.value)} maxLength={2}
            className="w-full bg-ink border border-line px-1 py-1.5 text-[20px] text-center outline-none focus:border-amber"/>
        </div>
        <div className="col-span-5">
          <label className="font-mono text-[8px] text-t-4 uppercase tracking-wider block mb-1">TITLE *</label>
          <input value={title} onChange={e=>setTitle(e.target.value)}
            className="w-full bg-ink border border-line px-3 py-1.5 font-sans font-semibold text-[13px] text-t-1 outline-none focus:border-amber placeholder:text-t-4"
            placeholder="NIFTY 22,500 CE — OI Data Signals Distribution Phase"/>
        </div>
        <div className="col-span-3">
          <label className="font-mono text-[8px] text-t-4 uppercase tracking-wider block mb-1">SUBTITLE</label>
          <input value={subtitle} onChange={e=>setSubtitle(e.target.value)}
            className="w-full bg-ink border border-line px-3 py-1.5 font-sans text-[12px] text-t-2 outline-none focus:border-amber placeholder:text-t-4"
            placeholder="Supporting headline..."/>
        </div>
        <div className="col-span-2">
          <label className="font-mono text-[8px] text-t-4 uppercase tracking-wider block mb-1">CATEGORY</label>
          <select value={category} onChange={e=>setCategory(e.target.value)}
            className="w-full bg-ink border border-line px-2 py-1.5 font-sans text-[12px] text-t-1 outline-none focus:border-amber">
            <option value="">Select...</option>
            {(categories as any[]).map((c:any) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div className="col-span-1 flex items-end">
          <button onClick={() => setFeatured(!featured)}
            className={`w-full py-1.5 flex items-center justify-center gap-1 font-mono text-[8px] border transition-colors ${featured?'border-amber text-amber bg-amber/5':'border-line text-t-4 hover:border-amber'}`}>
            {featured ? <Star size={10} fill="currentColor"/> : <StarOff size={10}/>} FEAT
          </button>
        </div>
        <div className="col-span-12">
          <label className="font-mono text-[8px] text-t-4 uppercase tracking-wider block mb-1">EXCERPT (article cards & SEO)</label>
          <input value={excerpt} onChange={e=>setExcerpt(e.target.value)}
            className="w-full bg-ink border border-line px-3 py-1.5 font-sans text-[12px] text-t-2 outline-none focus:border-amber placeholder:text-t-4"
            placeholder="One line summary shown in article cards and search results..."/>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="flex items-center bg-ink-2 border-b border-line overflow-x-auto shrink-0">
        {TOOLBAR.map((t:any, i:number) => {
          if (t.sep) return <div key={i} className="w-px h-4 bg-line-2 mx-0.5 shrink-0"/>
          const Icon = t.icon
          return (
            <button key={i} onClick={t.fn} title={t.tip}
              className="p-2 text-t-3 hover:text-amber hover:bg-ink-1 transition-colors shrink-0">
              <Icon size={12}/>
            </button>
          )
        })}
        <div className="ml-auto border-l border-line shrink-0">
          <button onClick={aiAssist} disabled={aiLoading}
            className="flex items-center gap-1.5 px-3 py-2 font-mono text-[9px] text-cyan hover:bg-cyan/10 transition-colors disabled:opacity-50">
            <Sparkles size={11}/> {aiLoading ? 'GENERATING...' : 'AI ASSIST'}
          </button>
        </div>
      </div>

      {/* LINK DIALOG */}
      {showLinkDialog && (
        <div className="fixed inset-0 bg-ink/70 z-50 flex items-center justify-center" onClick={() => setShowLinkDialog(false)}>
          <div className="bg-ink-1 border border-amber p-5 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="font-mono text-[10px] text-amber mb-4 flex items-center justify-between">
              INSERT LINK <button onClick={() => setShowLinkDialog(false)}><X size={12}/></button>
            </div>
            <input value={linkText} onChange={e=>setLinkText(e.target.value)} placeholder="Link display text"
              className="w-full bg-ink border border-line px-3 py-2 font-sans text-[12px] text-t-1 outline-none focus:border-amber mb-2"/>
            <input value={linkUrl} onChange={e=>setLinkUrl(e.target.value)} placeholder="https://..."
              className="w-full bg-ink border border-line px-3 py-2 font-sans text-[12px] text-t-1 outline-none focus:border-amber mb-3"/>
            <button onClick={insertLink} className="w-full py-2 font-mono text-[10px] border border-amber text-amber hover:bg-amber hover:text-black transition-colors">
              INSERT LINK
            </button>
          </div>
        </div>
      )}

      {/* EDITOR + PREVIEW */}
      <div className="flex flex-1 min-h-0">
        {(viewMode === 'write' || viewMode === 'split') && (
          <div className={`flex flex-col ${viewMode === 'split' ? 'w-1/2 border-r border-line' : 'w-full'}`}>
            <div className="px-3 py-1 bg-ink-2 border-b border-line shrink-0 flex justify-between">
              <span className="font-mono text-[8px] text-t-4 uppercase tracking-wider">MARKDOWN</span>
              <span className="font-mono text-[8px] text-t-4 hidden md:block">Ctrl+B · Ctrl+I · Ctrl+S</span>
            </div>
            <textarea ref={taRef} value={body} onChange={e=>setBody(e.target.value)} onKeyDown={handleKeyDown}
              placeholder={"## Executive Summary\n\nStart with your key insight...\n\n## Market Context\n\nYour analysis here...\n\n## Key Levels\n\n| Level | Type | Signal |\n|-------|------|--------|\n| 22,500 | Resistance | Max OI |\n\n## Conclusion\n\nYour takeaway..."}
              className="flex-1 p-4 bg-transparent outline-none font-mono text-[12px] text-t-1 leading-relaxed resize-none placeholder:text-t-4 overflow-auto"/>
          </div>
        )}

        {(viewMode === 'preview' || viewMode === 'split') && (
          <div className={`flex flex-col overflow-auto ${viewMode === 'split' ? 'w-1/2' : 'w-full'}`}>
            <div className="px-3 py-1 bg-ink-2 border-b border-line shrink-0">
              <span className="font-mono text-[8px] text-t-4 uppercase tracking-wider">LIVE PREVIEW</span>
            </div>
            <div className="p-6 overflow-auto flex-1">
              {title && (
                <div className="mb-6 pb-4 border-b border-line">
                  <div className="text-3xl mb-2">{emoji}</div>
                  <h1 className="font-sans font-bold text-[20px] text-t-1 mb-1 leading-tight">{title}</h1>
                  {subtitle && <p className="font-sans text-t-3 text-[13px] mb-2">{subtitle}</p>}
                  <div className="flex flex-wrap gap-3 font-mono text-[9px] text-t-4">
                    <span>{readTime} MIN READ</span>
                    <span>{wordCount} WORDS</span>
                    {category && <span className="text-amber">{category.toUpperCase()}</span>}
                    {featured && <span className="text-amber">★ FEATURED</span>}
                  </div>
                  {excerpt && <p className="font-sans text-[12px] text-t-3 mt-3 italic border-l-2 border-amber pl-3">{excerpt}</p>}
                </div>
              )}
              {body ? (
                <div dangerouslySetInnerHTML={{ __html: '<p style="color:#8fa4be;font-size:13px;line-height:1.8;margin:0 0 16px">' + renderPreview(body) + '</p>' }}/>
              ) : (
                <p className="font-mono text-[11px] text-t-4">Start writing to see preview...</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM BAR */}
      <div className="flex items-center justify-between px-4 py-2 bg-ink-2 border-t border-line shrink-0">
        <span className="font-mono text-[9px] text-t-4">{wordCount} words · {readTime} min · {body.length} chars</span>
        <div className="flex gap-2">
          <button onClick={() => publish('draft')} disabled={publishing}
            className="flex items-center gap-1 px-3 py-1.5 font-mono text-[9px] border border-line text-t-3 hover:border-amber hover:text-amber transition-colors">
            <Clock size={10}/> SAVE DRAFT
          </button>
          <button onClick={() => publish('published')} disabled={publishing}
            className="flex items-center gap-1 px-5 py-1.5 font-mono text-[9px] border border-amber text-amber hover:bg-amber hover:text-black transition-colors">
            <Send size={10}/> {article?.id ? '▶ UPDATE NOW' : '▶ PUBLISH NOW'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── POSTS TABLE ──────────────────────────────────────────── */
function PostsTable({ onEdit, onNewArticle }: { onEdit: (a:any)=>void, onNewArticle: ()=>void }) {
  const [search, setSearch] = useState('')
  const { data: posts = [], refetch } = useQuery({ queryKey: ['admin-posts-all'], queryFn: () => articlesApi.adminAll().then(r => r.data) })

  const filtered = (posts as any[]).filter(p =>
    p.title?.toLowerCase().includes(search.toLowerCase()) ||
    p.author_name?.toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = async (e: React.MouseEvent, id: number, title: string) => {
    e.stopPropagation()
    if (!confirm(`Delete "${title}"?`)) return
    try { await articlesApi.delete(id); toast.success('Deleted'); refetch() }
    catch { toast.error('Failed to delete') }
  }

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-ink-1">
        <div className="font-sans font-bold text-[17px] text-t-1">All Posts ({filtered.length})</div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-ink border border-line px-3 py-1.5">
            <Search size={11} className="text-t-4"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..."
              className="bg-transparent outline-none font-mono text-[11px] text-t-1 placeholder:text-t-4 w-32"/>
          </div>
          <button onClick={onNewArticle} className="font-mono text-[10px] px-4 py-2 border border-amber text-amber hover:bg-amber hover:text-black transition-colors">+ NEW POST</button>
        </div>
      </div>
      <div className="p-5">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-ink-2 border-b border-line-2">
              {['','TITLE','CATEGORY','STATUS','VIEWS','READ TIME','DATE','ACTIONS'].map(h => (
                <th key={h} className="font-mono text-[9px] text-t-3 uppercase tracking-wider text-left px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((a: any) => (
              <tr key={a.id} className="border-b border-line hover:bg-ink-1 transition-colors group">
                <td className="px-3 py-3 text-lg">{a.cover_emoji || '📊'}</td>
                <td className="px-3 py-3">
                  <div className="font-sans font-medium text-[12px] text-t-1 max-w-[220px] truncate">{a.title}</div>
                  {a.featured && <span className="font-mono text-[8px] text-amber">★ featured</span>}
                </td>
                <td className="px-3 py-3"><span className="font-mono text-[8px] px-1.5 py-0.5 border border-amber/30 text-amber">{a.cat_name || '—'}</span></td>
                <td className="px-3 py-3">
                  <span className={`font-mono text-[8px] px-1.5 py-0.5 border ${a.status==='published'?'bg-green/10 text-green border-green/20':'bg-amber/10 text-amber border-amber/20'}`}>
                    {a.status?.toUpperCase()}
                  </span>
                </td>
                <td className="px-3 py-3 font-mono text-[11px] text-cyan">{a.views_count || 0}</td>
                <td className="px-3 py-3 font-mono text-[10px] text-t-4">{a.read_time_min || 1}m</td>
                <td className="px-3 py-3 font-mono text-[10px] text-t-4">{a.published_at ? new Date(a.published_at).toLocaleDateString('en-IN') : '—'}</td>
                <td className="px-3 py-3">
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={e=>{e.stopPropagation();onEdit(a)}} className="font-mono text-[9px] px-2 py-1 border border-line text-t-3 hover:border-amber hover:text-amber transition-colors">EDIT</button>
                    <button onClick={e=>{e.stopPropagation();window.open(`/blog/article/${a.slug}`,'_blank')}} className="font-mono text-[9px] px-2 py-1 border border-line text-t-3 hover:border-cyan hover:text-cyan transition-colors">VIEW</button>
                    <button onClick={e=>handleDelete(e,a.id,a.title)} className="font-mono text-[9px] px-2 py-1 border border-line text-t-3 hover:border-red hover:text-red transition-colors">DEL</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="text-center py-12 font-mono text-[11px] text-t-4">No articles found</div>}
      </div>
    </div>
  )
}

/* ── ANALYTICS ────────────────────────────────────────────── */
function AnalyticsPanel() {
  const { data: stats } = useQuery({ queryKey: ['admin-analytics'], queryFn: () => analyticsApi.dashboard().then(r => r.data) })
  return (
    <div>
      <div className="px-6 py-4 border-b border-line bg-ink-1 font-sans font-bold text-[17px] text-t-1">Analytics</div>
      <div className="grid grid-cols-4 gap-px bg-line mb-px">
        {[
          { label: "TODAY'S VIEWS", val: '—', up: true },
          { label: 'UNIQUE READERS', val: '—', up: true },
          { label: 'TOTAL VIEWS', val: stats?.total_views || 0, up: true },
          { label: 'TOTAL ARTICLES', val: stats?.total_articles || 0, up: true },
        ].map(s => (
          <div key={s.label} className="bg-ink-1 p-5">
            <div className="font-mono text-[9px] text-t-4 uppercase tracking-wider mb-2">{s.label}</div>
            <div className="font-mono font-light text-[28px] text-t-1">{s.val}</div>
          </div>
        ))}
      </div>
      <div className="p-5">
        <div className="font-mono text-[10px] text-t-3 uppercase tracking-widest mb-4">TOP ARTICLES</div>
        <table className="w-full border-collapse">
          <thead><tr className="bg-ink-2 border-b border-line-2">
            {['ARTICLE','VIEWS','LIKES','SENTIMENT'].map(h => (
              <th key={h} className="font-mono text-[9px] text-t-3 uppercase tracking-wider text-left px-3 py-2">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {(stats?.top_articles || []).map((a: any) => (
              <tr key={a.id} className="border-b border-line hover:bg-ink-1">
                <td className="px-3 py-3 font-sans text-[12px] text-t-1 max-w-[300px] truncate">{a.title}</td>
                <td className="px-3 py-3 font-mono text-[11px] text-cyan">{a.views_count || 0}</td>
                <td className="px-3 py-3 font-mono text-[11px] text-t-2">{a.likes_count || 0}</td>
                <td className={`px-3 py-3 font-mono text-[10px] ${a.sentiment==='bullish'?'text-green':a.sentiment==='bearish'?'text-red':'text-amber'}`}>{a.sentiment?.toUpperCase() || 'NEUTRAL'}</td>
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
  const { data: count }     = useQuery({ queryKey: ['sub-count'],   queryFn: () => subscribersApi.count().then(r => r.data) })
  return (
    <div>
      <div className="px-6 py-4 border-b border-line bg-ink-1 font-sans font-bold text-[17px] text-t-1">Reader Management</div>
      <div className="grid grid-cols-3 gap-px bg-line mb-px">
        {[
          { label: 'TOTAL SUBSCRIBERS', val: count?.count || 0 },
          { label: 'OPEN RATE', val: '—' },
          { label: 'ACTIVE', val: '—' },
        ].map(s => (
          <div key={s.label} className="bg-ink-1 p-5">
            <div className="font-mono text-[9px] text-t-4 uppercase tracking-wider mb-2">{s.label}</div>
            <div className="font-mono font-light text-[28px] text-t-1">{s.val}</div>
          </div>
        ))}
      </div>
      <div className="p-5">
        <table className="w-full border-collapse">
          <thead><tr className="bg-ink-2 border-b border-line-2">
            {['EMAIL','JOINED','SOURCE','STATUS'].map(h => (
              <th key={h} className="font-mono text-[9px] text-t-3 uppercase text-left px-3 py-2">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {(subs as any[]).map((s:any) => (
              <tr key={s.id} className="border-b border-line hover:bg-ink-1">
                <td className="px-3 py-3 font-mono text-[11px] text-t-1">{s.email}</td>
                <td className="px-3 py-3 font-mono text-[10px] text-t-3">{new Date(s.subscribed_at||s.created_at).toLocaleDateString('en-IN')}</td>
                <td className="px-3 py-3 font-mono text-[10px] text-t-4">{s.source||'website'}</td>
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
  return (
    <div>
      <div className="px-6 py-4 border-b border-line bg-ink-1 font-sans font-bold text-[17px] text-t-1">Newsletter</div>
      <div className="p-6 max-w-lg">
        <div className="space-y-4">
          <div>
            <label className="font-mono text-[9px] text-t-4 uppercase tracking-wider block mb-1.5">SUBJECT LINE</label>
            <input value={subject} onChange={e=>setSubject(e.target.value)}
              className="w-full bg-ink-2 border border-line px-3 py-2 font-sans text-[13px] text-t-1 outline-none focus:border-amber"
              placeholder="Pre-Market Brief: NIFTY March 22"/>
          </div>
          <div>
            <label className="font-mono text-[9px] text-t-4 uppercase tracking-wider block mb-1.5">SEND TIME</label>
            <select className="w-full bg-ink-2 border border-line px-3 py-2 font-sans text-[13px] text-t-1 outline-none focus:border-amber">
              <option>Tomorrow 8:30 AM IST</option>
              <option>Monday 8:30 AM IST</option>
              <option>Send Now</option>
            </select>
          </div>
          <button onClick={() => toast.success('Campaign scheduled!')}
            className="w-full font-mono text-[10px] py-2.5 border border-amber text-amber hover:bg-amber hover:text-black transition-colors">
            ▶ SCHEDULE CAMPAIGN
          </button>
        </div>
      </div>
    </div>
  )
}
