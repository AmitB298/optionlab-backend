const router = require('express').Router();
const { auth } = require('../middleware/auth');
const pool = require('../db/pool');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MARKET_ANALYST_SYSTEM = `You are a senior derivatives market analyst for OptionLab (optionslab.in), India's premier options intelligence platform. You specialize in NIFTY 50, BANKNIFTY, and FINNIFTY options and futures analysis.

Your deep expertise covers:
- Open Interest (OI) analysis and interpretation
- Put-Call Ratio (PCR) signals and divergence
- Implied Volatility (IV) surface analysis and skew
- Max pain theory and expiry pinning dynamics
- India VIX interpretation and volatility regimes
- FII/DII participant-wise positioning data from NSE
- Options Greeks and their market implications
- Expiry-day dynamics and gamma risk
- Sector rotation signals from options flow

Current market context (as of today):
- NIFTY 50: 22,347 (-0.31%), BANKNIFTY: 47,984 (+0.26%), FINNIFTY: 23,108 (-0.18%)
- India VIX: 14.32 (+6.23%) — moderate volatility regime
- NIFTY 22,500 CE: 45.2 lakh OI (largest call concentration), PCR at 0.73
- FIIs net long in index futures with 18,400 long additions, 6,200 short reductions
- Max pain NIFTY: 22,300, BANKNIFTY: 47,900

Response guidelines:
- Be precise, data-driven, and structured. Use specific numbers and strike levels.
- Frame analysis as educational insights (SEBI-compliant — no direct buy/sell advice)
- Structure: Key Observation → Supporting Data → Implication → Watch Level
- Keep responses under 200 words unless a detailed article is requested
- For article generation, use proper markdown with H2 headings, tables, and callout boxes using > notation`;

// POST /api/ai/chat — conversational AI market analysis
router.post('/chat', async (req, res) => {
  const { messages, question } = req.body;
  if (!question && (!messages || !messages.length))
    return res.status(400).json({ error: 'Message required' });

  try {
    const msgs = messages?.length
      ? messages
      : [{ role: 'user', content: question }];

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: MARKET_ANALYST_SYSTEM,
      messages: msgs,
    });

    res.json({ response: response.content[0].text });
  } catch (err) {
    console.error('[AI] Chat error:', err.message);
    res.status(500).json({ error: 'AI service unavailable', details: err.message });
  }
});

// POST /api/ai/briefing — generate daily market briefing
router.post('/briefing', async (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  try {
    // Check if briefing already exists for today
    const existing = await pool.query(`SELECT * FROM blog_ai_briefings WHERE date=$1`, [today]);
    if (existing.rows[0]) return res.json(existing.rows[0]);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: MARKET_ANALYST_SYSTEM,
      messages: [{
        role: 'user',
        content: `Generate a concise pre-market intelligence briefing for Indian derivatives traders for today. 

Format as 3 paragraphs:
1. Market overview — NIFTY/BANKNIFTY direction, overnight cues, key levels
2. Options market intelligence — notable OI buildup, PCR signals, VIX regime
3. Today's watch levels — specific strikes to monitor, potential triggers

Keep under 150 words total. Be specific with numbers. End with one "Key Level to Watch" line.`
      }],
    });

    const body = response.content[0].text;

    const { rows } = await pool.query(`
      INSERT INTO blog_ai_briefings (date, title, body, sentiment, nifty_level, vix_level)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (date) DO UPDATE SET body=EXCLUDED.body, generated_at=NOW()
      RETURNING *
    `, [today, `Pre-Market Intelligence Brief — ${new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })}`,
        body, 'bearish', 22347, 14.32]);

    res.json(rows[0]);
  } catch (err) {
    console.error('[AI] Briefing error:', err.message);
    res.status(500).json({ error: 'AI service unavailable', details: err.message });
  }
});

// POST /api/ai/assist-write — generate article draft from title
router.post('/assist-write', auth, async (req, res) => {
  const { title, category, outline_points } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: MARKET_ANALYST_SYSTEM,
      messages: [{
        role: 'user',
        content: `Write a complete, publication-ready market analysis article for OptionLab.

Title: "${title}"
Category: ${category || 'Market Analysis'}
${outline_points ? `Key points to cover: ${outline_points}` : ''}

Requirements:
- Use markdown formatting with ## H2 headings, **bold** for key data, *italic* for emphasis
- Include at least one data table (use markdown table format)  
- Include 2-3 callout boxes using > notation for key insights
- Include specific NIFTY/BANKNIFTY/VIX numbers and strike levels
- Three scenarios (bull/bear/base case) where relevant
- 600-900 words
- End with "Watch Levels" section
- Professional tone, educational framing (no buy/sell advice)
- SEBI-compliant disclaimer note at end

Write the complete article now:`
      }],
    });

    res.json({ content: response.content[0].text });
  } catch (err) {
    console.error('[AI] Write assist error:', err.message);
    res.status(500).json({ error: 'AI service unavailable', details: err.message });
  }
});

// POST /api/ai/score-sentiment — score an article's sentiment and AI score
router.post('/score-sentiment', auth, async (req, res) => {
  const { title, excerpt, body } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: 'You are a financial content analyzer. Respond only with valid JSON.',
      messages: [{
        role: 'user',
        content: `Analyze this market article and return JSON only (no markdown):

Title: ${title}
Excerpt: ${excerpt || ''}
Body preview: ${body?.substring(0, 500) || ''}

Return: {"sentiment": "bullish|bearish|neutral", "ai_score": 0-100, "key_themes": ["theme1","theme2"], "read_time_min": number}`
      }],
    });

    const text = response.content[0].text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    res.json(parsed);
  } catch (err) {
    res.json({ sentiment: 'neutral', ai_score: 65, key_themes: [], read_time_min: 5 });
  }
});

// GET /api/ai/briefing/today — get today's briefing
router.get('/briefing/today', async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  try {
    const { rows } = await pool.query(`SELECT * FROM blog_ai_briefings WHERE date=$1`, [today]);
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/blog/ai/education — SEBI-compliant education chat
router.post('/education', async (req, res) => {
  const { question, messages } = req.body;
  if (!question && (!messages || !messages.length))
    return res.status(400).json({ error: 'Question required' });
  try {
    const msgs = messages?.length
      ? messages.map(m => ({ role: m.role, content: m.content }))
      : [{ role: 'user', content: question }];
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: `You are OptionsLab's financial education assistant for Indian retail traders. STRICT RULES: 1) Only explain options/derivatives concepts in general terms. 2) NEVER recommend buying or selling any specific stock or index level. 3) NEVER reference current market prices or live data. 4) Use ONLY hypothetical examples like "suppose a stock is at Rs 100". 5) Always remind users options trading involves substantial risk. 6) If asked for stock tips or trading signals, politely decline. This is a SEBI-compliant educational platform.`,
      messages: msgs,
    });
    res.json({ response: response.content[0].text });
  } catch (err) {
    console.error('[AI] Education error:', err.message);
    res.status(500).json({ error: 'AI service unavailable' });
  }
});
module.exports = router;
