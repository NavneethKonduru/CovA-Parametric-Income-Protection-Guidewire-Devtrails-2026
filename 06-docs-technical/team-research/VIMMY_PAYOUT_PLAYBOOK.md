# 💸 HANDOFF NODE: VIMMY'S COMPLETE R&D & EXECUTION PLAYBOOK

This document is for your eyes only. It breaks down the exact technical implementations, APIs, and Node.js logic required for you to successfully build the "Enterprise Handoff & Payout" architecture over the next 4 weeks.

Your job is the finish line: **You turn mathematical validation back into real cash.**

---

## 1. THE GUIDEWIRE JSON SCHEMA (Phase 3 Focus)
During a hackathon, you probably will not get a live instance of Guidewire ClaimCenter to actually deploy into. Your job is to build the "Middleware" that Guidewire *would* talk to. 

### The Master Claim Structure:
You must design a JSON payload that groups hundreds of workers into ONE single claim. This proves to the judges that you understand Loss Adjustment Expenses (LAE).

**Your R&D:** 
Design a robust JSON schema template that looks exactly like this, which Navneeth will generate and hand to you:
```json
{
  "ClaimCrypt_Enterprise_ID": "CC-IND-098",
  "Partner": "ZEPTO_INC",
  "Disruption_H3_Grid": "89283082a3fffff",
  "Event_Trigger": "PRECIPITATION_OVERRIDE",
  "Verified_Worker_Count": 124,
  "Total_Capital_Deployed_INR": 24800.00,
  "Target_Endpoints": [
    {"upi": "driver1@okicici", "amount": 200},
    {"upi": "driver2@oksbi", "amount": 200}
  ],
  "Fraud_Blocked_Count": 350
}
```

---

## 2. THE INSTANT ZERO-TOUCH PAYOUT (Phase 3 Focus)
Once the Claim JSON is finalized, the actual money needs to legally move.

### The Stack You Need:
*   **API:** Razorpay "Route" (Test Mode) or Stripe Connect (Sandbox).
*   **Runtime:** Node.js script.

### The Execution Strategy:
1.  **The Vendor:** Create a developer account on Razorpay (Test Mode). Do NOT provide real KYC or bank accounts. Read the docs for **Razorpay Transfers / Payouts**.
2.  **The API Keys:** Generate your API `Key Id` and `Key Secret`. Store them in a local `.env` file. NEVER commit them to GitHub. 
3.  **The Script:** Write a Node.js function `executePayout(masterPayload)`. This function loops through `Target_Endpoints` array shown above.
4.  **The HTTP Call:** Use `axios` or the official Razorpay SDK to hit the Transfer API for each UPI ID.
5.  **The Callback:** Ensure your script logs `[200 OK] Transfer of ₹200 to driver1@okicici successful.` to the terminal.

### The Phase 3 Demo:
For the final 5-minute video, you will physically show your terminal running. When Navneeth clicks "Approve" on the dashboard, the camera cuts to your terminal, which instantly spews 124 lines of green `[SUCCESS] Payout Transferred` logs. 

If possible, set up one of the mock UPI endpoints to fire an SMS or Push Notification to your actual mobile phone, so the judges hear a *DING* right as the terminal finishes processing. That is how you win. 

---

## 3. IMMEDIATE NEXT STEPS FOR YOU
1. Define the exact JSON schema that Navneeth's Master server must give you. If Navneeth knows the exact format you expect, he can write his orchestration code to match it perfectly.
2. Register for Razorpay Developer Test mode.
3. Write a tiny test script in Node.js that successfully transfers 1 Rupee to a dummy bank account using the Sandbox APIs.
