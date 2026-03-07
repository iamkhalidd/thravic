-- Thravic — Paystack Migration
-- Run this once against your production database to rename Stripe columns.
-- Safe to run even if the columns don't exist yet (uses IF EXISTS).

-- Rename stripe_customer_id → paystack_customer_code on users table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'stripe_customer_id'
    ) THEN
        ALTER TABLE users RENAME COLUMN stripe_customer_id TO paystack_customer_code;
    ELSE
        -- Add the column if it didn't exist at all
        ALTER TABLE users ADD COLUMN IF NOT EXISTS paystack_customer_code TEXT;
    END IF;
END $$;

-- Rename stripe_subscription_id → paystack_subscription_code on users table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'stripe_subscription_id'
    ) THEN
        ALTER TABLE users RENAME COLUMN stripe_subscription_id TO paystack_subscription_code;
    ELSE
        ALTER TABLE users ADD COLUMN IF NOT EXISTS paystack_subscription_code TEXT;
    END IF;
END $$;

-- Rename stripe_subscription_id → paystack_subscription_code on subscriptions table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subscriptions' AND column_name = 'stripe_subscription_id'
    ) THEN
        ALTER TABLE subscriptions RENAME COLUMN stripe_subscription_id TO paystack_subscription_code;
    ELSE
        ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS paystack_subscription_code TEXT;
    END IF;
END $$;
