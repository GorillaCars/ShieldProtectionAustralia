window.ShieldSupabase = {
  url: "https://enfawxznsefdduxzfmha.supabase.co",
  publishableKey: "sb_publishable_Gw29mE4ioH6HhLQ0J4-erg_Npr2BtB7",
  ready: false
};

window.getShieldSupabaseClient = function getShieldSupabaseClient() {
  if (!window.supabase || !window.supabase.createClient) {
    throw new Error("Supabase client library is not loaded.");
  }

  if (!window.ShieldSupabase.client) {
    window.ShieldSupabase.client = window.supabase.createClient(
      window.ShieldSupabase.url,
      window.ShieldSupabase.publishableKey
    );
    window.ShieldSupabase.ready = true;
  }

  return window.ShieldSupabase.client;
};