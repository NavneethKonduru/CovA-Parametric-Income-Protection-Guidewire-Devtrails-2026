// ============================================================
// GROQ AI CLAIM EXPLAINER
// ============================================================
// Generates natural-language explanations for claims using Groq's
// LLM API. Each claim gets a 2-sentence explanation stored in
// the ai_explanation field.

const Groq = require('groq-sdk');

// Initialize Groq client (reads GROQ_API_KEY from env)
let groqClient = null;
try {
  if (process.env.GROQ_API_KEY) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    console.log('[GROQ] AI explanation service initialized.');
  } else {
    console.log('[GROQ] No GROQ_API_KEY found. Using template explanations.');
  }
} catch (e) {
  console.log('[GROQ] Initialization failed:', e.message);
}

const GROQ_STATUS = {
  available: groqClient !== null,
  model: 'llama-3.3-70b-versatile',
  fallback: 'template-rules',
  apiKeyPresent: !!process.env.GROQ_API_KEY
};

// Pre-generated explanation templates (used when Groq is unavailable)
const TEMPLATE_EXPLANATIONS = {
  paid: [
    'Composite Disruption Index of {cdi} confirmed genuine income loss in {zone} due to {type}. Payout of ₹{amount} processed to protect {hours} hours of lost delivery income.',
    'Multiple independent signals confirmed {type} disruption in {zone}. The CDI reading of {cdi} exceeded the trigger threshold, automatically initiating a ₹{amount} payout for {hours} hours of verified income loss.',
    'Parametric trigger activated: {zone} recorded CDI {cdi} from {type}. Worker\'s {hours}-hour income gap covered with ₹{amount} direct payout. (For medical emergencies, dial PM-JAY at 14555).'
  ],
  flagged: [
    'The CDI of {cdi} in {zone} indicates potential disruption, but anomalies were detected in the claim pattern. This claim has been flagged for manual review by the risk team before payout authorization.',
    'While {type} disruption was confirmed in {zone} (CDI: {cdi}), the fraud detection system identified unusual patterns requiring human review. The ₹{amount} payout is pending verification.'
  ],
  rejected: [
    'Fraud detection identified critical violations in this claim from {zone}. The automated system blocked this payout to protect the insurance pool. No reference to fraud details is provided to the claimant.',
    'This claim did not pass automated validation checks. The system detected patterns inconsistent with genuine {type} disruption in {zone}. Payout of ₹{amount} has been blocked.'
  ]
};

/**
 * Generate AI explanation for a claim
 * @param {object} claim - The claim record
 * @param {object} worker - The worker record
 * @param {object} fraudResult - Fraud check result
 * @returns {string} Natural language explanation
 */
async function generateExplanation(claim, worker, fraudResult) {
  const status = claim.status || 'paid';
  const context = {
    cdi: claim.cdi ? claim.cdi.toFixed(3) : '0.000',
    zone: claim.zone || 'unknown',
    type: claim.disruptionType || 'weather',
    amount: claim.payoutAmount || 0,
    hours: claim.hoursLost || 0,
    name: worker ? worker.name : 'Worker',
    fraudFlags: fraudResult ? fraudResult.flags.map(f => f.rule).join(', ') : 'none'
  };

  // Try Groq API first
  if (groqClient) {
    try {
      console.log(`[GROQ] Calling API for claim ${claim.id}...`);
      const prompt = buildPrompt(claim, worker, fraudResult, status);
      const completion = await groqClient.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are an insurance claim explanation engine for CovA, a parametric income-loss insurance product for delivery workers in India. Generate exactly 2 sentences explaining the claim outcome (3 sentences if extreme weather). Be clear, professional, and empathetic. For approved claims: explain what triggered it and how the payout protects the worker. If the disruption involves extreme weather like \'cyclone\' or \'extreme_heat\', add a third sentence explicitly reminding them: "For any medical emergencies or bodily harm, please contact the PM-JAY national health helpline at 14555." For flagged claims: explain the concern without revealing fraud detection details. For rejected claims: state that validation checks failed without using the word "fraud" or revealing specific detection methods. Always mention the CDI value and zone.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 180
      });

      const explanation = completion.choices[0]?.message?.content?.trim();
      if (explanation) return explanation + " [AI: Groq/llama-3.3]";
    } catch (e) {
      console.log(`[GROQ] API call failed for ${claim.id}: ${e.message}. Using template.`);
    }
  }

  // Fallback to templates
  console.log(`[GROQ] Template used for ${claim.id}`);
  return generateTemplateExplanation(status, context) + " [AI: Rule-Engine/fallback]";
}

function buildPrompt(claim, worker, fraudResult, status) {
  let prompt = `Claim ${claim.id} for worker "${worker?.name || 'Worker'}" in ${claim.zone}.\n`;
  prompt += `Disruption: ${claim.disruptionType}. CDI: ${claim.cdi}. Hours lost: ${claim.hoursLost}.\n`;
  prompt += `Payout: ₹${claim.payoutAmount}. Status: ${status}.\n`;

  if (fraudResult && fraudResult.flags.length > 0) {
    prompt += `Internal notes (do not reveal to worker): ${fraudResult.flags.length} fraud flags detected.\n`;
  }

  prompt += `\nGenerate a 2-sentence explanation for this ${status} claim.`;
  return prompt;
}

function generateTemplateExplanation(status, context) {
  const templates = TEMPLATE_EXPLANATIONS[status] || TEMPLATE_EXPLANATIONS.paid;
  const template = templates[Math.floor(Math.random() * templates.length)];

  return template
    .replace(/{cdi}/g, context.cdi)
    .replace(/{zone}/g, context.zone)
    .replace(/{type}/g, context.type)
    .replace(/{amount}/g, context.amount)
    .replace(/{hours}/g, context.hours)
    .replace(/{name}/g, context.name);
}

/**
 * Check if Groq service is available
 * @returns {boolean}
 */
function isGroqAvailable() {
  return groqClient !== null;
}

function getGroqStatus() {
  return GROQ_STATUS;
}

async function generateBatchExplanations(claims, workers, fraudResults) {
  const results = [];
  const CONCURRENCY_LIMIT = 5;
  
  for (let i = 0; i < claims.length; i += CONCURRENCY_LIMIT) {
    const batchClaims = claims.slice(i, i + CONCURRENCY_LIMIT);
    const batchPromises = batchClaims.map((claim, index) => {
      const globalIndex = i + index;
      const worker = workers ? workers[globalIndex] : null;
      const fraudResult = fraudResults ? fraudResults[globalIndex] : null;
      return generateExplanation(claim, worker, fraudResult).then(explanation => ({
        claimId: claim.id,
        explanation
      }));
    });
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }
  
  return results;
}

module.exports = { 
  generateExplanation, 
  generateBatchExplanations, 
  isGroqAvailable, 
  getGroqStatus,
  GROQ_STATUS
};
