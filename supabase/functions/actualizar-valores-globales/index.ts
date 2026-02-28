import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_VALUE = 100000000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { clave, valor } = body;

    if (typeof clave !== "string" || clave.trim().length === 0 || clave.length > 100) {
      throw new Error("clave inválida");
    }
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0 || valor > MAX_VALUE) {
      throw new Error("valor debe ser un número entre 0 y 100.000.000");
    }

    // Update global config
    const { error: updateErr } = await supabase
      .from("configuracion_global")
      .update({ valor, updated_at: new Date().toISOString() })
      .eq("clave", clave);
    if (updateErr) throw updateErr;

    // If updating monto_administrativo, update all pending months
    if (clave === "monto_administrativo") {
      const { data: mesesPendientes, error: mesesErr } = await supabase
        .from("meses_servicio")
        .select("id, total_calculado, total_pagado, monto_administrativo")
        .eq("estado_mes", "pendiente")
        .neq("estado_servicio", "suspendido");

      if (mesesErr) throw mesesErr;

      let mesesActualizados = 0;
      for (const mes of (mesesPendientes || [])) {
        const totalSinAdmin = Number(mes.total_calculado) - Number(mes.monto_administrativo);
        const nuevoTotal = totalSinAdmin + valor;
        const nuevoSaldo = Math.max(0, nuevoTotal - Number(mes.total_pagado));
        const nuevoEstado = nuevoSaldo <= 0 ? "pagado" : "pendiente";

        const { error } = await supabase
          .from("meses_servicio")
          .update({
            monto_administrativo: valor,
            total_calculado: nuevoTotal,
            saldo_pendiente: nuevoSaldo,
            estado_mes: nuevoEstado,
          })
          .eq("id", mes.id);
        if (error) throw error;
        mesesActualizados++;
      }

      return new Response(
        JSON.stringify({ success: true, meses_actualizados: mesesActualizados, nuevo_valor: valor }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[actualizar-valores-globales]", error);
    return new Response(
      JSON.stringify({ error: error.message || "Error al actualizar configuración global" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
