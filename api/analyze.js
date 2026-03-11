// ============================================
// Vercel Serverless Function — /api/analyze
// ============================================

module.exports = async function handler(req, res) {

  // ── CORS ──────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type',                 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { pdfData } = req.body || {};

    if (!pdfData) {
      return res.status(400).json({ error: 'Missing pdfData' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'GROQ_API_KEY not set in environment variables' });
    }

    const prompt = `You are an expert AI career counselor for Indian students who have just completed 10th grade.
A student has taken a career interest test with 10 questions. Each question had 4 options:
- A = Analytical / Technology → Science PCM (Engineering path)
- B = Scientific / Medical → Science PCB (Medical path)
- C = Business / Management → Commerce
- D = Creativity / Communication → Arts

Student data:
${JSON.stringify({ name: pdfData.name, age: pdfData.age, answers: pdfData.answers }, null, 2)}

Note: Some questions may be unanswered (null). Count only answered questions.
Respond ONLY with valid JSON (no markdown, no backticks, no extra text):

{
  "recommended_stream": "Arts",
  "confidence_score": 0.88,
  "interest_breakdown": { "Arts": 70, "Commerce": 10, "PCM": 10, "PCB": 10 },
  "personality": "Creative Communicator",
  "personality_description": "A one-line description",
  "strengths": ["Creativity","Communication","Storytelling","Empathy","Expression"],
  "recommended_careers": ["Media & Journalism","Graphic Design","Psychology","Law","Content Creation","Fine Arts"],
  "reasoning": "2-3 sentence explanation based on the answer pattern.",
  "answer_counts": { "A": 0, "B": 0, "C": 0, "D": 8, "unanswered": 2 }
}`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model:       'llama-3.3-70b-versatile',
        temperature: 0.3,
        max_tokens:  1024,
        messages: [
          { role: 'system', content: 'You are a career guidance AI. Respond with pure valid JSON only. No markdown. No backticks. No explanation.' },
          { role: 'user',   content: prompt }
        ]
      })
    });

    const groqText = await groqRes.text();

    if (!groqRes.ok) {
      return res.status(502).json({ error: `Groq error: ${groqText}` });
    }

    const groqData = JSON.parse(groqText);
    const raw      = groqData.choices?.[0]?.message?.content || '';
    const cleaned  = raw.replace(/```json|```/gi, '').trim();
    const result   = JSON.parse(cleaned);

    return res.status(200).json(result);

  } catch (err) {
    console.error('[analyze] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
