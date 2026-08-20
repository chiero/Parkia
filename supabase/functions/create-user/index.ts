// Chiclana Parking — Edge Function: create-user
// Crea un usuario nuevo (Supabase Auth + perfil) sin exponer la service role
// key en el navegador. Solo un admin autenticado puede invocarla.
//
// Deploy: Supabase Dashboard → Edge Functions → Deploy a new function →
// nombre "create-user" → pegar este archivo como index.ts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    // Cliente "como el que llama", para verificar quién es y su rol vía RLS.
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !userData?.user) return json({ error: 'No autorizado' }, 401)

    const { data: callerProfile, error: profileErr } = await callerClient
      .from('profiles')
      .select('role, branch_id')
      .eq('id', userData.user.id)
      .maybeSingle()

    const callerRole = callerProfile?.role
    if (profileErr || !['admin', 'manager'].includes(callerRole)) {
      return json({ error: 'No tenés permiso para crear usuarios' }, 403)
    }

    const body = await req.json()
    let { username, password, name, role, branchId } = body

    if (!username || !password || !name || !role) {
      return json({ error: 'Faltan datos obligatorios' }, 400)
    }
    if (String(password).length < 6) {
      return json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400)
    }
    if (!['admin', 'manager', 'employee'].includes(role)) {
      return json({ error: 'Rol inválido' }, 400)
    }

    // Un encargado solo puede crear Empleados dentro de su propia sucursal,
    // sin importar lo que mande el formulario (defensa en profundidad —
    // el front ya deja estos campos fijos, pero esto es lo que realmente
    // impide la escalada de privilegios).
    if (callerRole === 'manager') {
      role = 'employee'
      branchId = callerProfile.branch_id
      if (!branchId) return json({ error: 'Tu usuario no tiene sucursal asignada' }, 400)
    }

    const cleanUsername = String(username).trim().toLowerCase()
    const email = `${cleanUsername}@parking.local`

    // Cliente con la service role key: puede crear usuarios de Auth y saltarse RLS.
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createErr || !created?.user) {
      return json({ error: createErr?.message || 'No se pudo crear el usuario' }, 400)
    }

    const { data: profile, error: insertErr } = await adminClient
      .from('profiles')
      .insert({
        id: created.user.id,
        branch_id: branchId || null,
        username: cleanUsername,
        role,
        name,
        active: true,
      })
      .select()
      .single()

    if (insertErr) {
      // Si falla el perfil, deshacemos la creación del usuario de Auth para no
      // dejar un usuario "fantasma" sin perfil asociado.
      await adminClient.auth.admin.deleteUser(created.user.id)
      return json({ error: insertErr.message }, 400)
    }

    return json({ profile }, 200)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Error inesperado' }, 500)
  }
})
