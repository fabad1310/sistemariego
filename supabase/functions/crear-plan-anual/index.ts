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
      q1_precaria, q1_empadronada, q2_precaria, q2_empadronada,
      meses_seleccionados,
    } = body;

    if (!cliente_id || !UUID_REGEX.test(String(cliente_id))) throw new Error("cliente_id inválido");
    if (typeof anio !== "number" || !Number.isInteger(anio) || anio < 2000 || anio > 2100) throw new Error("anio inválido");

    if (typeof valor_hora_precaria !== "number" || !Number.isFinite(valor_hora_precaria) || valor_hora_precaria < 0 || valor_hora_precaria > MAX_VALUE) throw new Error("valor_hora_precaria inválido");
    if (typeof valor_hora_empadronada !== "number" || !Number.isFinite(valor_hora_empadronada) || valor_hora_empadronada < 0 || valor_hora_empadronada > MAX_VALUE) throw new Error("valor_hora_empadronada inválido");
    if (valor_hora_precaria === 0 && valor_hora_empadronada === 0) throw new Error("Al menos un valor por hora debe ser mayor a 0");

    for (const [field, val] of Object.entries({ q1_precaria, q1_empadronada, q2_precaria, q2_empadronada })) {
      if (typeof val !== "number" || !Number.isFinite(val) || val < 0 || val > MAX_MINUTES || !Number.isInteger(val)) {
        throw new Error(`${field} debe ser un entero no negativo`);
      }
    }

    let meses: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    if (meses_seleccionados && Array.isArray(meses_seleccionados)) {
      if (meses_seleccionados.length === 0) throw new Error("Debe seleccionar al menos un mes");
      for (const m of meses_seleccionados) {
        if (typeof m !== "number" || !Number.isInteger(m) || m < 1 || m > 12) {
          throw new Error("Mes seleccionado inválido");
        }
      }
      meses = [...new Set(meses_seleccionados)].sort((a, b) => a - b);
    }

    // *** FIX SALDO A FAVOR — leer saldo_a_favor del cliente ***
    const { data: cliente, error: clienteErr } = await supabase
      .from("clientes")
      .select("id, saldo_a_favor")
      .eq("id", cliente_id)
      .maybeSingle();
    if (clienteErr || !cliente) throw new Error("Cliente no encontrado");

    const saldoAFavor = Math.max(0, Number(cliente.saldo_a_favor ?? 0));

    const { data: existingConfig } = await supabase
      .from("configuracion_riego_cliente").select("id")
      .eq("cliente_id", cliente_id).eq("anio", anio).maybeSingle();

    const { data: existingMeses } = await supabase
      .from("meses_servicio").select("mes")
      .eq("cliente_id", cliente_id).eq("anio", anio);
    const existingMesesSet = new Set((existingMeses || []).map(m => m.mes));
    const conflictingMeses = meses.filter(m => existingMesesSet.has(m));
    if (conflictingMeses.length > 0) {
      const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
      throw new Error(`Ya existen los meses: ${conflictingMeses.map(m => MONTH_NAMES[m-1]).join(", ")}`);
    }

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
    const montoAdminFinal = totalRiego > 0 ? montoAdmin : 0;
    const totalCalculado = totalRiego + montoAdminFinal;

    let configId: string;
    if (existingConfig) {
      const { error: updateConfigErr } = await supabase
        .from("configuracion_riego_cliente")
        .update({
          valor_hora_discriminada: valor_hora_precaria,
          valor_hora_no_discriminada: valor_hora_empadronada,
        })
        .eq("id", existingConfig.id);
      if (updateConfigErr) throw updateConfigErr;
      configId = existingConfig.id;
    } else {
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
      configId = config.id;
    }

    const mesesInsert = meses.map(mesNum => ({
      cliente_id, configuracion_id: configId, anio, mes: mesNum,
      total_calculado: totalCalculado,
      total_pagado: 0,
      saldo_pendiente: totalCalculado,
      estado_mes: "pendiente",
      horas_precaria_final: horasPrecFinal,
      horas_empadronada_final: horasEmpFinal,
      monto_administrativo: montoAdminFinal,
    }));

    const { data: mesesCreados, error: mesesError } = await supabase
      .from("meses_servicio").insert(mesesInsert).select();
    if (mesesError) throw mesesError;

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

    // *** FIX SALDO A FAVOR — aplicar saldo acumulado a los nuevos meses (orden cronológico) ***
    let saldo_a_favor_aplicado = 0;
    let saldoRestante = saldoAFavor;
    const today = new Date().toISOString().split("T")[0];

    console.log(
      `[crear-plan-anual] Saldo a favor antes: $${saldoAFavor}. ` +
      `Meses creados: ${mesesCreados?.length ?? 0}. Cliente: ${cliente_id}, año ${anio}.`
    );

    if (saldoAFavor > 0 && mesesCreados && mesesCreados.length > 0) {
      // Orden cronológico estricto: aplicar primero al mes más antiguo
      const mesesOrdenados = [...mesesCreados].sort((a, b) => {
        if (a.anio !== b.anio) return a.anio - b.anio;
        return a.mes - b.mes;
      });

      for (const mesNuevo of mesesOrdenados) {
        if (saldoRestante <= 0) break;

        const mesSaldo = Number(mesNuevo.saldo_pendiente);
        if (mesSaldo <= 0) continue;

        const applyAmount = Math.round(Math.min(saldoRestante, mesSaldo) * 100) / 100;
        const nuevoTotalPagado = Math.round((Number(mesNuevo.total_pagado) + applyAmount) * 100) / 100;
        const nuevoSaldo = Math.max(0, Math.round((mesSaldo - applyAmount) * 100) / 100);
        const nuevoEstado = nuevoSaldo <= 0 ? "pagado" : "pendiente";

        const { error: pagoErr } = await supabase.from("pagos").insert({
          cliente_id,
          mes_servicio_id: mesNuevo.id,
          monto: applyAmount,
          metodo_pago: "efectivo",
          numero_recibo: null,
          notas: `Saldo a favor acumulado aplicado automáticamente al crear plan ${anio}`,
          fecha_pago_real: today,
        });
        if (pagoErr) throw new Error("Error al registrar aplicación de saldo_a_favor: " + pagoErr.message);

        const { error: updateMesErr } = await supabase
          .from("meses_servicio")
          .update({
            total_pagado: nuevoTotalPagado,
            saldo_pendiente: nuevoSaldo,
            estado_mes: nuevoEstado,
          })
          .eq("id", mesNuevo.id);
        if (updateMesErr) throw new Error("Error al actualizar mes con saldo_a_favor: " + updateMesErr.message);

        saldo_a_favor_aplicado = Math.round((saldo_a_favor_aplicado + applyAmount) * 100) / 100;
        saldoRestante = Math.max(0, Math.round((saldoRestante - applyAmount) * 100) / 100);
      }

      const saldoFinal = Math.max(0, Math.round(saldoRestante * 100) / 100);
      const { error: updateClienteErr } = await supabase
        .from("clientes")
        .update({ saldo_a_favor: saldoFinal })
        .eq("id", cliente_id);
      if (updateClienteErr) throw new Error("Error al actualizar saldo_a_favor del cliente: " + updateClienteErr.message);

      console.log(
        `[crear-plan-anual] Aplicados $${saldo_a_favor_aplicado} de saldo_a_favor al plan ${anio}. ` +
        `Saldo restante: $${saldoFinal}`
      );
      saldoRestante = saldoFinal;
    }
    // *** FIN FIX SALDO A FAVOR ***

    return new Response(
      JSON.stringify({
        success: true,
        configuracion_id: configId,
        meses_creados: meses.length,
        total_por_mes: totalCalculado,
        monto_administrativo: montoAdminFinal,
        total_anual: totalCalculado * meses.length,
        saldo_a_favor_aplicado,
        saldo_a_favor_restante: saldoRestante,
        mensaje: saldo_a_favor_aplicado > 0
          ? `Se aplicaron $${saldo_a_favor_aplicado.toLocaleString("es-AR")} de saldo a favor acumulado al nuevo plan ${anio}.`
          : undefined,
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
