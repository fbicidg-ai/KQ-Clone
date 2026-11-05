import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const ADMIN_EMAIL = "boying@jerome.com";
    const ADMIN_PASSWORD = "Boying@jerome2026@";

    // Check if the admin auth user already exists.
    const { data: existingList, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) {
      return new Response(JSON.stringify({ error: listErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const existing = (existingList?.users ?? []).find((u) => u.email === ADMIN_EMAIL);

    let adminId: string;
    if (existing) {
      adminId = existing.id;
      // Ensure the password matches the configured one (in case it changed).
      await supabase.auth.admin.updateUserById(adminId, { password: ADMIN_PASSWORD, email_confirm: true });
    } else {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "Administrator", mobile: "" },
      });
      if (createErr || !created?.user) {
        return new Response(JSON.stringify({ error: createErr?.message ?? "create failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      adminId = created.user.id;
    }

    // Promote the profile to admin role. The handle_new_profile trigger will
    // have created the row on signup; if missing, insert one.
    const { error: upsertErr } = await supabase
      .from("profiles")
      .upsert({ id: adminId, role: "admin", full_name: "Administrator", mobile: "" }, { onConflict: "id" });
    if (upsertErr) {
      return new Response(JSON.stringify({ error: upsertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, admin_id: adminId, email: ADMIN_EMAIL }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
