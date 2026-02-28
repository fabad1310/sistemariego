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

    const { valor_hora_discriminada, valor_hora_no_discriminada } = await req.json();

    if (valor_hora_discriminada <= 0) throw new Error("valor_hora_discriminada debe ser mayor a 0");
    if (valor_hora_no_discriminada < 0) throw new Error("valor_hora_no_discriminada no puede ser negativo");

    const currentYear = new Date().getFullYear();

    // Get all active clients
    const { data: clientesActivos, error: clientesErr } = await supabase
      .from("clientes")
      .select("id")
      .eq("estado", "activo");

    if (clientesErr) throw clientesErr;

    const clienteIds = (clientesActivos || []).map(c => c.id);
    if (clienteIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, configs_actualizadas: 0, meses_actualizados: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get current year configs for active clients
    const { data: configs, error: configsErr } = await supabase
      .from("configuracion_riego_cliente")
      .select("*")
      .eq("anio", currentYear)
      .in("cliente_id", clienteIds);

    if (configsErr) throw configsErr;

    let configsActualizadas = 0;
    let mesesActualizados = 0;

    for (const config of (configs || [])) {
      const nuevo_total = (Number(config.horas_discriminadas) * valor_hora_discriminada) +
        (Number(config.horas_no_discriminadas) * valor_hora_no_discriminada);

      // Update config values
      const { error: updateConfigErr } = await supabase
        .from("configuracion_riego_cliente")
        .update({ valor_hora_discriminada, valor_hora_no_discriminada })
        .eq("id", config.id);

      if (updateConfigErr) throw updateConfigErr;
      configsActualizadas++;

      // Only recalculate PENDING months
      const { data: mesesPendientes, error: mesesErr } = await supabase
        .from("meses_servicio")
        .select("*")
        .eq("configuracion_id", config.id)
        .eq("estado_mes", "pendiente");

      if (mesesErr) throw mesesErr;

      for (const mes of (mesesPendientes || [])) {
        const nuevoSaldo = Math.max(0, nuevo_total - Number(mes.total_pagado));
        const nuevoEstado = nuevoSaldo <= 0 ? "pagado" : "pendiente";

        const { error: updateErr } = await supabase
          .from("meses_servicio")
          .update({
            total_calculado: nuevo_total,
            saldo_pendiente: nuevoSaldo,
            estado_mes: nuevoEstado,
          })
          .eq("id", mes.id);

        if (updateErr) throw updateErr;
        mesesActualizados++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, configs_actualizadas: configsActualizadas, meses_actualizados: mesesActualizados }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('[actualizar-valores-globales]', error);
    return new Response(
      JSON.stringify({ error: "No se pudo actualizar los valores. Intente nuevamente." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
