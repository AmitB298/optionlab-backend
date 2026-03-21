import { useState } from 'react'
import { Search, BookOpen } from 'lucide-react'

const TERMS: { term: string; category: string; definition: string; example?: string }[] = [
  { term: 'At-the-Money (ATM)', category: 'Options Basics', definition: 'An option where the strike price is equal to or very close to the current market price of the underlying asset.', example: 'If a stock trades at ₹500 and you hold a ₹500 strike call option, that option is ATM.' },
  { term: 'Call Option', category: 'Options Basics', definition: 'A contract giving the buyer the right (but not obligation) to buy an underlying asset at a specified strike price before expiry.', example: 'Buying a Call option profits when the underlying asset price rises above the strike price.' },
  { term: 'Put Option', category: 'Options Basics', definition: 'A contract giving the buyer the right (but not obligation) to sell an underlying asset at a specified strike price before expiry.', example: 'Buying a Put option profits when the underlying asset price falls below the strike price.' },
  { term: 'Strike Price', category: 'Options Basics', definition: 'The predetermined price at which an option contract can be exercised. Also called the exercise price.' },
  { term: 'Expiry Date', category: 'Options Basics', definition: 'The date on which an options contract expires and becomes void. In India, NSE weekly options expire every Thursday.' },
  { term: 'Premium', category: 'Options Basics', definition: 'The price paid by the option buyer to the option seller for the rights granted by the contract.' },
  { term: 'In-the-Money (ITM)', category: 'Options Basics', definition: 'A call option is ITM when its strike price is below the current market price. A put option is ITM when its strike price is above current market price.', example: 'A ₹450 Call option is ITM when the stock trades at ₹500.' },
  { term: 'Out-of-the-Money (OTM)', category: 'Options Basics', definition: 'A call option is OTM when its strike price is above the current market price. A put is OTM when its strike is below current market price.', example: 'A ₹550 Call option is OTM when the stock trades at ₹500.' },
  { term: 'Open Interest (OI)', category: 'Market Data', definition: 'The total number of outstanding options contracts that have not been settled or closed. Rising OI suggests new money entering; falling OI suggests contracts being closed.' },
  { term: 'Volume', category: 'Market Data', definition: 'The number of option contracts traded during a given period. High volume indicates strong interest in a particular strike or expiry.' },
  { term: 'Implied Volatility (IV)', category: 'Market Data', definition: 'The market\'s expectation of future price movement, derived from option prices. High IV means options are expensive; low IV means options are cheap.', example: 'IV typically spikes before major events like earnings or budget announcements.' },
  { term: 'IV Percentile', category: 'Market Data', definition: 'Shows where current IV stands relative to its historical range over a given period. IV Percentile of 80 means current IV is higher than 80% of historical readings.' },
  { term: 'Max Pain', category: 'Market Data', definition: 'The strike price at which the largest number of options (both calls and puts) expire worthless, causing maximum financial pain to option buyers and minimum payout from sellers.', example: 'Often used as a theoretical reference point, not as a trading signal.' },
  { term: 'Delta (Δ)', category: 'Greeks', definition: 'Measures how much an option\'s price changes for every ₹1 move in the underlying. Ranges from 0 to 1 for calls and 0 to -1 for puts.', example: 'A delta of 0.5 means the option price moves ₹0.50 for every ₹1 move in the underlying.' },
  { term: 'Theta (Θ)', category: 'Greeks', definition: 'Measures the rate at which an option loses value due to the passage of time (time decay). Theta is always negative for option buyers and positive for sellers.', example: 'A theta of -5 means the option loses ₹5 in value every day, all else equal.' },
  { term: 'Vega (ν)', category: 'Greeks', definition: 'Measures an option\'s sensitivity to changes in implied volatility. A vega of 10 means the option price changes by ₹10 for every 1% change in IV.' },
  { term: 'Gamma (Γ)', category: 'Greeks', definition: 'The rate of change of delta. High gamma means delta changes rapidly — options near ATM and near expiry have the highest gamma.', example: 'High gamma near expiry makes short options positions very risky.' },
  { term: 'Rho (ρ)', category: 'Greeks', definition: 'Measures sensitivity to interest rate changes. Generally less important for short-dated equity options in India.' },
  { term: 'Iron Condor', category: 'Strategies', definition: 'A neutral strategy combining a bull put spread and a bear call spread. Profits when the underlying stays within a defined price range until expiry.' },
  { term: 'Straddle', category: 'Strategies', definition: 'Buying (or selling) both a call and a put at the same strike and expiry. A long straddle profits from large moves in either direction; a short straddle profits from low volatility.' },
  { term: 'Strangle', category: 'Strategies', definition: 'Similar to a straddle but using OTM options — buying a lower-strike put and a higher-strike call. Cheaper than a straddle but requires a larger move to profit.' },
  { term: 'Bull Call Spread', category: 'Strategies', definition: 'Buying a lower-strike call and selling a higher-strike call. Reduces cost vs buying a naked call but caps upside profit.' },
  { term: 'Bear Put Spread', category: 'Strategies', definition: 'Buying a higher-strike put and selling a lower-strike put. Reduces cost vs buying a naked put but caps downside profit.' },
  { term: 'Calendar Spread', category: 'Strategies', definition: 'Selling a near-term option and buying a longer-dated option at the same strike. Profits from accelerated time decay of the near-term option.' },
  { term: 'Covered Call', category: 'Strategies', definition: 'Holding a long position in an asset while selling a call option on the same asset. Generates income but caps upside.' },
  { term: 'PCR (Put-Call Ratio)', category: 'Market Data', definition: 'Ratio of put option volume (or OI) to call option volume (or OI). Used as a sentiment indicator. High PCR may indicate bearish sentiment; low PCR bullish.', example: 'PCR is a sentiment gauge, not a directional trading signal.' },
  { term: 'Intrinsic Value', category: 'Options Basics', definition: 'The portion of an option\'s premium that reflects the amount it is in-the-money. OTM options have zero intrinsic value.' },
  { term: 'Time Value (Extrinsic Value)', category: 'Options Basics', definition: 'The portion of an option\'s premium above its intrinsic value. Reflects time remaining to expiry and implied volatility. Decays to zero at expiry.' },
  { term: 'Assignment', category: 'Options Basics', definition: 'When an option seller is required to fulfill the contract obligations because the buyer exercises the option.' },
  { term: 'Lot Size', category: 'Options Basics', definition: 'The minimum number of shares/units in one options contract. In India, lot sizes are set by NSE and vary by instrument.' },
  { term: 'Margin', category: 'Risk', definition: 'Funds required by a broker to hold an options selling position. Selling options requires significantly more margin than buying.' },
  { term: 'Mark-to-Market (MTM)', category: 'Risk', definition: 'Daily settlement of gains and losses based on closing prices. MTM losses are debited from your account daily.' },
]

