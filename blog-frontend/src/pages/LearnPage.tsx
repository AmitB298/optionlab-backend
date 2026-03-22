import { useState, useRef, useEffect } from 'react'
import { BookOpen, Lightbulb, AlertTriangle, Send, Sparkles, RotateCcw, ChevronDown } from 'lucide-react'

const QUICK_CHIPS = [
  { label: 'What is Delta?',          q: 'What is Delta in options trading? Explain with a simple example.' },
  { label: 'How does Theta work?',    q: 'How does Theta decay work and why does it matter for options buyers?' },
  { label: 'Iron Condor strategy',    q: 'Explain the Iron Condor strategy — when to use it and what are the risks?' },
  { label: 'What is IV Percentile?',  q: 'What is IV Percentile and how do traders use it?' },
  { label: 'Bull Call Spread',        q: 'What is a Bull Call Spread? Explain with a hypothetical example.' },
  { label: 'Max Pain explained',      q: 'What is Max Pain in options and how is it calculated?' },
  { label: 'Gamma near expiry',       q: 'Why is Gamma dangerous near expiry for option sellers?' },
  { label: 'What is PCR?',            q: 'What is Put-Call Ratio and how do traders interpret it?' },
  { label: 'Covered Call strategy',   q: 'When should I use a Covered Call strategy?' },
  { label: 'Managing losing trades',  q: 'How do I manage a losing options trade? What are my options?' },
  { label: 'Straddle vs Strangle',    q: 'What is the difference between a Straddle and a Strangle?' },
  { label: 'What is Open Interest?',  q: 'What is Open Interest and why does it matter to options traders?' },
]

type Message = { role: 'user' | 'assistant'; content: string }

export default function LearnPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [started, setStarted] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text?: string) {
    const q = (text || input).trim()
    if (!q || loading) return
    setInput('')
    setError('')
    setStarted(true)

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

  function reset() {
    setMessages([])
    setStarted(false)
    setError('')
    setInput('')
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  return (
    /* Full viewport height, fixed layout: top bar + scrollable content + fixed input */
    <div className="flex flex-col bg-zinc-950" style={{ height: 'calc(100vh - 56px)' }}>

      {/* Top bar */}
      <div className="border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm shrink-0">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <Sparkles size={13} className="text-amber-400" />
            </div>
            <div>
              <p className="text-xs font-mono font-bold text-zinc-200 leading-none">Options AI Tutor</p>
              <p className="text-[10px] text-zinc-600 font-mono mt-0.5">Education only · Not investment advice</p>
            </div>
          </div>
          {started && (
            <button onClick={reset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-600 transition-all">
              <RotateCcw size={11} /> New chat
            </button>
          )}
        </div>
      </div>

      {/* Scrollable middle content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full px-4">

          {/* PRE-CHAT: Welcome + chips */}
          {!started && (
            <div className="flex flex-col justify-center py-8">
              <div className="text-center mb-10">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-5">
                  <BookOpen size={28} className="text-amber-400" />
                </div>
                <h1 className="text-3xl font-black text-white tracking-tight mb-2">
                  Learn Options Trading
                </h1>
                <p className="text-zinc-400 text-sm max-w-sm mx-auto leading-relaxed">
                  Ask any question about options, Greeks, strategies, or risk management.
                  Get clear, educational answers instantly.
                </p>
              </div>

              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4 justify-center">
                  <div className="h-px flex-1 bg-zinc-800" />
                  <span className="text-xs font-mono text-zinc-600 tracking-widest">POPULAR QUESTIONS</span>
                  <div className="h-px flex-1 bg-zinc-800" />
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {QUICK_CHIPS.map(chip => (
                    <button key={chip.label} onClick={() => send(chip.q)} disabled={loading}
                      className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-zinc-300 hover:text-white hover:border-amber-500/50 hover:bg-zinc-800 active:scale-95 transition-all font-mono">
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 p-3 bg-amber-500/5 border border-amber-500/15 rounded-xl mb-6 max-w-lg mx-auto w-full">
                <AlertTriangle size={13} className="text-amber-500/60 shrink-0 mt-0.5" />
                <p className="text-[11px] text-zinc-500 font-mono leading-relaxed">
                  Educational content only. Not investment advice. Options trading involves substantial risk of loss.
                  OptionsLab is not SEBI registered. Consult a registered adviser before trading.
                </p>
              </div>

              <div className="flex justify-center lg:hidden">
                <div className="flex flex-col items-center gap-1 text-zinc-700 animate-bounce">
                  <ChevronDown size={16} />
                  <span className="text-[10px] font-mono">type below</span>
                </div>
              </div>
            </div>
          )}

          {/* CHAT: Messages */}
          {started && (
            <div className="py-6 space-y-5">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 mt-1">
                      <Sparkles size={12} className="text-amber-400" />
                    </div>
                  )}
                  <div className={`${m.role === 'user' ? 'max-w-[75%]' : 'max-w-[85%]'}`}>
                    {m.role === 'user' ? (
                      <div className="bg-amber-500 text-zinc-950 font-semibold rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed">
                        {m.content}
                      </div>
                    ) : (
                      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl rounded-tl-sm px-4 py-4 text-sm text-zinc-100 leading-relaxed">
                        <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
                        {i === messages.length - 1 && !loading && (
                          <div className="mt-4 pt-3 border-t border-zinc-800">
                            <p className="text-[10px] font-mono text-zinc-600 mb-2 tracking-widest">RELATED QUESTIONS</p>
                            <div className="flex flex-wrap gap-1.5">
                              {QUICK_CHIPS.filter(c => !messages.some(msg => msg.content === c.q))
                                .slice(0, 3).map(chip => (
                                <button key={chip.label} onClick={() => send(chip.q)}
                                  className="px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-400 hover:text-white hover:border-zinc-500 transition-all font-mono">
                                  {chip.label} →
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {m.role === 'user' && (
                    <div className="w-7 h-7 rounded-lg bg-zinc-700 flex items-center justify-center shrink-0 mt-1 text-[11px] font-bold text-zinc-300">
                      U
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex gap-3 justify-start">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                    <Sparkles size={12} className="text-amber-400" />
                  </div>
                  <div className="bg-zinc-900 border border-zinc-700 rounded-2xl rounded-tl-sm px-4 py-4">
                    <div className="flex gap-1.5 items-center">
                      <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      <span className="ml-2 text-xs text-zinc-600 font-mono">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="text-center">
                  <p className="text-xs text-red-400 font-mono">{error}</p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Fixed input bar — always at bottom */}
      <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="relative flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-2xl px-4 py-3 focus-within:border-amber-500/50 transition-colors shadow-lg shadow-black/50">
            <Lightbulb size={16} className="text-zinc-600 shrink-0" />
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ask about options, Greeks, strategies..."
              className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 outline-none"
              autoComplete="off"
            />
            <button onClick={() => send()} disabled={loading || !input.trim()}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0 ${
                input.trim() && !loading
                  ? 'bg-amber-500 hover:bg-amber-400 text-zinc-950'
                  : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
              }`}>
              <Send size={14} />
            </button>
          </div>
          <p className="text-center text-[10px] text-zinc-700 font-mono mt-2">
            Educational use only · Not SEBI registered · Not investment advice
          </p>
        </div>
      </div>

    </div>
  )
}
