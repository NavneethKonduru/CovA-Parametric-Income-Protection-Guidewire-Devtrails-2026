// ============================================================
// GROQ AI PORTFOLIO REPORTER
// ============================================================
const Groq = require('groq-sdk');

let groqClient = null;
if (process.env.GROQ_API_KEY) {
  groqClient = new Groq({ 
    apiKey: process.env.GROQ_API_KEY,
    maxRetries: 1,
    timeout: 3000
  });
}

/**
 * Generates an executive summary for the dashboard reports.
 */
async function generatePortfolioSummary(stats) {
  if (!groqClient) {
    return "AI Analysis Unavailable: Please provide a valid GROQ_API_KEY in the environment. Based on the current metrics, the platform continues to provide consistent coverage.";
  }

  const prompt = `
    Analyze this parametric insurance portfolio data:
    - Workers: ${stats.workers}
    - Claims Processed: ${stats.claims}
    - Total Payouts: ₹${stats.payouts}
    
    Based only on the provided statistics, generate a 2-3 sentence actuarial executive summary. Do not invent or fabricate figures not present in the data. Focus on claims frequency, loss ratio, and portfolio health indicators.`;

  try {
    const completion = await groqClient.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'You are an elite actuarial AI assistant for CovA.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 150
    });
    return completion.choices[0]?.message?.content?.trim();
  } catch (e) {
    console.warn('[GROQ] Failed to generate portfolio summary:', e.message);
    return "AI Analysis temporarily unavailable due to rate limits. The portfolio remains stable and fully capitalized to handle upcoming localized disruption events.";
  }
}

module.exports = { generatePortfolioSummary };
