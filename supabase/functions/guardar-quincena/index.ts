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

    const { mes_servicio_id, numero_quincena, minutos_precaria, minutos_empadronada, valor_minuto_precaria, valor_minuto_empadronada } = await req.json();

    if (!mes_servicio_id) throw new Error("mes_servicio_id es requerido");
    if (![1, 2].includes(numero_quincena)) throw new Error("numero_quincena debe ser 1 o 2");
    if (minutos_precaria < 0 || minutos_empadronada < 0) throw new Error("Los minutos no pueden ser negativos");
    if (valor_minuto_precaria < 0 || valor_minuto_empadronada < 0) throw new Error("Los valores no pueden ser negativos");

    // Verify month is not paid
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

    const subtotal = (minutos_precaria * valor_minuto_precaria) + (minutos_empadronada * valor_minuto_empadronada);

    // Upsert quincena
    const { error: upsertErr } = await supabase
      .from("quincenas_servicio")
      .upsert({
        mes_servicio_id,
        numero_quincena,
        minutos_precaria,
        minutos_empadronada,
        valor_minuto_precaria,
        valor_minuto_empadronada,
        subtotal_calculado: subtotal,
      }, { onConflict: "mes_servicio_id,numero_quincena" });

    if (upsertErr) throw upsertErr;

    // Now recalculate monthly total from both quincenas
    const { data: quincenas, error: qErr } = await supabase
      .from("quincenas_servicio")
      .select("*")
      .eq("mes_servicio_id", mes_servicio_id);

    if (qErr) throw qErr;

    // Sum totals from all quincenas
    const totalMinutosPrecaria = (quincenas || []).reduce((s, q) => s + Number(q.minutos_precaria), 0);
    const totalMinutosEmpadronada = (quincenas || []).reduce((s, q) => s + Number(q.minutos_empadronada), 0);
    
    // Convert to hours and round up
    const totalMinutos = totalMinutosPrecaria + totalMinutosEmpadronada;
    const horasDecimal = totalMinutos / 60;
    const horasRedondeadas = Math.ceil(horasDecimal);

    // Total monetary from quincenas subtotals
    const totalCalculado = (quincenas || []).reduce((s, q) => s + Number(q.subtotal_calculado), 0);

    const nuevoSaldo = Math.max(0, totalCalculado - Number(mes.total_pagado));
    const nuevoEstado = nuevoSaldo <= 0 ? "pagado" : "pendiente";

    const { error: updateErr } = await supabase
      .from("meses_servicio")
      .update({
        total_calculado: totalCalculado,
        saldo_pendiente: nuevoSaldo,
        estado_mes: nuevoEstado,
      })
      .eq("id", mes_servicio_id);

    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({
        success: true,
        subtotal_quincena: subtotal,
        total_mensual: totalCalculado,
        horas_decimal: horasDecimal,
        horas_redondeadas: horasRedondeadas,
        saldo_pendiente: nuevoSaldo,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('[guardar-quincena]', error);
    return new Response(
      JSON.stringify({ error: "No se pudo guardar la quincena. Intente nuevamente." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
