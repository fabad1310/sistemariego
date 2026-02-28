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
    const { cliente_id, anio, valor_hora_precaria, valor_hora_empadronada, quincenas_data } = body;

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

    // Validate quincenas_data: array of {mes, q1_precaria, q1_empadronada, q2_precaria, q2_empadronada}
    if (!Array.isArray(quincenas_data)) throw new Error("quincenas_data debe ser un array");

    for (const q of quincenas_data) {
      if (typeof q.mes !== "number" || q.mes < 1 || q.mes > 12) throw new Error(`Mes inválido: ${q.mes}`);
      for (const field of ["q1_precaria", "q1_empadronada", "q2_precaria", "q2_empadronada"]) {
        const val = q[field];
        if (typeof val !== "number" || !Number.isFinite(val) || val < 0 || val > MAX_MINUTES || !Number.isInteger(val)) {
          throw new Error(`${field} inválido para mes ${q.mes}`);
        }
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

    // 2. Build 12 months with calculations based on quincenas_data
    const qMap = new Map<number, any>();
    for (const q of quincenas_data) {
      qMap.set(q.mes, q);
    }

    const mesesInsert = [];
    for (let i = 1; i <= 12; i++) {
      const q = qMap.get(i);
      let horas_precaria_final = 0;
      let horas_empadronada_final = 0;
      let total_calculado = 0;

      if (q) {
        const total_min_precaria = q.q1_precaria + q.q2_precaria;
        const total_min_empadronada = q.q1_empadronada + q.q2_empadronada;
        horas_precaria_final = total_min_precaria > 0 ? Math.ceil(total_min_precaria / 60) : 0;
        horas_empadronada_final = total_min_empadronada > 0 ? Math.ceil(total_min_empadronada / 60) : 0;
        total_calculado = (horas_precaria_final * valor_hora_precaria) + (horas_empadronada_final * valor_hora_empadronada);
      }

      mesesInsert.push({
        cliente_id, configuracion_id: config.id, anio, mes: i,
        total_calculado, total_pagado: 0,
        saldo_pendiente: total_calculado,
        estado_mes: "pendiente",
        horas_precaria_final, horas_empadronada_final,
      });
    }

    const { data: mesesCreados, error: mesesError } = await supabase
      .from("meses_servicio").insert(mesesInsert).select();
    if (mesesError) throw mesesError;

    // 3. Create quincenas for months that have data
    const quincenasInsert = [];
    for (const mes of mesesCreados!) {
      const q = qMap.get(mes.mes);
      // Always create both quincenas (even if 0)
      quincenasInsert.push({
        mes_servicio_id: mes.id, numero_quincena: 1,
        minutos_precaria: q?.q1_precaria ?? 0,
        minutos_empadronada: q?.q1_empadronada ?? 0,
      });
      quincenasInsert.push({
        mes_servicio_id: mes.id, numero_quincena: 2,
        minutos_precaria: q?.q2_precaria ?? 0,
        minutos_empadronada: q?.q2_empadronada ?? 0,
      });
    }

    const { error: quincenasError } = await supabase
      .from("quincenas_servicio").insert(quincenasInsert);
    if (quincenasError) throw quincenasError;

    return new Response(
      JSON.stringify({
        success: true,
        configuracion_id: config.id,
        meses_creados: 12,
        quincenas_creadas: quincenasInsert.length,
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
