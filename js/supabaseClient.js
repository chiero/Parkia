/**
 * Chiclana Parking — Cliente Supabase
 * La publishable key es pública por diseño: la seguridad real la dan las
 * políticas RLS configuradas en supabase/schema.sql, no el secreto de esta clave.
 */
const SUPABASE_URL = 'https://kbjfgjmbhpfjlmfcuhdi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_pcFZvhZEekmkipPxODaOqw_kxVZe_2N';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});
