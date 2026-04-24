require('dotenv').config({ path: __dirname + '/.env' });
const groqExplainer = require('./engines/groq-explainer');
const razorpayService = require('./services/payout-razorpay');

async function test() {
  console.log("=== GROQ VERIFICATION ===");
  console.log("GROQ_API_KEY present in process.env:", !!process.env.GROQ_API_KEY);
  
  // Re-initialize to ensure it picks up the .env we just loaded
  const Groq = require('groq-sdk');
  let groqClient = null;
  if (process.env.GROQ_API_KEY) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  const mockClaim = {
    id: "CLM_TEST_001",
    zone: "ZONE_A",
    disruptionType: "SEVERE_WEATHER",
    cdi: 0.85,
    payoutAmount: 250,
    hoursLost: 4,
    status: "paid"
  };
  const mockWorker = { name: "Test Worker" };
  const mockFraud = { flags: [] };

  try {
    let explanation;
    if (groqClient) {
        console.log("Calling Groq API...");
        const prompt = `Claim ${mockClaim.id} for worker "${mockWorker.name}" in ${mockClaim.zone}.\nDisruption: ${mockClaim.disruptionType}. CDI: ${mockClaim.cdi}. Hours lost: ${mockClaim.hoursLost}.\nPayout: ₹${mockClaim.payoutAmount}. Status: ${mockClaim.status}.\n\nGenerate a 2-sentence explanation for this ${mockClaim.status} claim.`;
        const completion = await groqClient.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
              {
                role: 'system',
                content: 'You are an insurance claim explanation engine for CovA...'
              },
              { role: 'user', content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 180
          });
        explanation = completion.choices[0]?.message?.content?.trim() + " [AI: Groq/llama-3.3]";
    } else {
        explanation = "Template fallback";
    }
    
    console.log("\nGroq Result:\n", explanation);
    if (explanation.includes("[AI: Groq/llama-3.3]")) {
      console.log("✅ Groq executed a REAL API call.");
    } else {
      console.log("❌ Groq fell back to a template.");
    }
  } catch (e) {
    console.error("Groq Error:", e.message);
  }

  console.log("\n=== RAZORPAY VERIFICATION ===");
  try {
    const payoutId = await razorpayService.executePayout("test_upi@ybl", 250, "CLM_TEST_001");
    console.log("Razorpay Payout ID:", payoutId);
    if (payoutId.startsWith("txn_mock_")) {
      console.log("⚠️ Razorpay fell back to mock ID (Keys missing/disabled).");
    } else {
      console.log("✅ Razorpay executed a REAL test payout.");
    }
  } catch (e) {
    console.error("Razorpay Error:", e.message);
  }
}

test();
