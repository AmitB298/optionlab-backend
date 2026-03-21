import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950 mt-16">
      {/* SEBI Compliance Banner */}
      <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-4">
        <div className="max-w-5xl mx-auto flex gap-3 items-start">
          <AlertTriangle size={16} className="text-amber-500/60 shrink-0 mt-0.5" />
          <div className="text-xs text-zinc-500 font-mono leading-relaxed">
            <strong className="text-amber-500/80 font-semibold">IMPORTANT DISCLAIMER: </strong>
            OptionsLab is a financial education and information platform only. We are NOT registered with SEBI as a Research Analyst or Investment Adviser.
            Nothing on this website constitutes investment advice, a recommendation to buy or sell securities, or a solicitation of any kind.
            All educational content, tools, and articles are for informational purposes only and should not be relied upon for trading or investment decisions.
            Options and derivatives trading involves a substantial risk of loss and is not suitable for all investors.
            Past educational examples do not guarantee future results. Always consult a SEBI-registered Research Analyst or Investment Adviser before making investment decisions.
            Please read the <a href="/risk-disclosure" className="text-amber-500/70 hover:text-amber-400 underline underline-offset-2">Risk Disclosure Document</a> before using this platform.
          </div>
        </div>
      </div>

      {/* Main footer */}
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-10">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center font-black text-white text-xs font-mono">OL</div>
              <span className="font-black text-white text-sm tracking-tight">Options<span className="text-amber-400">Lab</span></span>
            </div>
            <p className="text-xs text-zinc-600 leading-relaxed">
              India's financial education platform for derivatives learners.
            </p>
            <p className="text-[10px] text-zinc-700 font-mono mt-2">Educational platform only · Not SEBI registered</p>
          </div>

          {/* Learn */}
          <div>
            <h4 className="text-xs font-mono font-semibold text-zinc-400 tracking-widest mb-3">LEARN</h4>
            <ul className="space-y-2">
              {[
                ['Learn', '/learn'],
                ['Glossary', '/glossary'],
                ['Analysis', '/analysis'],
                ['Tools', '/tools'],
              ].map(([label, to]) => (
                <li key={to}><Link to={to} className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors font-mono">{label}</Link></li>
              ))}
            </ul>
          </div>

          {/* Platform */}
          <div>
            <h4 className="text-xs font-mono font-semibold text-zinc-400 tracking-widest mb-3">PLATFORM</h4>
            <ul className="space-y-2">
              {[
                ['Terminal', '/'],
                ['Authors', '/authors'],
                ['Write', '/write'],
              ].map(([label, to]) => (
                <li key={to}><Link to={to} className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors font-mono">{label}</Link></li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-xs font-mono font-semibold text-zinc-400 tracking-widest mb-3">LEGAL</h4>
            <ul className="space-y-2">
              {[
                ['Disclaimer', '/disclaimer'],
                ['Risk Disclosure', '/risk-disclosure'],
                ['Privacy Policy', '/privacy'],
                ['Terms of Use', '/terms'],
              ].map(([label, to]) => (
                <li key={to}><Link to={to} className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors font-mono">{label}</Link></li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-zinc-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[10px] text-zinc-700 font-mono">© {new Date().getFullYear()} OptionsLab · Financial Education Platform · India</p>
          <p className="text-[10px] text-zinc-700 font-mono text-center">
            Not SEBI registered · For education only · Not investment advice
          </p>
        </div>
      </div>
    </footer>
  )
}
