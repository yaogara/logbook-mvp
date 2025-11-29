-- Create egg_collections table
CREATE TABLE IF NOT EXISTS egg_collections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  collected_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  location_id TEXT,
  total_eggs INTEGER NOT NULL CHECK (total_eggs >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  deleted_at TIMESTAMPTZ
);

-- Create egg_outflows table
CREATE TABLE IF NOT EXISTS egg_outflows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  delivered_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  recipient TEXT,
  total_eggs INTEGER NOT NULL CHECK (total_eggs >= 0),
  cartons INTEGER,
  loose_eggs INTEGER,
  eggs_per_carton INTEGER DEFAULT 30,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  deleted_at TIMESTAMPTZ,
  CHECK (cartons IS NULL OR cartons >= 0),
  CHECK (loose_eggs IS NULL OR loose_eggs >= 0),
  CHECK (eggs_per_carton IS NULL OR eggs_per_carton > 0)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_egg_collections_created_at ON egg_collections(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_egg_collections_collected_at ON egg_collections(collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_egg_collections_deleted_at ON egg_collections(deleted_at);
CREATE INDEX IF NOT EXISTS idx_egg_outflows_created_at ON egg_outflows(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_egg_outflows_delivered_at ON egg_outflows(delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_egg_outflows_deleted_at ON egg_outflows(deleted_at);

-- Enable Row Level Security
ALTER TABLE egg_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE egg_outflows ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for egg_collections
CREATE POLICY "Users can view their own egg collections" ON egg_collections
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert their own egg collections" ON egg_collections
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own egg collections" ON egg_collections
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete their own egg collections" ON egg_collections
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Create RLS policies for egg_outflows
CREATE POLICY "Users can view their own egg outflows" ON egg_outflows
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert their own egg outflows" ON egg_outflows
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own egg outflows" ON egg_outflows
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete their own egg outflows" ON egg_outflows
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Create updated_at trigger function (if it doesn't exist)
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER handle_egg_collections_updated_at
  BEFORE UPDATE ON egg_collections
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER handle_egg_outflows_updated_at
  BEFORE UPDATE ON egg_outflows
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();
