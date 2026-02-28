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

    if (!mes_servicio_id || !UUID_REGEX.test(String(mes_servicio_id))) throw new Error("mes_servicio_id inválido");
    if (typeof accion !== "string" || !["suspender", "reactivar"].includes(accion)) throw new Error("accion debe ser 'suspender' o 'reactivar'");

    const { data: mes, error: mesErr } = await supabase
      .from("meses_servicio").select("*").eq("id", mes_servicio_id).single();
    if (mesErr || !mes) throw new Error("Mes de servicio no encontrado");

    if (accion === "suspender" && mes.estado_mes === "pagado") throw new Error("No se puede suspender un mes ya pagado");

    if (accion === "suspender") {
      const { error: suspErr } = await supabase
        .from("meses_servicio")
        .update({ estado_servicio: "suspendido", total_calculado: 0, saldo_pendiente: 0, estado_mes: "pagado", horas_precaria_final: 0, horas_empadronada_final: 0, monto_administrativo: 0 })
        .eq("id", mes_servicio_id);
      if (suspErr) throw suspErr;

      const { data: futureMeses, error: futErr } = await supabase
        .from("meses_servicio").select("*")
        .eq("cliente_id", mes.cliente_id).eq("anio", mes.anio)
        .gt("mes", mes.mes).eq("estado_mes", "pendiente");
      if (futErr) throw futErr;

      for (const fm of (futureMeses || [])) {
        await supabase.from("meses_servicio")
          .update({ estado_servicio: "suspendido", total_calculado: 0, saldo_pendiente: 0, estado_mes: "pagado", horas_precaria_final: 0, horas_empadronada_final: 0, monto_administrativo: 0 })
          .eq("id", fm.id);
      }

      return new Response(
        JSON.stringify({ success: true, meses_suspendidos: (futureMeses?.length ?? 0) + 1 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      const { data: config, error: confErr } = await supabase
        .from("configuracion_riego_cliente").select("*").eq("id", mes.configuracion_id).single();
      if (confErr || !config) throw new Error("Configuración no encontrada");

      // Get current admin fee
      const { data: adminConfig } = await supabase
        .from("configuracion_global").select("valor").eq("clave", "monto_administrativo").maybeSingle();
      const montoAdmin = Number(adminConfig?.valor ?? 0);

      const valorHoraPrec = Number(config.valor_hora_discriminada);
      const valorHoraEmp = Number(config.valor_hora_no_discriminada);

      const recalcMonth = async (monthId: string, totalPagado: number) => {
        const { data: quincenas } = await supabase
          .from("quincenas_servicio").select("*").eq("mes_servicio_id", monthId);

        const totalMinPrec = (quincenas || []).reduce((s, q) => s + Number(q.minutos_precaria), 0);
        const totalMinEmp = (quincenas || []).reduce((s, q) => s + Number(q.minutos_empadronada), 0);
        const horasPrecFinal = totalMinPrec > 0 ? Math.ceil(totalMinPrec / 60) : 0;
        const horasEmpFinal = totalMinEmp > 0 ? Math.ceil(totalMinEmp / 60) : 0;
        const totalRiego = (horasPrecFinal * valorHoraPrec) + (horasEmpFinal * valorHoraEmp);
        
        // Admin fee ONLY if base > 0
        const montoAdminFinal = totalRiego > 0 ? montoAdmin : 0;
        const totalCalc = totalRiego + montoAdminFinal;
        const saldo = Math.max(0, totalCalc - totalPagado);

        await supabase.from("meses_servicio")
          .update({
            estado_servicio: "activo",
            horas_precaria_final: horasPrecFinal, horas_empadronada_final: horasEmpFinal,
            total_calculado: totalCalc, saldo_pendiente: saldo,
            estado_mes: saldo <= 0 ? "pagado" : "pendiente",
            monto_administrativo: montoAdminFinal,
          })
          .eq("id", monthId);
      };

      await recalcMonth(mes.id, Number(mes.total_pagado));

      const { data: futureSusp, error: futSErr } = await supabase
        .from("meses_servicio").select("*")
        .eq("cliente_id", mes.cliente_id).eq("anio", mes.anio)
        .gt("mes", mes.mes).eq("estado_servicio", "suspendido");
      if (futSErr) throw futSErr;

      for (const fm of (futureSusp || [])) {
        await recalcMonth(fm.id, Number(fm.total_pagado));
      }

      return new Response(
        JSON.stringify({ success: true, meses_reactivados: (futureSusp?.length ?? 0) + 1 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: any) {
    console.error('[suspender-servicio]', error);
    return new Response(
      JSON.stringify({ error: error.message || "No se pudo completar la operación." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
