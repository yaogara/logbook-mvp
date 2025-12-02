-- Add created_by columns to track ownership while allowing shared visibility
ALTER TABLE egg_collections
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE egg_outflows
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE egg_collections ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE egg_outflows ALTER COLUMN created_by SET DEFAULT auth.uid();

-- Ensure authenticated users can view all egg records
DROP POLICY IF EXISTS "Users can view their own egg collections" ON egg_collections;
CREATE POLICY "Authenticated users can view egg collections" ON egg_collections
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can view their own egg outflows" ON egg_outflows;
CREATE POLICY "Authenticated users can view egg outflows" ON egg_outflows
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Keep ownership checks for mutating operations
DROP POLICY IF EXISTS "Users can insert their own egg collections" ON egg_collections;
CREATE POLICY "Users can insert their own egg collections" ON egg_collections
  FOR INSERT WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can update their own egg collections" ON egg_collections;
CREATE POLICY "Users can update their own egg collections" ON egg_collections
  FOR UPDATE USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can delete their own egg collections" ON egg_collections;
CREATE POLICY "Users can delete their own egg collections" ON egg_collections
  FOR DELETE USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can insert their own egg outflows" ON egg_outflows;
CREATE POLICY "Users can insert their own egg outflows" ON egg_outflows
  FOR INSERT WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can update their own egg outflows" ON egg_outflows;
CREATE POLICY "Users can update their own egg outflows" ON egg_outflows
  FOR UPDATE USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can delete their own egg outflows" ON egg_outflows;
CREATE POLICY "Users can delete their own egg outflows" ON egg_outflows
  FOR DELETE USING (auth.uid() = created_by);
