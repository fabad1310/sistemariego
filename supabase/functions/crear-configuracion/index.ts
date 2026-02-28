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
    const { cliente_id, anio, horas_discriminadas, horas_no_discriminadas, valor_hora_discriminada, valor_hora_no_discriminada } = body;

    // UUID validation
    if (!cliente_id || !UUID_REGEX.test(String(cliente_id))) throw new Error("cliente_id inválido");

    // Year validation
    if (typeof anio !== "number" || !Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      throw new Error("anio debe ser un número entero entre 2000 y 2100");
    }

    // Numeric validations with bounds
    if (typeof horas_discriminadas !== "number" || !Number.isFinite(horas_discriminadas) || horas_discriminadas <= 0 || horas_discriminadas > MAX_VALUE) {
      throw new Error("horas_discriminadas debe ser mayor a 0 y menor a 100.000.000");
    }
    if (typeof horas_no_discriminadas !== "number" || !Number.isFinite(horas_no_discriminadas) || horas_no_discriminadas < 0 || horas_no_discriminadas > MAX_VALUE) {
      throw new Error("horas_no_discriminadas no puede ser negativo ni mayor a 100.000.000");
    }
    if (typeof valor_hora_discriminada !== "number" || !Number.isFinite(valor_hora_discriminada) || valor_hora_discriminada <= 0 || valor_hora_discriminada > MAX_VALUE) {
      throw new Error("valor_hora_discriminada debe ser mayor a 0 y menor a 100.000.000");
    }
    if (typeof valor_hora_no_discriminada !== "number" || !Number.isFinite(valor_hora_no_discriminada) || valor_hora_no_discriminada < 0 || valor_hora_no_discriminada > MAX_VALUE) {
      throw new Error("valor_hora_no_discriminada no puede ser negativo ni mayor a 100.000.000");
    }

    // Verify client exists
    const { data: cliente, error: clienteErr } = await supabase
      .from("clientes")
      .select("id")
      .eq("id", cliente_id)
      .maybeSingle();
    if (clienteErr || !cliente) throw new Error("Cliente no encontrado");

    const horas_totales_mes = horas_discriminadas + horas_no_discriminadas;

    // Check if config already exists
    const { data: existing } = await supabase
      .from("configuracion_riego_cliente")
      .select("id")
      .eq("cliente_id", cliente_id)
      .eq("anio", anio)
      .maybeSingle();

    if (existing) throw new Error(`Ya existe configuración para el año ${anio}`);

    // Create config
    const { data: config, error: configError } = await supabase
      .from("configuracion_riego_cliente")
      .insert({
        cliente_id,
        anio,
        horas_totales_mes,
        horas_discriminadas,
        horas_no_discriminadas,
        valor_hora_discriminada,
        valor_hora_no_discriminada,
      })
      .select()
      .single();

    if (configError) throw configError;

    const total_calculado = (horas_discriminadas * valor_hora_discriminada) + (horas_no_discriminadas * valor_hora_no_discriminada);

    // Generate 12 months
    const meses = Array.from({ length: 12 }, (_, i) => ({
      cliente_id,
      configuracion_id: config.id,
      anio,
      mes: i + 1,
      total_calculado,
      total_pagado: 0,
      saldo_pendiente: total_calculado,
      estado_mes: "pendiente",
    }));

    const { error: mesesError } = await supabase.from("meses_servicio").insert(meses);
    if (mesesError) throw mesesError;

    return new Response(
      JSON.stringify({ success: true, configuracion_id: config.id, total_mensual: total_calculado }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('[crear-configuracion]', error);
    return new Response(
      JSON.stringify({ error: "No se pudo crear la configuración. Intente nuevamente." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});