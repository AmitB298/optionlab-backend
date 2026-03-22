import { useState, useRef, useEffect } from 'react'
import { BookOpen, ChevronRight, Lightbulb, TrendingUp, Shield, BarChart2, AlertTriangle, X, Send, Sparkles } from 'lucide-react'

const TOPICS = [
  {
    category: 'Options Fundamentals',
    icon: BookOpen,
    color: 'text-amber-400',
    accent: '#f59e0b',
    bg: 'bg-amber-400/10 border-amber-400/20',
    questions: [
      'What is an options contract?',
      'Difference between Call and Put options?',
      'What does In-the-Money (ITM) mean?',
      'What is Open Interest and why does it matter?',
      'American vs European options — what changes?',
    ],
  },
  {
    category: 'Options Greeks',
    icon: TrendingUp,
    color: 'text-blue-400',
    accent: '#60a5fa',
    bg: 'bg-blue-400/10 border-blue-400/20',
    questions: [
      'What is Delta in options trading?',
      'How does Theta decay work?',
      'What is Vega and how does IV affect prices?',
      'What is Gamma and why is it dangerous near expiry?',
      'How do all Greeks interact together?',
    ],
  },
  {
    category: 'Options Strategies',
    icon: BarChart2,
    color: 'text-emerald-400',
    accent: '#34d399',
    bg: 'bg-emerald-400/10 border-emerald-400/20',
    questions: [
      'What is a Bull Call Spread?',
      'Explain the Iron Condor strategy',
      'Straddle vs Strangle — when to use which?',
      'When should I use a Covered Call?',
      'What is a Calendar Spread?',
    ],
  },
  {
    category: 'Risk Management',
    icon: Shield,
    color: 'text-purple-400',
    accent: '#a78bfa',
    bg: 'bg-purple-400/10 border-purple-400/20',
    questions: [
      'How do I calculate maximum loss?',
      'What is position sizing in options?',
      'How does hedging work with options?',
      'Risk of selling naked options?',
      'How to manage a losing options trade?',
    ],
  },
]

type Message = { role: 'user' | 'assistant'; content: string }