const CATEGORIES = ['All', ...Array.from(new Set(TERMS.map(t => t.category)))]

export default function GlossaryPage() {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')

  const filtered = TERMS.filter(t => {
    const matchCat = activeCategory === 'All' || t.category === activeCategory
    const matchSearch = !search || t.term.toLowerCase().includes(search.toLowerCase()) || t.definition.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-mono font-semibold mb-3 tracking-widest">
            <BookOpen size={14} />
            REFERENCE
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight mb-2">Options Glossary</h1>
          <p className="text-zinc-500 text-sm">Definitions of key options and derivatives terms for Indian markets.</p>
        </div>

        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search terms..."
              className="w-full pl-9 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-amber-500/50 font-mono"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-2 rounded-lg text-xs font-mono font-semibold transition-all ${
                  activeCategory === cat
                    ? 'bg-amber-500 text-black'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Count */}
        <p className="text-xs text-zinc-600 font-mono mb-4">{filtered.length} terms</p>

        {/* Terms grid */}
        <div className="grid gap-3">
          {filtered.map(t => (
            <div key={t.term} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
              <div className="flex items-start justify-between gap-4 mb-2">
                <h3 className="font-black text-white text-base tracking-tight">{t.term}</h3>
                <span className="shrink-0 px-2 py-0.5 bg-zinc-800 rounded text-[10px] font-mono text-zinc-500 border border-zinc-700">{t.category}</span>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed">{t.definition}</p>
              {t.example && (
                <p className="mt-2 text-xs text-amber-500/70 font-mono pl-3 border-l border-amber-500/30">
                  {t.example}
                </p>
              )}
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-zinc-600 font-mono text-sm">No terms found for "{search}"</p>
          </div>
        )}

        <p className="text-center text-[10px] text-zinc-700 font-mono mt-10">
          All definitions are for educational purposes only. Not investment advice. OptionsLab is a SEBI-compliant financial education platform.
        </p>
      </div>
    </div>
  )
}
