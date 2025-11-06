import { createClient } from "@supabase/supabase-js";

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL!, import.meta.env.VITE_SUPABASE_ANON_KEY!);

(async () => {
  const { data, error } = await supabase.from("verticals").select("*");
  console.log(data, error);
})();