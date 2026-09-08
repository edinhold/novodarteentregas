import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qhlunszfcpzsfjjugkus.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_xp0FiNgyQFvsdy9SXeGnSA_iUehC_FO';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function main() {
  const { data: config } = await supabase.rpc("get_public_delivery_config").single();
  console.log("Delivery Config:", JSON.stringify(config, null, 2));
}

main().catch(console.error);
