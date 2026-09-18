import { createClient } from "@supabase/supabase-js";
import { cloudConfig } from "./config";

export const supabase = createClient(cloudConfig.url, cloudConfig.publishableKey, {
  auth: { detectSessionInUrl: false },
});
