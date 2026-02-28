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
    const { configuracion_id, valor_hora_precaria, valor_hora_empadronada } = body;

    // UUID validation
    if (!configuracion_id || !UUID_REGEX.test(String(configuracion_id))) throw new Error("configuracion_id inválido");

    // Rate validations
    if (typeof valor_hora_precaria !== "number" || !Number.isFinite(valor_hora_precaria) || valor_hora_precaria < 0 || valor_hora_precaria > MAX_VALUE) {
      throw new Error("valor_hora_precaria debe ser un número no negativo válido");
    }
    if (typeof valor_hora_empadronada !== "number" || !Number.isFinite(valor_hora_empadronada) || valor_hora_empadronada < 0 || valor_hora_empadronada > MAX_VALUE) {
      throw new Error("valor_hora_empadronada debe ser un número no negativo válido");
    }

    // Update config rates
    const { data: config, error: configErr } = await supabase
      .from("configuracion_riego_cliente")
      .update({
        valor_hora_discriminada: valor_hora_precaria,
        valor_hora_no_discriminada: valor_hora_empadronada,
      })
      .eq("id", configuracion_id)
      .select()
      .single();

    if (configErr) throw configErr;

    // Recalculate PENDING months using existing quincenas + new rates
    const { data: mesesPendientes, error: mesesErr } = await supabase
      .from("meses_servicio")
      .select("*")
      .eq("configuracion_id", configuracion_id)
      .eq("estado_mes", "pendiente");

    if (mesesErr) throw mesesErr;

    let mesesActualizados = 0;
    for (const mes of (mesesPendientes || [])) {
      // Fetch quincenas for this month
      const { data: quincenas } = await supabase
        .from("quincenas_servicio")
        .select("*")
        .eq("mes_servicio_id", mes.id);

      const totalMinPrec = (quincenas || []).reduce((s, q) => s + Number(q.minutos_precaria), 0);
      const totalMinEmp = (quincenas || []).reduce((s, q) => s + Number(q.minutos_empadronada), 0);

      const horasPrecFinal = Math.ceil(totalMinPrec / 60);
      const horasEmpFinal = Math.ceil(totalMinEmp / 60);

      const totalCalc = (horasPrecFinal * valor_hora_precaria) + (horasEmpFinal * valor_hora_empadronada);
      const nuevoSaldo = Math.max(0, totalCalc - Number(mes.total_pagado));
      const nuevoEstado = nuevoSaldo <= 0 ? "pagado" : "pendiente";

      const { error: updateErr } = await supabase
        .from("meses_servicio")
        .update({
          horas_precaria_final: horasPrecFinal,
          horas_empadronada_final: horasEmpFinal,
          total_calculado: totalCalc,
          saldo_pendiente: nuevoSaldo,
          estado_mes: nuevoEstado,
        })
        .eq("id", mes.id);

      if (updateErr) throw updateErr;
      mesesActualizados++;
    }

    return new Response(
      JSON.stringify({ success: true, meses_actualizados: mesesActualizados }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('[actualizar-configuracion]', error);
    return new Response(
      JSON.stringify({ error: error.message || "No se pudo actualizar la configuración. Intente nuevamente." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
