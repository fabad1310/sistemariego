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

    if (!mes_servicio_id || !UUID_REGEX.test(String(mes_servicio_id))) throw new Error("mes_servicio_id inválido");
    if (![1, 2].includes(numero_quincena)) throw new Error("numero_quincena debe ser 1 o 2");

    if (typeof minutos_precaria !== "number" || !Number.isFinite(minutos_precaria) || minutos_precaria < 0 || minutos_precaria > MAX_MINUTOS) {
      throw new Error("minutos_precaria debe ser un número entre 0 y 100.000");
    }
    if (typeof minutos_empadronada !== "number" || !Number.isFinite(minutos_empadronada) || minutos_empadronada < 0 || minutos_empadronada > MAX_MINUTOS) {
      throw new Error("minutos_empadronada debe ser un número entre 0 y 100.000");
    }

    const { data: mes, error: mesErr } = await supabase
      .from("meses_servicio").select("*").eq("id", mes_servicio_id).single();
    if (mesErr || !mes) throw new Error("Mes de servicio no encontrado");
    // REMOVED: restriction on editing paid months — now allowed
    if (mes.estado_servicio === "suspendido") throw new Error("No se puede editar un mes suspendido");

    const { error: upsertErr } = await supabase
      .from("quincenas_servicio")
      .upsert({ mes_servicio_id, numero_quincena, minutos_precaria, minutos_empadronada }, { onConflict: "mes_servicio_id,numero_quincena" });
    if (upsertErr) throw upsertErr;

    const { data: quincenas, error: qErr } = await supabase
      .from("quincenas_servicio").select("*").eq("mes_servicio_id", mes_servicio_id);
    if (qErr) throw qErr;

    const { data: config, error: confErr } = await supabase
      .from("configuracion_riego_cliente").select("*").eq("id", mes.configuracion_id).single();
    if (confErr || !config) throw new Error("Configuración no encontrada");

    const valor_hora_precaria = Number(config.valor_hora_discriminada);
    const valor_hora_empadronada = Number(config.valor_hora_no_discriminada);

    const totalMinutosPrecaria = (quincenas || []).reduce((s, q) => s + Number(q.minutos_precaria), 0);
    const totalMinutosEmpadronada = (quincenas || []).reduce((s, q) => s + Number(q.minutos_empadronada), 0);

    const horasPrecFinal = totalMinutosPrecaria > 0 ? Math.ceil(totalMinutosPrecaria / 60) : 0;
    const horasEmpFinal = totalMinutosEmpadronada > 0 ? Math.ceil(totalMinutosEmpadronada / 60) : 0;

    const totalRiego = (horasPrecFinal * valor_hora_precaria) + (horasEmpFinal * valor_hora_empadronada);
    
    // Admin fee: ONLY apply if base amount > 0
    const montoAdminGlobal = Number(mes.monto_administrativo || 0);
    const montoAdminFinal = totalRiego > 0 ? montoAdminGlobal : 0;
    
    // Check if override is active
    const usaOverride = mes.usa_override === true;
    const totalCalculado = usaOverride ? Number(mes.monto_override || 0) : (totalRiego + montoAdminFinal);

    const nuevoSaldo = Math.max(0, totalCalculado - Number(mes.total_pagado));
    const nuevoEstado = nuevoSaldo <= 0 ? "pagado" : "pendiente";

    const { error: updateErr } = await supabase
      .from("meses_servicio")
      .update({
        horas_precaria_final: horasPrecFinal,
        horas_empadronada_final: horasEmpFinal,
        total_calculado: totalCalculado,
        saldo_pendiente: nuevoSaldo,
        estado_mes: nuevoEstado,
        monto_administrativo: montoAdminFinal,
      })
      .eq("id", mes_servicio_id);
    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({
        success: true,
        total_minutos_precaria: totalMinutosPrecaria,
        total_minutos_empadronada: totalMinutosEmpadronada,
        horas_precaria_final: horasPrecFinal,
        horas_empadronada_final: horasEmpFinal,
        total_riego: totalRiego,
        monto_administrativo: montoAdminFinal,
        total_mensual: totalCalculado,
        saldo_pendiente: nuevoSaldo,
        usa_override: usaOverride,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('[guardar-quincena]', error);
    return new Response(
      JSON.stringify({ error: error.message || "No se pudo guardar la quincena." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
