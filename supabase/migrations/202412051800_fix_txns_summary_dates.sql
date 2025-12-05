-- Fix txns_summary_view to properly handle dates and missing occurred_on values

-- Create index for better performance on date filtering (occurred_on already exists)
CREATE INDEX IF NOT EXISTS idx_txns_occurred_on ON public.txns(occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_txns_updated_at ON public.txns(updated_at DESC);

-- Drop the existing view
DROP VIEW IF EXISTS public.txns_summary_view;

-- Recreate the view with proper date handling
CREATE VIEW public.txns_summary_view AS
SELECT
  v.name AS vertical,
  t.client_id,
  t.user_id,
  -- Use COALESCE to prefer occurred_on, then fall back to updated_at, then current date
  COALESCE(t.occurred_on, t.updated_at, NOW()) as transaction_date,
  SUM(CASE WHEN t.type = 'Gasto' THEN t.amount ELSE 0 END) AS total_gastos,
  SUM(CASE WHEN t.type = 'Ingreso' THEN t.amount ELSE 0 END) AS total_ingresos,
  SUM(CASE WHEN t.type = 'Ingreso' THEN t.amount ELSE 0 END) -
  SUM(CASE WHEN t.type = 'Gasto' THEN t.amount ELSE 0 END) AS balance,
  COUNT(*) as transaction_count
FROM public.txns t
LEFT JOIN public.verticals v ON v.id = t.vertical_id
WHERE t.deleted_at IS NULL
GROUP BY v.name, t.client_id, t.user_id, COALESCE(t.occurred_on, t.updated_at, NOW());

GRANT SELECT ON public.txns_summary_view TO anon, authenticated;
