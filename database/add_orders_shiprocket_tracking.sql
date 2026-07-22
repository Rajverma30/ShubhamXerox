-- Shiprocket / Fastrr checkout shipping fields on book orders
-- Run once in Supabase SQL editor

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_url TEXT,
  ADD COLUMN IF NOT EXISTS tracking_id TEXT,
  ADD COLUMN IF NOT EXISTS shiprocket_order_id TEXT,
  ADD COLUMN IF NOT EXISTS shipment_id TEXT,
  ADD COLUMN IF NOT EXISTS courier_name TEXT;
