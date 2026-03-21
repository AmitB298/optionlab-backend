import { useState } from 'react'
import { BookOpen, ChevronRight, Lightbulb, TrendingUp, Shield, BarChart2, AlertTriangle } from 'lucide-react'

const TOPICS = [
  {
    category: 'Options Fundamentals',
    icon: BookOpen,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10 border-amber-400/20',
    questions: [
      'What is an options contract?',
      'What is the difference between Call and Put options?',
      'What does In-the-Money (ITM) mean?',
      'What is Open Interest and why does it matter?',
      'What is the difference between American and European options?',
    ],
  },
  {
    category: 'Options Greeks',
    icon: TrendingUp,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10 border-blue-400/20',
    questions: [
      'What is Delta in options trading?',
      'What is Theta decay and how does it work?',
      'What is Vega and how does IV affect option prices?',
      'What is Gamma and why is it dangerous near expiry?',
      'How do all the Greeks interact together?',
    ],
  },
  {
    category: 'Options Strategies',
    icon: BarChart2,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10 border-emerald-400/20',
    questions: [
      'What is a Bull Call Spread?',
      'Explain the Iron Condor strategy',
      'What is a Straddle vs a Strangle?',
      'When should I use a Covered Call?',
      'What is Calendar Spread and how does it work?',
    ],
  },
  {
    category: 'Risk Management',
    icon: Shield,
    color: 'text-purple-400',
    bg: 'bg-purple-400/10 border-purple-400/20',
    questions: [
      'How do I calculate maximum loss on an options trade?',
      'What is position sizing in options trading?',
      'How does hedging work with options?',
      'What is the risk of selling naked options?',
      'How do I manage a losing options trade?',
    ],
  },
]

const DISCLAIMER = `This educational assistant explains options and derivatives concepts for learning purposes only.
It does not provide investment advice, stock recommendations, or trading signals.
All examples use hypothetical or historical data. Never make trading decisions based on educational content alone.
Options trading involves substantial risk. Consult a SEBI-registered advisor before trading.`

export default function LearnPage() {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function send(text?: string) {
    const q = (text || input).trim()
    if (!q || loading) return
    setInput('')
    setError('')

    const newMessages = [...messages, { role: 'user' as const, content: q }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You are OptionsLab's financial education assistant. Your role is STRICTLY educational.

RULES YOU MUST FOLLOW:
1. Only explain concepts, strategies, and principles of options/derivatives trading in general terms
2. Never recommend buying or selling any specific stock, index level, or security
3. Never reference current or recent market prices, levels, or data
4. Never say things like "NIFTY is at X" or "buy when the market does Y"
5. Use only hypothetical examples like "suppose a stock is trading at ₹100..."
6. Always add a brief reminder that options trading involves risk
7. If asked for stock tips, trading signals, or specific recommendations, politely decline and explain you only cover educational content
8. Keep answers clear, structured, and beginner-friendly unless the question is advanced

You are helping Indian retail traders understand derivatives concepts on OptionsLab — a SEBI-compliant education platform.`,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      })

      const data = await response.json()
      const reply = data.content?.[0]?.text || 'Sorry, I could not generate a response. Please try again.'
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setError('Could not connect. Please try again.')
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-mono font-semibold mb-3 tracking-widest">
            <Lightbulb size={14} />
            EDUCATION HUB
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight mb-2">
            Learn Options Trading
          </h1>
          <p className="text-zinc-500 text-sm max-w-xl">
            Ask anything about options, derivatives, Greeks, and strategies. 
            General educational content — no stock tips, no market calls.
          </p>
        </div>

        {/* Disclaimer */}
        <div className="flex gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl mb-8">
          <AlertTriangle size={16} className="text-amber-500/70 shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-500 font-mono leading-relaxed">{DISCLAIMER}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Topic quick-fire buttons */}
          <div className="space-y-4">
            <h2 className="text-xs font-mono font-semibold text-zinc-500 tracking-widest uppercase">Quick Topics</h2>
            {TOPICS.map(topic => (
              <div key={topic.category} className={`rounded-xl border p-4 ${topic.bg}`}>
                <div className={`flex items-center gap-2 mb-3 ${topic.color}`}>
                  <topic.icon size={14} />
                  <span className="text-xs font-mono font-semibold tracking-wide">{topic.category}</span>
                </div>
                <ul className="space-y-1">
                  {topic.questions.map(q => (
                    <li key={q}>
                      <button
                        onClick={() => send(q)}
                        disabled={loading}
                        className="w-full text-left text-xs text-zinc-400 hover:text-white py-1 px-2 rounded hover:bg-white/5 transition-all flex items-center gap-2 group"
                      >
                        <ChevronRight size={10} className="text-zinc-700 group-hover:text-amber-400 shrink-0 transition-colors" />
                        {q}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Chat window */}
          <div className="lg:col-span-2 flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden h-[680px]">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-12 h-12 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mb-4">
                    <BookOpen size={20} className="text-amber-400" />
                  </div>
                  <p className="text-zinc-400 text-sm font-medium">Ask me anything about options trading</p>
                  <p className="text-zinc-600 text-xs mt-1">Greeks, strategies, risk management, concepts...</p>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-amber-500 text-black font-medium'
                      : 'bg-zinc-800 text-zinc-200 border border-zinc-700'
                  }`}>
                    <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3">
                    <div className="flex gap-1.5">
                      <span className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <p className="text-xs text-red-400 font-mono text-center">{error}</p>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-zinc-800 p-3">
              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Ask about options concepts, Greeks, strategies..."
                  rows={2}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-amber-500/50 resize-none font-mono"
                />
                <button
                  onClick={() => send()}
                  disabled={loading || !input.trim()}
                  className="px-4 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-xs font-mono transition-all"
                >
                  SEND
                </button>
              </div>
              <p className="text-[10px] text-zinc-700 font-mono mt-2 text-center">
                Educational use only · Not investment advice · SEBI compliant
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
