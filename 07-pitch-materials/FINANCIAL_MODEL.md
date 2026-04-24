# CovA — Financial Model & Reinsurance

Cova’s financial risk is managed through sophisticated capital structuring that takes advantage of parametric reliability while shielding against catastrophic regional failure.

---

## 1. Primary Capital Stack

The baseline operations are funded by the incoming premium streams deducted automatically from delivery partner wallets. A traditional insurer backed by Guidewire PolicyCenter sets the base layer.

- **Aggregated Premium Growth:** Targeted ARR of $3.2M within Phase 1 rollout across 150,000 active delivery workers.
- **Combined Ratio Benchmark:** Maintaining a 68% combined ratio, generating reliable operational profit without the drag of traditional Loss Adjustment Expenses (LAE).

---

## 2. Reinsurance Excess of Loss (XL) Structure

To protect the primary insurance pool from "black swan" systemic weather events (e.g., massive regional flooding collapsing delivery in an entire tier-1 city for 7 days), CovA utilizes an Excess of Loss (XL) reinsurance treaty.

**Structure Rules:**
- **Attachment Point:** The XL reinsurance layer triggers when the aggregate claims paid for a specific metropolitan zone exceed 150% of the annualized premium derived from that zone in a single quarter.
- **Limit:** The reinsurance covers up to $10M per event, per city.
- **The Capital Provider:** Multi-national reinsurance firms providing capital relief on predictable, mathematically sound parametric curves rather than human-adjudicated ambiguity.

**Why Parametrics Make Reinsurance Cheaper:**
Because CovA uses tamper-proof signals (CDI logic = Weather API + Platform Order Volume + Peer GPS Activity), reinsurers can model the exact distribution of payout probabilities without the risk of "claims inflation" or "moral hazard." This allows CovA to secure XL catastrophe coverage at significantly lower rates than traditional commercial property or worker’s compensation books.

---

## 3. The Payout Vault (Guidewire / Razorpay Integration)

To handle the immense concurrency of triggered payouts (e.g., 5,000 workers qualifying simultaneously during a sudden flash flood):
1. Guidewire ClaimCenter validates the batch via the automated master claim webhook.
2. A single aggregate wire moves from the Reinsurer / Primary Insurer trust to the payout gateway.
3. Razorpay execution routes split the payouts instantly to individual worker UPI IDs, ensuring T+0 financial relief.
