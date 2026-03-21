'use strict';
const router = require('express').Router();
const { auth } = require('../middleware/auth');
const pool = require('../db/pool');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// SEBI-compliant education system prompt — no live data, no specific recommendations
const EDUCATION_SYSTEM = `You are a senior derivatives educator for OptionsLab (optionslab.in), India's financial education platform.

Your expertise covers options and derivatives concepts for Indian markets (NIFTY, BANKNIFTY, FINNIFTY).

Guidelines:
- Use hypothetical examples only (e.g. "suppose NIFTY is at 22,000...")
- Never reference current live market prices, OI data, or real-time figures
- Frame all content as education, not trading advice
- No buy/sell recommendations on any specific security or level
- Always remind users that options trading involves substantial risk
- SEBI-compliant: this is an educational platform only — not a registered Research Analyst or Investment Adviser`;

// POST /api/blog/ai/chat — general educational AI chat
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
      system: EDUCATION_SYSTEM,
      messages: msgs,
    });

    res.json({ response: response.content[0].text });
  } catch (err) {
    console.error('[AI] Chat error:', err.message);
    res.status(500).json({ error: 'AI service unavailable', details: err.message });
  }
});

// POST /api/blog/ai/assist-write — generate educational article draft from title (admin only)
router.post('/assist-write', auth, async (req, res) => {
  const { title, category, outline_points } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: EDUCATION_SYSTEM,
      messages: [{
        role: 'user',
        content: `Write a complete, publication-ready educational article for OptionsLab blog.

Title: "${title}"
Category: ${category || 'Options Education'}
${outline_points ? `Key points to cover: ${outline_points}` : ''}

Requirements:
- Use markdown formatting with ## H2 headings, **bold** for key terms, *italic* for emphasis
- Include at least one example table (use markdown table format)
- Include 2-3 callout boxes using > notation for key insights
- Use ONLY hypothetical examples — never reference real current market prices or levels
- Explain concepts clearly for intermediate Indian retail traders
- 600-900 words
- End with "Key Takeaways" section
- Professional, educational tone — no buy/sell advice
- Add SEBI disclaimer at end: "This article is for educational purposes only and does not constitute investment advice. OptionsLab is not a SEBI-registered Research Analyst or Investment Adviser."

Write the complete article now:`,
      }],
    });

    res.json({ content: response.content[0].text });
  } catch (err) {
    console.error('[AI] Write assist error:', err.message);
    res.status(500).json({ error: 'AI service unavailable', details: err.message });
  }
});

// POST /api/blog/ai/score-sentiment — score article sentiment and metadata (admin only)
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
        content: `Analyze this educational article and return JSON only (no markdown):

Title: ${title}
Excerpt: ${excerpt || ''}
Body preview: ${body?.substring(0, 500) || ''}

Return: {"sentiment": "bullish|bearish|neutral", "ai_score": 0-100, "key_themes": ["theme1","theme2"], "read_time_min": number}`,
      }],
    });

    const text = response.content[0].text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    res.json(parsed);
  } catch (err) {
    res.json({ sentiment: 'neutral', ai_score: 65, key_themes: [], read_time_min: 5 });
  }
});

// POST /api/blog/ai/education — SEBI-compliant education chat (used by LearnPage)
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
      system: EDUCATION_SYSTEM,
      messages: msgs,
    });

    res.json({ response: response.content[0].text });
  } catch (err) {
    console.error('[AI] Education error:', err.message);
    res.status(500).json({ error: 'AI service unavailable' });
  }
});

module.exports = router;
