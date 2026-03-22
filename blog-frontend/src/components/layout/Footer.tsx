import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950 mt-16">
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
