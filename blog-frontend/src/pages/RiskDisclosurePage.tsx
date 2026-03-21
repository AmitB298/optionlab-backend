import { AlertTriangle } from 'lucide-react'

export default function RiskDisclosurePage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-8">
          <AlertTriangle size={24} className="text-amber-500" />
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Risk Disclosure Document</h1>
            <p className="text-zinc-600 text-xs font-mono mt-1">Last updated: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>

        <div className="space-y-6 text-sm text-zinc-400 leading-relaxed">
          <div className="p-5 bg-amber-500/5 border border-amber-500/20 rounded-xl">
            <p className="text-amber-400 font-semibold font-mono text-xs mb-2">IMPORTANT — PLEASE READ CAREFULLY</p>
            <p>This document contains important risk disclosures for users of the OptionsLab platform. By using this platform, you acknowledge that you have read, understood, and accepted these disclosures.</p>
          </div>

          {[
            {
              title: '1. Nature of the Platform',
              content: 'OptionsLab is a financial education and information platform only. OptionsLab is NOT registered with the Securities and Exchange Board of India (SEBI) as a Research Analyst, Investment Adviser, Stock Broker, or in any other capacity. Nothing on this platform constitutes investment advice, a recommendation to buy or sell any security, or any form of financial advisory service.'
            },
            {
              title: '2. No Investment Advice',
              content: 'All content on OptionsLab — including articles, educational materials, tools, calculators, and AI-generated educational responses — is strictly for informational and educational purposes. Content should not be construed as advice or recommendation to buy, sell, or hold any security or financial instrument. Users should not make investment or trading decisions based solely on information obtained from this platform.'
            },
            {
              title: '3. Risk of Options and Derivatives Trading',
              content: 'Options and derivatives trading involves a substantial risk of loss. These instruments are highly leveraged and can result in losses exceeding your initial investment. The following specific risks apply:\n\n• Options can expire completely worthless, resulting in a total loss of the premium paid.\n• Selling (writing) options exposes you to potentially unlimited losses in certain strategies.\n• Leveraged positions can amplify losses rapidly.\n• Liquidity risk: options contracts may not always be easily tradeable.\n• Time decay (Theta) constantly erodes the value of options you own.\n• Volatility changes can significantly impact option values in unexpected ways.\n• Near-expiry options exhibit extreme price sensitivity (high Gamma risk).'
            },
            {
              title: '4. Suitability',
              content: 'Options and derivatives trading is not suitable for all investors. You should only trade options if:\n\n• You fully understand how options work, including all associated risks.\n• You can afford to lose your entire investment.\n• You have sufficient knowledge and experience with financial markets.\n• You have consulted with a SEBI-registered financial adviser who has assessed your risk profile.'
            },
            {
              title: '5. Educational Content Limitation',
              content: 'All examples, case studies, and hypothetical scenarios used in educational content on OptionsLab are for illustrative purposes only. They do not represent actual trading recommendations or real market analysis. Past examples do not predict or guarantee future market behavior.'
            },
            {
              title: '6. No Guarantee of Accuracy',
              content: 'While OptionsLab strives to provide accurate educational content, we make no warranty — express or implied — regarding the accuracy, completeness, or timeliness of any information provided. Financial markets are dynamic and information can become outdated rapidly.'
            },
            {
              title: '7. AI-Generated Content',
              content: 'OptionsLab uses artificial intelligence to generate educational content. AI-generated content is for educational purposes only and may contain errors or inaccuracies. AI content on this platform is not a substitute for professional financial advice from a SEBI-registered adviser.'
            },
            {
              title: '8. Consult a SEBI-Registered Adviser',
              content: 'Before making any investment or trading decision, we strongly recommend consulting a SEBI-registered Research Analyst (RA) or Investment Adviser (IA). They are qualified professionals who can assess your individual financial situation and risk tolerance.\n\nYou can verify the registration of any financial adviser at: https://www.sebi.gov.in'
            },
            {
              title: '9. Applicable Law',
              content: 'This platform is governed by the laws of India. Any disputes shall be subject to the jurisdiction of courts in India. Users are responsible for ensuring their use of this platform complies with laws applicable in their jurisdiction.'
            },
          ].map(section => (
            <div key={section.title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="font-bold text-white font-mono text-sm mb-3">{section.title}</h2>
              <p className="text-zinc-500 text-xs leading-relaxed whitespace-pre-line">{section.content}</p>
            </div>
          ))}

          <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl">
            <p className="text-zinc-600 text-xs font-mono text-center">
              OptionsLab · Financial Education Platform · India<br />
              Not SEBI registered · For educational use only
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
