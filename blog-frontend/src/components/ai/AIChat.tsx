import { useState, useRef, useEffect } from 'react'
import { Send, Zap, RefreshCw } from 'lucide-react'
import { aiApi } from '../../utils/api'

interface Message { role: 'user' | 'assistant'; content: string }

const QUICK_PROMPTS = [
  { label: 'NIFTY SENTIMENT',  text: 'What is the current market sentiment for NIFTY based on OI and PCR data?' },
  { label: 'VIX ANALYSIS',     text: 'India VIX is at 14.3 — is now a good time to buy options or sell premium?' },
  { label: 'RANGE STRATEGY',   text: 'Best option strategies for a rangebound NIFTY between 22,200 and 22,500.' },
  { label: 'FII SIGNAL',       text: 'FIIs are net long index futures by 18,400 contracts. What does this signal?' },
  { label: 'BNK BRIEF',        text: 'Generate a pre-market analysis brief for BANKNIFTY for today.' },
  { label: 'MAX PAIN',         text: 'Explain how the 22,500 max pain level will affect Thursday expiry.' },
]

export default function AIChat() {
  const [messages, setMessages] = useState<Message[]>([{
    role: 'assistant',
    content: "Good morning. I'm your OptionsLab AI Market Analyst with full context on today's market — NIFTY at 22,347, BANKNIFTY at 47,984, VIX at 14.32, and the 22,500 CE OI wall at 45.2 lakh contracts.\n\nAsk me about OI analysis, PCR signals, IV interpretation, expiry strategies, or FII data. What would you like to analyze?"
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendMsg = async (text?: string) => {
    const q = (text || input).trim()
    if (!q || loading) return
    setInput('')
    const newMessages: Message[] = [...messages, { role: 'user', content: q }]
    setMessages(newMessages)
    setLoading(true)
    try {
      const { data } = await aiApi.chat({ messages: newMessages })
      setMessages([...newMessages, { role: 'assistant', content: data.response }])
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: '⚠ AI service temporarily unavailable. Please check your API key in backend .env and retry.' }])
    } finally {
      setLoading(false)
    }
  }

  const clearChat = () => setMessages([{
    role: 'assistant',
    content: "Chat cleared. Ready for your next market question."
  }])

  return (
    <div className="bg-ink-1 border border-line flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-0 border-b border-line h-9">
        <div className="flex items-center gap-2 px-4 h-full border-r border-line border-b-2 border-b-cyan">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse-glow" />
          <span className="font-mono text-[10px] text-cyan uppercase tracking-wider">AI Market Analyst</span>
          <span className="font-mono font-bold text-[8px] bg-red text-white px-1.5 py-0.5 tracking-wider animate-blink">CLAUDE</span>
        </div>
        <button onClick={clearChat} className="ml-auto mr-3 text-t-4 hover:text-amber transition-colors">
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[260px] max-h-[400px]">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-7 h-7 border flex items-center justify-center font-mono font-bold text-[9px] shrink-0
              ${msg.role === 'assistant'
                ? 'border-cyan text-cyan bg-cyan/6'
                : 'border-amber text-amber bg-amber/6'}`}
            >
              {msg.role === 'assistant' ? 'AI' : 'YOU'}
            </div>
            <div className={`border px-3 py-2.5 font-sans font-light text-[13px] leading-relaxed text-t-2 max-w-2xl whitespace-pre-wrap
              ${msg.role === 'assistant'
                ? 'bg-ink-2 border-line border-l-cyan border-l-2'
                : 'bg-amber/5 border-line border-r-amber border-r-2'}`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 border border-cyan text-cyan bg-cyan/6 flex items-center justify-center font-mono font-bold text-[9px]">AI</div>
            <div className="bg-ink-2 border border-line border-l-2 border-l-cyan px-3 py-2.5 flex items-center gap-1">
              {[0,1,2].map(i => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-cyan opacity-60"
                  style={{ animation: `bounce 1.2s ease infinite ${i * 0.2}s` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      <div className="flex gap-1.5 flex-wrap px-4 pb-2 border-t border-line pt-2 bg-ink-2">
        <span className="font-mono text-[9px] text-t-4 self-center mr-1 uppercase tracking-widest">Quick:</span>
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p.label}
            onClick={() => sendMsg(p.text)}
            disabled={loading}
            className="font-mono text-[9px] px-2 py-1 border border-line text-t-3 hover:border-amber hover:text-amber transition-colors disabled:opacity-50"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex border-t border-line">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && !e.shiftKey && sendMsg()}
          placeholder="Ask about NIFTY OI, PCR, expiry setups, IV strategies..."
          className="flex-1 bg-ink-2 border-none outline-none px-4 py-3 font-mono text-[13px] text-t-1 placeholder:text-t-4"
          disabled={loading}
        />
        <button
          onClick={() => sendMsg()}
          disabled={loading || !input.trim()}
          className="px-4 border-l border-line text-amber hover:bg-amber hover:text-black transition-colors disabled:opacity-40 flex items-center gap-2"
        >
          <Zap size={13} />
          <span className="font-mono text-[10px] uppercase hidden sm:inline">Send</span>
        </button>
      </div>
    </div>
  )
}


