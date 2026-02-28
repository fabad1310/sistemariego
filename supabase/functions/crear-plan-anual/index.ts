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
      cliente_id, anio,
      valor_hora_precaria, valor_hora_empadronada,
      q1_precaria, q1_empadronada, q2_precaria, q2_empadronada
    } = body;

    // Validate cliente_id
    if (!cliente_id || !UUID_REGEX.test(String(cliente_id))) throw new Error("cliente_id inválido");

    // Validate year
    if (typeof anio !== "number" || !Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      throw new Error("anio debe ser un número entero entre 2000 y 2100");
    }

    // Validate rates
    if (typeof valor_hora_precaria !== "number" || !Number.isFinite(valor_hora_precaria) || valor_hora_precaria < 0 || valor_hora_precaria > MAX_VALUE) {
      throw new Error("valor_hora_precaria inválido");
    }
    if (typeof valor_hora_empadronada !== "number" || !Number.isFinite(valor_hora_empadronada) || valor_hora_empadronada < 0 || valor_hora_empadronada > MAX_VALUE) {
      throw new Error("valor_hora_empadronada inválido");
    }
    if (valor_hora_precaria === 0 && valor_hora_empadronada === 0) {
      throw new Error("Al menos un valor por hora debe ser mayor a 0");
    }

    // Validate quincena minutes (single values applied to all 12 months)
    for (const [field, val] of Object.entries({ q1_precaria, q1_empadronada, q2_precaria, q2_empadronada })) {
      if (typeof val !== "number" || !Number.isFinite(val) || val < 0 || val > MAX_MINUTES || !Number.isInteger(val)) {
        throw new Error(`${field} debe ser un entero no negativo`);
      }
    }

    // Verify client exists
    const { data: cliente, error: clienteErr } = await supabase
      .from("clientes").select("id").eq("id", cliente_id).maybeSingle();
    if (clienteErr || !cliente) throw new Error("Cliente no encontrado");

    // Check no existing config
    const { data: existing } = await supabase
      .from("configuracion_riego_cliente").select("id")
      .eq("cliente_id", cliente_id).eq("anio", anio).maybeSingle();
    if (existing) throw new Error(`Ya existe configuración para el año ${anio}`);

    // Calculate hours and total (same for all months)
    const totalMinPrecaria = q1_precaria + q2_precaria;
    const totalMinEmpadronada = q1_empadronada + q2_empadronada;
    const horasPrecFinal = totalMinPrecaria > 0 ? Math.ceil(totalMinPrecaria / 60) : 0;
    const horasEmpFinal = totalMinEmpadronada > 0 ? Math.ceil(totalMinEmpadronada / 60) : 0;
    const totalCalculado = (horasPrecFinal * valor_hora_precaria) + (horasEmpFinal * valor_hora_empadronada);

    // 1. Create config
    const { data: config, error: configError } = await supabase
      .from("configuracion_riego_cliente")
      .insert({
        cliente_id, anio,
        horas_totales_mes: 0, horas_discriminadas: 0, horas_no_discriminadas: 0,
        valor_hora_discriminada: valor_hora_precaria,
        valor_hora_no_discriminada: valor_hora_empadronada,
      })
      .select().single();
    if (configError) throw configError;

    // 2. Create 12 months (all with same calculated values)
    const mesesInsert = Array.from({ length: 12 }, (_, i) => ({
      cliente_id, configuracion_id: config.id, anio, mes: i + 1,
      total_calculado: totalCalculado,
      total_pagado: 0,
      saldo_pendiente: totalCalculado,
      estado_mes: "pendiente",
      horas_precaria_final: horasPrecFinal,
      horas_empadronada_final: horasEmpFinal,
    }));

    const { data: mesesCreados, error: mesesError } = await supabase
      .from("meses_servicio").insert(mesesInsert).select();
    if (mesesError) throw mesesError;

    // 3. Create quincenas for all 12 months (same values)
    const quincenasInsert = [];
    for (const mes of mesesCreados!) {
      quincenasInsert.push(
        { mes_servicio_id: mes.id, numero_quincena: 1, minutos_precaria: q1_precaria, minutos_empadronada: q1_empadronada },
        { mes_servicio_id: mes.id, numero_quincena: 2, minutos_precaria: q2_precaria, minutos_empadronada: q2_empadronada },
      );
    }

    const { error: quincenasError } = await supabase
      .from("quincenas_servicio").insert(quincenasInsert);
    if (quincenasError) throw quincenasError;

    return new Response(
      JSON.stringify({
        success: true,
        configuracion_id: config.id,
        meses_creados: 12,
        total_por_mes: totalCalculado,
        total_anual: totalCalculado * 12,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[crear-plan-anual]", error);
    return new Response(
      JSON.stringify({ error: error.message || "Error al crear plan anual" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
