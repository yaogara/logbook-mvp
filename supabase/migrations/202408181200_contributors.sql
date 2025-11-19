-- Contributors + settlements fixes

-- 1. Remove invalid FK and recreate contributors table properly
DROP TABLE IF EXISTS public.contributors CASCADE;

CREATE TABLE public.contributors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  name text NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Link txns to contributors
ALTER TABLE public.txns
  ADD COLUMN IF NOT EXISTS contributor_id uuid NULL REFERENCES public.contributors(id) ON DELETE SET NULL;

-- 3. RLS policies
ALTER TABLE public.contributors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contributors_read"
ON public.contributors
FOR SELECT
TO authenticated, anon
USING (true);

CREATE POLICY "contributors_insert"
ON public.contributors
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "contributors_update"
ON public.contributors
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- 4. Add settlement type filtering to dashboard view
DROP VIEW IF EXISTS public.txns_summary_view;

CREATE VIEW public.txns_summary_view AS
SELECT
  v.name AS vertical,
  t.client_id,
  t.user_id,
  SUM(CASE WHEN t.type = 'Gasto' THEN t.amount ELSE 0 END) AS total_gastos,
  SUM(CASE WHEN t.type = 'Ingreso' THEN t.amount ELSE 0 END) AS total_ingresos,
  SUM(CASE WHEN t.type = 'Ingreso' THEN t.amount ELSE 0 END) -
  SUM(CASE WHEN t.type = 'Gasto' THEN t.amount ELSE 0 END) AS balance
FROM public.txns t
LEFT JOIN public.verticals v ON v.id = t.vertical_id
WHERE t.deleted_at IS NULL
  AND t.type != 'Settled'
GROUP BY v.name, t.client_id, t.user_id;

GRANT SELECT ON public.txns_summary_view TO anon, authenticated;
