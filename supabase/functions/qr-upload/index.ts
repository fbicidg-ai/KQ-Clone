import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface UploadBody {
  file_data: string;
  content_type: string;
  file_name?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    const userClient = createClient(supabaseUrl, token, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: UploadBody = await req.json();
    if (!body.file_data || !body.content_type) {
      return new Response(JSON.stringify({ error: "Missing file_data or content_type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ext = body.content_type === "image/jpeg" ? "jpg" : body.content_type.split("/")[1] || "png";
    const fileName = body.file_name || `payment-qr-${Date.now()}.${ext}`;

    const binary = atob(body.file_data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: existing } = await adminClient
      .storage
      .from("qr-codes")
      .list("", { limit: 100 });

    const { error: upErr } = await adminClient
      .storage
      .from("qr-codes")
      .upload(fileName, bytes, {
        contentType: body.content_type,
        upsert: true,
      });

    if (upErr) {
      return new Response(JSON.stringify({ error: `Upload failed: ${upErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (existing) {
      for (const f of existing) {
        if (f.name !== fileName) {
          await adminClient.storage.from("qr-codes").remove([f.name]);
        }
      }
    }

    const { error: dbErr } = await adminClient
      .from("settings")
      .update({ qr_code_url: fileName, updated_at: new Date().toISOString() })
      .eq("id", 1);

    if (dbErr) {
      return new Response(JSON.stringify({ error: `Setting save failed: ${dbErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: pub } = adminClient.storage.from("qr-codes").getPublicUrl(fileName);

    return new Response(JSON.stringify({ path: fileName, public_url: pub.publicUrl }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: `Server error: ${(err as Error).message}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