export default function LearnPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (drawerOpen) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }, [messages, drawerOpen])

  async function send(text?: string) {
    const q = (text || input).trim()
    if (!q || loading) return
    setInput('')
    setError('')
    setDrawerOpen(true)

    const newMessages: Message[] = [...messages, { role: 'user', content: q }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const res = await fetch('/api/blog/ai/education', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, messages: newMessages }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Server error')
      setMessages(prev => [...prev, { role: 'assistant', content: data.response || 'No response received.' }])
    } catch (err: any) {
      setError(err.message || 'Could not connect.')
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function closeDrawer() {
    setDrawerOpen(false)
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-mono font-semibold mb-2 tracking-widest">
            <Lightbulb size={13} />
            EDUCATION HUB
          </div>
          <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight mb-1">
            Learn Options Trading
          </h1>
          <p className="text-zinc-400 text-sm">
            Tap any question — get an instant AI explanation. Educational only, not investment advice.
          </p>
        </div>

        {/* Disclaimer */}
        <div className="flex gap-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl mb-6">
          <AlertTriangle size={14} className="text-amber-500/70 shrink-0 mt-0.5" />
          <p className="text-[11px] text-zinc-400 font-mono leading-relaxed">
            Not investment advice · Not SEBI registered · Options trading involves substantial risk
          </p>
        </div>

        {/* DESKTOP: side-by-side layout */}
        <div className="hidden lg:grid lg:grid-cols-3 gap-6">
          {/* Topics */}
          <div className="space-y-4">
            <p className="text-xs font-mono font-semibold text-zinc-500 tracking-widest">QUICK TOPICS</p>
            {TOPICS.map(topic => (
              <div key={topic.category} className={`rounded-xl border p-4 ${topic.bg}`}>
                <div className="flex items-center gap-2 mb-3" style={{ color: topic.accent }}>
                  <topic.icon size={13} />
                  <span className="text-xs font-mono font-semibold">{topic.category}</span>
                </div>
                <ul className="space-y-0.5">
                  {topic.questions.map(q => (
                    <li key={q}>
                      <button onClick={() => send(q)} disabled={loading}
                        className="w-full text-left text-xs text-zinc-300 hover:text-white py-1.5 px-2 rounded hover:bg-white/5 transition-all flex items-center gap-2 group">
                        <ChevronRight size={9} className="text-zinc-600 group-hover:text-amber-400 shrink-0 transition-colors" />
                        {q}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Desktop Chat */}
          <div className="lg:col-span-2 flex flex-col bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden" style={{ height: '680px' }}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-700 bg-zinc-900/80">
              <Sparkles size={14} className="text-amber-400" />
              <span className="text-xs font-mono font-semibold text-zinc-300">OptionsLab AI Tutor</span>
              <span className="ml-auto text-[10px] text-zinc-600 font-mono">Education only</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
                    <BookOpen size={24} className="text-amber-400" />
                  </div>
                  <div>
                    <p className="text-zinc-200 text-sm font-semibold">Ask anything about options</p>
                    <p className="text-zinc-500 text-xs mt-1">Click a topic question or type below</p>
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-amber-500 text-zinc-950 font-semibold rounded-br-sm'
                      : 'bg-zinc-800 text-zinc-100 border border-zinc-600 rounded-bl-sm'
                  }`}>
                    <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-zinc-800 border border-zinc-600 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5 items-center">
                    <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              {error && <p className="text-xs text-red-400 font-mono text-center">{error}</p>}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-zinc-700 p-3">
              <div className="flex gap-2">
                <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
                  placeholder="Ask about options concepts..." rows={2} ref={inputRef}
                  className="flex-1 bg-zinc-800 border border-zinc-600 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-amber-500/60 resize-none font-mono" />
                <button onClick={() => send()} disabled={loading || !input.trim()}
                  className="w-12 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 flex items-center justify-center transition-all">
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* MOBILE: Topics grid + floating bottom drawer */}
        <div className="lg:hidden">
          <p className="text-xs font-mono font-semibold text-zinc-500 tracking-widest mb-4">TAP A QUESTION TO LEARN</p>
          <div className="grid grid-cols-1 gap-3">
            {TOPICS.map(topic => (
              <div key={topic.category} className={`rounded-xl border p-4 ${topic.bg}`}>
                <div className="flex items-center gap-2 mb-3" style={{ color: topic.accent }}>
                  <topic.icon size={14} />
                  <span className="text-xs font-mono font-bold tracking-wide">{topic.category}</span>
                </div>
                <div className="grid grid-cols-1 gap-1">
                  {topic.questions.map(q => (
                    <button key={q} onClick={() => send(q)} disabled={loading}
                      className="w-full text-left text-sm text-zinc-200 hover:text-white py-2.5 px-3 rounded-lg bg-black/20 hover:bg-black/40 active:scale-95 transition-all flex items-center justify-between gap-2 group border border-white/5">
                      <span>{q}</span>
                      <ChevronRight size={14} className="text-zinc-500 group-hover:text-amber-400 shrink-0 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Mobile: Type your own question */}
          <div className="mt-4 bg-zinc-900 border border-zinc-700 rounded-xl p-4">
            <p className="text-xs font-mono text-zinc-500 mb-2 tracking-widest">OR ASK YOUR OWN</p>
            <div className="flex gap-2">
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="Type any options question..."
                className="flex-1 bg-zinc-800 border border-zinc-600 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-amber-500/60 font-mono" />
              <button onClick={() => send()} disabled={loading || !input.trim()}
                className="w-12 h-10 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 flex items-center justify-center transition-all">
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE: Bottom Drawer */}
      <div className={`lg:hidden fixed inset-0 z-50 transition-all duration-300 ${drawerOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        {/* Backdrop */}
        <div onClick={closeDrawer}
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${drawerOpen ? 'opacity-100' : 'opacity-0'}`} />

        {/* Drawer panel */}
        <div className={`absolute bottom-0 left-0 right-0 bg-zinc-900 rounded-t-2xl border-t border-zinc-700 flex flex-col transition-transform duration-300 ease-out ${drawerOpen ? 'translate-y-0' : 'translate-y-full'}`}
          style={{ maxHeight: '80vh' }}>

          {/* Drag handle + header */}
          <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-zinc-800 shrink-0">
            <div className="absolute left-1/2 -translate-x-1/2 top-2 w-10 h-1 bg-zinc-600 rounded-full" />
            <div className="flex items-center gap-2 mt-2">
              <Sparkles size={13} className="text-amber-400" />
              <span className="text-xs font-mono font-semibold text-zinc-300">OptionsLab AI Tutor</span>
            </div>
            <button onClick={closeDrawer} className="mt-2 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all">
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-amber-500 text-zinc-950 font-semibold rounded-br-sm'
                    : 'bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-bl-sm'
                }`}>
                  <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 flex gap-1.5">
                  <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            {error && <p className="text-xs text-red-400 font-mono text-center">{error}</p>}
            <div ref={messagesEndRef} />
          </div>

          {/* Mobile input in drawer */}
          <div className="p-3 border-t border-zinc-800 shrink-0 pb-safe">
            <div className="flex gap-2">
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="Follow-up question..."
                className="flex-1 bg-zinc-800 border border-zinc-600 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-amber-500/60" />
              <button onClick={() => send()} disabled={loading || !input.trim()}
                className="w-12 h-10 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 flex items-center justify-center">
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
