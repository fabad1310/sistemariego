import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const users = [
      { email: "admin@sistema.local", password: "escurpiel123", role: "admin" as const },
      { email: "visita@sistema.local", password: "visita123", role: "read_only" as const },
    ];

    const results = [];

    for (const u of users) {
      // Check if user already exists
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const existing = existingUsers?.users?.find((eu: any) => eu.email === u.email);

      let userId: string;

      if (existing) {
        userId = existing.id;
        results.push({ email: u.email, status: "already_exists", userId });
      } else {
        const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
          email: u.email,
          password: u.password,
          email_confirm: true,
        });
        if (createErr) throw createErr;
        userId = newUser.user.id;
        results.push({ email: u.email, status: "created", userId });
      }

      // Upsert role
      const { error: roleErr } = await supabase
        .from("user_roles")
        .upsert({ user_id: userId, role: u.role }, { onConflict: "user_id,role" });
      if (roleErr) throw roleErr;
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[seed-users]", error);
    return new Response(
      JSON.stringify({ error: error.message || "Error al crear usuarios" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
