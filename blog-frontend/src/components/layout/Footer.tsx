import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="bg-ink-1 border-t border-line mt-px">
      <div className="grid grid-cols-5 border-b border-line">
        {/* Brand */}
        <div className="col-span-2 p-7 border-r border-line">
          <div className="font-sans font-bold text-base text-t-1 mb-1">
            Option<span className="text-amber">Lab</span>
          </div>
          <div className="font-mono text-[8px] text-t-4 tracking-widest uppercase mb-3">Market Intelligence Platform</div>
          <p className="font-sans font-light text-xs text-t-3 leading-relaxed max-w-xs">
            India's most advanced AI-powered options analytics and market intelligence platform. Built for serious derivatives traders who demand more than price data.
          </p>
        </div>
        {/* Links */}
        {[
          { title: 'ANALYSIS', links: ['NIFTY Analysis','BANKNIFTY Reports','FII/DII Tracker','OI Analysis','IV Reports'] },
          { title: 'TOOLS',    links: ['Options Chain','PCR Calculator','IV Percentile','Max Pain','Payoff Graph'] },
          { title: 'AUTHORS',  links: ['Rahul Verma','Priya Sharma','Aditya Kumar','Meera Nair'] },
          { title: 'LEGAL',    links: ['Privacy Policy','Terms of Use','Risk Disclosure','Cookie Policy'] },
        ].map((col) => (
          <div key={col.title} className="p-7 border-r border-line last:border-r-0">
            <div className="font-mono text-[9px] text-t-4 tracking-[2px] uppercase mb-3">{col.title}</div>
            {col.links.map((l) => (
              <a key={l} className="block font-sans font-light text-xs text-t-3 mb-2 hover:text-amber transition-colors cursor-pointer">{l}</a>
            ))}
          </div>
        ))}
      </div>

      {/* SEBI Disclaimer */}
      <div className="px-6 py-3 bg-amber/5 border-b border-amber/10">
        <p className="font-mono text-[10px] text-t-4 leading-relaxed">
          ⚠ SEBI DISCLAIMER: All content published on OptionLab is strictly for educational and informational purposes only. This platform does not provide investment advice, SEBI-registered advisory services, or recommendations to buy/sell any financial instrument. Options trading involves substantial risk of loss. Past performance is not indicative of future results. Consult a SEBI-registered investment advisor before making any investment decisions.
        </p>
      </div>

      <div className="flex justify-between items-center px-6 py-3">
        <span className="font-mono text-[10px] text-t-4">© 2026 OPTIONLAB INTELLIGENCE. ALL RIGHTS RESERVED. | OPTIONSLAB.IN</span>
        <span className="font-mono text-[10px] text-t-4">DATA DELAYED 15 MIN. NOT SEBI REGISTERED.</span>
      </div>
    </footer>
  )
}
