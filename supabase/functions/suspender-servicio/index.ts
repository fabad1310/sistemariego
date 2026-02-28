import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    const { mes_servicio_id, accion } = body;

    // UUID validation
    if (!mes_servicio_id || !UUID_REGEX.test(String(mes_servicio_id))) throw new Error("mes_servicio_id inválido");

    // Action validation
    if (typeof accion !== "string" || !["suspender", "reactivar"].includes(accion)) {
      throw new Error("accion debe ser 'suspender' o 'reactivar'");
    }

    // Get the target month
    const { data: mes, error: mesErr } = await supabase
      .from("meses_servicio")
      .select("*")
      .eq("id", mes_servicio_id)
      .single();

    if (mesErr || !mes) throw new Error("Mes de servicio no encontrado");

    if (accion === "suspender" && mes.estado_mes === "pagado") {
      throw new Error("No se puede suspender un mes ya pagado");
    }

    if (accion === "suspender") {
      const { error: suspErr } = await supabase
        .from("meses_servicio")
        .update({
          estado_servicio: "suspendido",
          total_calculado: 0,
          saldo_pendiente: 0,
          estado_mes: "pagado",
        })
        .eq("id", mes_servicio_id);
      if (suspErr) throw suspErr;

      const { data: futureMeses, error: futErr } = await supabase
        .from("meses_servicio")
        .select("*")
        .eq("cliente_id", mes.cliente_id)
        .eq("anio", mes.anio)
        .gt("mes", mes.mes)
        .eq("estado_mes", "pendiente");

      if (futErr) throw futErr;

      for (const fm of (futureMeses || [])) {
        const { error: upErr } = await supabase
          .from("meses_servicio")
          .update({
            estado_servicio: "suspendido",
            total_calculado: 0,
            saldo_pendiente: 0,
            estado_mes: "pagado",
          })
          .eq("id", fm.id);
        if (upErr) throw upErr;
      }

      return new Response(
        JSON.stringify({ success: true, meses_suspendidos: (futureMeses?.length ?? 0) + 1 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      const { data: config, error: confErr } = await supabase
        .from("configuracion_riego_cliente")
        .select("*")
        .eq("id", mes.configuracion_id)
        .single();

      if (confErr || !config) throw new Error("Configuración no encontrada");

      const total_calculado = (Number(config.horas_discriminadas) * Number(config.valor_hora_discriminada)) +
        (Number(config.horas_no_discriminadas) * Number(config.valor_hora_no_discriminada));

      const { error: reactErr } = await supabase
        .from("meses_servicio")
        .update({
          estado_servicio: "activo",
          total_calculado,
          saldo_pendiente: Math.max(0, total_calculado - Number(mes.total_pagado)),
          estado_mes: total_calculado - Number(mes.total_pagado) <= 0 ? "pagado" : "pendiente",
        })
        .eq("id", mes_servicio_id);
      if (reactErr) throw reactErr;

      const { data: futureSusp, error: futSErr } = await supabase
        .from("meses_servicio")
        .select("*")
        .eq("cliente_id", mes.cliente_id)
        .eq("anio", mes.anio)
        .gt("mes", mes.mes)
        .eq("estado_servicio", "suspendido");

      if (futSErr) throw futSErr;

      for (const fm of (futureSusp || [])) {
        const saldo = Math.max(0, total_calculado - Number(fm.total_pagado));
        const { error: upErr } = await supabase
          .from("meses_servicio")
          .update({
            estado_servicio: "activo",
            total_calculado,
            saldo_pendiente: saldo,
            estado_mes: saldo <= 0 ? "pagado" : "pendiente",
          })
          .eq("id", fm.id);
        if (upErr) throw upErr;
      }

      return new Response(
        JSON.stringify({ success: true, meses_reactivados: (futureSusp?.length ?? 0) + 1 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: any) {
    console.error('[suspender-servicio]', error);
    return new Response(
      JSON.stringify({ error: "No se pudo completar la operación. Intente nuevamente." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});