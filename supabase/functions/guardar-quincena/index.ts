import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MINUTOS = 100000;

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
    const { mes_servicio_id, numero_quincena, minutos_precaria, minutos_empadronada } = body;

    // Validations
    if (!mes_servicio_id || !UUID_REGEX.test(String(mes_servicio_id))) throw new Error("mes_servicio_id inválido");
    if (![1, 2].includes(numero_quincena)) throw new Error("numero_quincena debe ser 1 o 2");

    if (typeof minutos_precaria !== "number" || !Number.isFinite(minutos_precaria) || minutos_precaria < 0 || minutos_precaria > MAX_MINUTOS) {
      throw new Error("minutos_precaria debe ser un número entre 0 y 100.000");
    }
    if (typeof minutos_empadronada !== "number" || !Number.isFinite(minutos_empadronada) || minutos_empadronada < 0 || minutos_empadronada > MAX_MINUTOS) {
      throw new Error("minutos_empadronada debe ser un número entre 0 y 100.000");
    }

    // Verify month exists and is editable
    const { data: mes, error: mesErr } = await supabase
      .from("meses_servicio")
      .select("*")
      .eq("id", mes_servicio_id)
      .single();

    if (mesErr || !mes) throw new Error("Mes de servicio no encontrado");
    if (mes.estado_mes === "pagado" && mes.estado_servicio !== "suspendido") {
      throw new Error("No se puede editar un mes ya pagado");
    }
    if (mes.estado_servicio === "suspendido") {
      throw new Error("No se puede editar un mes suspendido");
    }

    // Upsert quincena (only minutes, no rates)
    const { error: upsertErr } = await supabase
      .from("quincenas_servicio")
      .upsert({
        mes_servicio_id,
        numero_quincena,
        minutos_precaria,
        minutos_empadronada,
      }, { onConflict: "mes_servicio_id,numero_quincena" });

    if (upsertErr) throw upsertErr;

    // Fetch both quincenas for this month
    const { data: quincenas, error: qErr } = await supabase
      .from("quincenas_servicio")
      .select("*")
      .eq("mes_servicio_id", mes_servicio_id);

    if (qErr) throw qErr;

    // Fetch config to get hourly rates
    const { data: config, error: confErr } = await supabase
      .from("configuracion_riego_cliente")
      .select("*")
      .eq("id", mes.configuracion_id)
      .single();

    if (confErr || !config) throw new Error("Configuración no encontrada");

    const valor_hora_precaria = Number(config.valor_hora_discriminada);
    const valor_hora_empadronada = Number(config.valor_hora_no_discriminada);

    // Step 1: Sum total minutes per type across both quincenas
    const totalMinutosPrecaria = (quincenas || []).reduce((s, q) => s + Number(q.minutos_precaria), 0);
    const totalMinutosEmpadronada = (quincenas || []).reduce((s, q) => s + Number(q.minutos_empadronada), 0);

    // Step 2: Convert to decimal hours
    const horasPrecDecimal = totalMinutosPrecaria / 60;
    const horasEmpDecimal = totalMinutosEmpadronada / 60;

    // Step 3: CEIL to integer hours (ALWAYS round up)
    const horasPrecFinal = Math.ceil(horasPrecDecimal);
    const horasEmpFinal = Math.ceil(horasEmpDecimal);

    // Step 4: Multiply AFTER rounding
    const totalPrecaria = horasPrecFinal * valor_hora_precaria;
    const totalEmpadronada = horasEmpFinal * valor_hora_empadronada;

    // Step 5: Total mensual
    const totalCalculado = totalPrecaria + totalEmpadronada;

    const nuevoSaldo = Math.max(0, totalCalculado - Number(mes.total_pagado));
    const nuevoEstado = nuevoSaldo <= 0 ? "pagado" : "pendiente";

    // Update meses_servicio with final calculated values
    const { error: updateErr } = await supabase
      .from("meses_servicio")
      .update({
        horas_precaria_final: horasPrecFinal,
        horas_empadronada_final: horasEmpFinal,
        total_calculado: totalCalculado,
        saldo_pendiente: nuevoSaldo,
        estado_mes: nuevoEstado,
      })
      .eq("id", mes_servicio_id);

    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({
        success: true,
        total_minutos_precaria: totalMinutosPrecaria,
        total_minutos_empadronada: totalMinutosEmpadronada,
        horas_precaria_decimal: horasPrecDecimal,
        horas_empadronada_decimal: horasEmpDecimal,
        horas_precaria_final: horasPrecFinal,
        horas_empadronada_final: horasEmpFinal,
        total_precaria: totalPrecaria,
        total_empadronada: totalEmpadronada,
        total_mensual: totalCalculado,
        saldo_pendiente: nuevoSaldo,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('[guardar-quincena]', error);
    return new Response(
      JSON.stringify({ error: error.message || "No se pudo guardar la quincena. Intente nuevamente." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
