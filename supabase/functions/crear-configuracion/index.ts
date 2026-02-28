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

    const { cliente_id, anio, horas_discriminadas, horas_no_discriminadas, valor_hora_discriminada, valor_hora_no_discriminada } = await req.json();

    // Validations
    if (!cliente_id || !anio) throw new Error("cliente_id y anio son requeridos");
    if (horas_discriminadas <= 0) throw new Error("horas_discriminadas debe ser mayor a 0");
    if (horas_no_discriminadas < 0) throw new Error("horas_no_discriminadas no puede ser negativo");
    if (valor_hora_discriminada <= 0) throw new Error("valor_hora_discriminada debe ser mayor a 0");
    if (valor_hora_no_discriminada < 0) throw new Error("valor_hora_no_discriminada no puede ser negativo");

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

    // Calculate monthly total
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
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
