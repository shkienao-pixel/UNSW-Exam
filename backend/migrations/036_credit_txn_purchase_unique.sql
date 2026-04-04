-- Migration 036: Add partial unique constraint on credit_transactions
-- Prevents double-issuing credits for the same purchase ref_id (idempotency).
--
-- Only covers type='purchase' rows where ref_id IS NOT NULL,
-- so other transaction types (earn/spend/refund) are unaffected.
--
-- After applying this migration, any duplicate call to credit_service.earn()
-- with the same (user_id, type='purchase', ref_id) will raise a unique violation,
-- which surfaces as a 500 in the application and prevents double credit.

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_txn_purchase_ref_unique
    ON credit_transactions (user_id, type, ref_id)
    WHERE type = 'purchase' AND ref_id IS NOT NULL;
