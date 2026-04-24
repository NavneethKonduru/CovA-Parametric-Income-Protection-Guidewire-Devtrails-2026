# CovA — Platform Integration Contract

CovA is designed to be effortlessly embedded into partner platforms (Zepto, Blinkit, Swiggy) via lightweight B2B integrations. The following outlines the standard webhook schemas and telemetry drops required.

---

## 1. Webhook Schema: Telemetry Drop

Partner platforms push real-time fleet activity to CovA at predefined intervals (e.g., every 5 minutes). This feeds the CDI engine without exposing individual driver PII.

**Endpoint:** `POST https://api.cova-insurance.in/v1/telemetry/ingest`
**Authentication:** Bearer token (Platform specific)

**Payload Example:**
```json
{
  "timestamp": "2026-06-15T14:35:00Z",
  "platform_id": "ZEPTO_IN",
  "zone_id": "ZONE_B_WHITEFIELD",
  "metrics": {
    "active_partners_online": 340,
    "partners_on_break_or_idle": 120,
    "average_delivery_delay_seconds": 1850,
    "order_volume_delta_vs_baseline": -45.5,
    "platform_status": "degraded"
  }
}
```

---

## 2. Webhook Schema: Claim Payout Authorization

When the CDI reaches threshold and verifies a disruption, CovA triggers a webhook to the Guidewire infrastructure and/or directly back to the partner platform's internal finance API to approve the deduction/payout to the worker's wallet.

**Endpoint:** `POST https://api.partner-platform.in/v1/cova/payout-auth`

**Payload Example:**
```json
{
  "cova_claim_id": "CLM_082_934",
  "uwid_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "zone_id": "ZONE_B_WHITEFIELD",
  "disruption_type": "heavy_rain",
  "auth_timestamp": "2026-06-15T15:00:22Z",
  "payout_amount_inr": 400.00,
  "hours_protected": 4.0,
  "transaction_reference": "txn_raz_10293129",
  "signature": "hmac_sha256_signature_string"
}
```

---

## 3. SLA and Data Privacy 
- **Latency:** CovA promises a sub-200ms response time on all ingress telemetry.
- **Privacy:** Platforms only send aggregate fleet health (for CDI) and hashed identifiers (UWIDs) for individual session tracking. Raw geographic traces are discarded after 24 hours unless flagged for fraud audit.
