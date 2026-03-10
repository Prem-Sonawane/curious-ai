// ============================================
// Vercel Serverless Function — /api/analyze
// Proxies Groq API so the key stays server-side
// ============================================

export default async function handler(req, res) {
  // Always respond with JSON
  res.setHeader('Content-Type', 'application/json');

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { pdfData } = req.body;

    if (!pdfData) {
      return res.status(400).json({ error: 'Missing pdfData in request body' });
    }

    // 🔑 Key lives ONLY here — pulled from Vercel Environment Variable
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'API key not configured on server' });
    }

    const answersJson = JSON.stringify({
      name:    pdfData.name,
      age:     pdfData.age,
      answers: pdfData.answers
    }, null, 2);

    const prompt = `You are an expert AI career counselor for Indian students who have just completed 10th grade.
A student has taken a career interest test with 10 questions. Each question had 4 options:
- A = Analytical / Technology → Science PCM (Engineering path)
- B = Scientific / Medical → Science PCB (Medical path)
- C = Business / Management → Commerce
- D = Creativity / Communication → Arts

Student data:
${answersJson}

Note: Some questions may be unanswered (null). Count only answered questions.
Respond ONLY with valid JSON (no markdown, no backticks):

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

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model:       'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are a career guidance AI. Always respond with pure valid JSON only — no markdown, no backticks, no extra text.' },
          { role: 'user',   content: prompt }
        ],
        temperature: 0.3,
        max_tokens:  1024
      })
    });

    if (!groqResponse.ok) {
      const err = await groqResponse.json();
      return res.status(502).json({ error: err.error?.message || 'Groq API error' });
    }

    const groqData = await groqResponse.json();
    const rawText  = groqData.choices?.[0]?.message?.content || '';
    const cleaned  = rawText.replace(/```json|```/gi, '').trim();
    const result   = JSON.parse(cleaned);

    return res.status(200).json(result);

  } catch (err) {
    console.error('Analyze error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
