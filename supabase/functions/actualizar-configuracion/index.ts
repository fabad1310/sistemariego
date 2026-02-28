import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
    const { configuracion_id, horas_discriminadas, horas_no_discriminadas, valor_hora_discriminada, valor_hora_no_discriminada } = body;

    // UUID validation
    if (!configuracion_id || !UUID_REGEX.test(String(configuracion_id))) throw new Error("configuracion_id inválido");

    // Numeric validations with bounds
    if (typeof horas_discriminadas !== "number" || !Number.isFinite(horas_discriminadas) || horas_discriminadas <= 0 || horas_discriminadas > MAX_VALUE) {
      throw new Error("horas_discriminadas debe ser mayor a 0");
    }
    if (typeof horas_no_discriminadas !== "number" || !Number.isFinite(horas_no_discriminadas) || horas_no_discriminadas < 0 || horas_no_discriminadas > MAX_VALUE) {
      throw new Error("horas_no_discriminadas no puede ser negativo");
    }
    if (typeof valor_hora_discriminada !== "number" || !Number.isFinite(valor_hora_discriminada) || valor_hora_discriminada <= 0 || valor_hora_discriminada > MAX_VALUE) {
      throw new Error("valor_hora_discriminada debe ser mayor a 0");
    }
    if (typeof valor_hora_no_discriminada !== "number" || !Number.isFinite(valor_hora_no_discriminada) || valor_hora_no_discriminada < 0 || valor_hora_no_discriminada > MAX_VALUE) {
      throw new Error("valor_hora_no_discriminada no puede ser negativo");
    }

    const horas_totales_mes = horas_discriminadas + horas_no_discriminadas;
    const nuevo_total = (horas_discriminadas * valor_hora_discriminada) + (horas_no_discriminadas * valor_hora_no_discriminada);

    // Verify config exists
    const { data: config, error: configErr } = await supabase
      .from("configuracion_riego_cliente")
      .update({
        horas_totales_mes,
        horas_discriminadas,
        horas_no_discriminadas,
        valor_hora_discriminada,
        valor_hora_no_discriminada,
      })
      .eq("id", configuracion_id)
      .select()
      .single();

    if (configErr) throw configErr;

    // Only recalculate PENDING months
    const { data: mesesPendientes, error: mesesErr } = await supabase
      .from("meses_servicio")
      .select("*")
      .eq("configuracion_id", configuracion_id)
      .eq("estado_mes", "pendiente");

    if (mesesErr) throw mesesErr;

    let mesesActualizados = 0;
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

    return new Response(
      JSON.stringify({ success: true, meses_actualizados: mesesActualizados, nuevo_total_mensual: nuevo_total }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('[actualizar-configuracion]', error);
    return new Response(
      JSON.stringify({ error: "No se pudo actualizar la configuración. Intente nuevamente." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});