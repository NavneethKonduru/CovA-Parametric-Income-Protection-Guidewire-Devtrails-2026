-- ============================================================================
-- Migration 011: Payment Lifecycle Corrections
-- ============================================================================
-- Adds missing fields required for Razorpay asynchronous webhook flow
-- and robust worker onboarding.
-- ============================================================================

-- 1. Track Worker Onboarding for RazorpayX
ALTER TABLE public.workers 
  ADD COLUMN IF NOT EXISTS rzp_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS rzp_fund_account_id TEXT;

-- 2. Make payouts idempotent and auditable with richer event tracing
ALTER TABLE public.payout_log
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS provider_event_type TEXT,
  ADD COLUMN IF NOT EXISTS provider_event_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS failure_code TEXT,
  ADD COLUMN IF NOT EXISTS failure_description TEXT,
  ADD COLUMN IF NOT EXISTS webhook_payload JSONB,
  ADD COLUMN IF NOT EXISTS provider_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_state_update TIMESTAMPTZ DEFAULT NOW();

-- 3. Add constraint checks or defaults if necessary
-- Note: 'processing_payout', 'payout_failed' will now be used as claim statuses.
