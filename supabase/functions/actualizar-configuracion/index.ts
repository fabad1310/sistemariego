import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_VALUE = 100000000;
const MAX_MINUTES = 100000;

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
    const {
      configuracion_id,
      valor_hora_precaria, valor_hora_empadronada,
      q1_precaria, q1_empadronada, q2_precaria, q2_empadronada
    } = body;

    if (!configuracion_id || !UUID_REGEX.test(String(configuracion_id))) throw new Error("configuracion_id inválido");

    if (typeof valor_hora_precaria !== "number" || !Number.isFinite(valor_hora_precaria) || valor_hora_precaria < 0 || valor_hora_precaria > MAX_VALUE) throw new Error("valor_hora_precaria inválido");
    if (typeof valor_hora_empadronada !== "number" || !Number.isFinite(valor_hora_empadronada) || valor_hora_empadronada < 0 || valor_hora_empadronada > MAX_VALUE) throw new Error("valor_hora_empadronada inválido");

    for (const [field, val] of Object.entries({ q1_precaria, q1_empadronada, q2_precaria, q2_empadronada })) {
      if (typeof val !== "number" || !Number.isFinite(val) || val < 0 || val > MAX_MINUTES || !Number.isInteger(val)) {
        throw new Error(`${field} debe ser un entero no negativo`);
      }
    }

    const { data: config, error: configErr } = await supabase
      .from("configuracion_riego_cliente")
      .update({
        valor_hora_discriminada: valor_hora_precaria,
        valor_hora_no_discriminada: valor_hora_empadronada,
      })
      .eq("id", configuracion_id)
      .select().single();
    if (configErr) throw configErr;

    // Get current admin fee
    const { data: adminConfig } = await supabase
      .from("configuracion_global")
      .select("valor")
      .eq("clave", "monto_administrativo")
      .maybeSingle();
    const montoAdmin = Number(adminConfig?.valor ?? 0);

    const totalMinPrecaria = q1_precaria + q2_precaria;
    const totalMinEmpadronada = q1_empadronada + q2_empadronada;
    const horasPrecFinal = totalMinPrecaria > 0 ? Math.ceil(totalMinPrecaria / 60) : 0;
    const horasEmpFinal = totalMinEmpadronada > 0 ? Math.ceil(totalMinEmpadronada / 60) : 0;
    const totalRiego = (horasPrecFinal * valor_hora_precaria) + (horasEmpFinal * valor_hora_empadronada);
    
    // Admin fee ONLY if base > 0
    const montoAdminFinal = totalRiego > 0 ? montoAdmin : 0;
    const totalCalc = totalRiego + montoAdminFinal;

    // Update ALL non-suspended months (including paid) — recalculate everything
    const { data: mesesToUpdate, error: mesesErr } = await supabase
      .from("meses_servicio")
      .select("*")
      .eq("configuracion_id", configuracion_id)
      .neq("estado_servicio", "suspendido");
    if (mesesErr) throw mesesErr;

    let mesesActualizados = 0;
    for (const mes of (mesesToUpdate || [])) {
      // Skip months with override active
      if (mes.usa_override) continue;

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
          monto_administrativo: montoAdminFinal,
        })
        .eq("id", mes.id);
      if (updateErr) throw updateErr;

      await supabase.from("quincenas_servicio").delete().eq("mes_servicio_id", mes.id);
      const { error: qErr } = await supabase.from("quincenas_servicio").insert([
        { mes_servicio_id: mes.id, numero_quincena: 1, minutos_precaria: q1_precaria, minutos_empadronada: q1_empadronada },
        { mes_servicio_id: mes.id, numero_quincena: 2, minutos_precaria: q2_precaria, minutos_empadronada: q2_empadronada },
      ]);
      if (qErr) throw qErr;

      mesesActualizados++;
    }

    return new Response(
      JSON.stringify({ success: true, meses_actualizados: mesesActualizados, total_por_mes: totalCalc }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('[actualizar-configuracion]', error);
    return new Response(
      JSON.stringify({ error: error.message || "No se pudo actualizar la configuración." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
