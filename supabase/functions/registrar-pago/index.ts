import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MONTO = 100000000;
const MAX_STRING_LEN = 500;

function sanitizeString(val: unknown, maxLen = MAX_STRING_LEN): string | null {
  if (val == null || val === "") return null;
  if (typeof val !== "string") return null;
  return val.trim().slice(0, maxLen).replace(/<[^>]*>/g, "");
}

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
    const { mes_servicio_id, cliente_id, monto, metodo_pago, numero_recibo, fecha_transferencia, notas, fecha_pago_real } = body;

    if (!mes_servicio_id || !UUID_REGEX.test(String(mes_servicio_id))) throw new Error("mes_servicio_id inválido");
    if (!cliente_id || !UUID_REGEX.test(String(cliente_id))) throw new Error("cliente_id inválido");

    if (typeof monto !== "number" || !Number.isFinite(monto) || monto <= 0 || monto > MAX_MONTO) {
      throw new Error("El monto debe ser un número positivo válido (máx 100.000.000)");
    }

    if (!["efectivo", "transferencia"].includes(metodo_pago)) throw new Error("Método de pago inválido");

    if (!fecha_pago_real || !DATE_REGEX.test(String(fecha_pago_real))) {
      throw new Error("fecha_pago_real es obligatoria (formato YYYY-MM-DD)");
    }
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const fechaReal = new Date(fecha_pago_real + "T12:00:00");
    if (fechaReal > today) throw new Error("La fecha de pago no puede ser futura");

    const safeRecibo = sanitizeString(numero_recibo, 50);
    if (metodo_pago === "efectivo" && !safeRecibo) throw new Error("Número de recibo requerido para pago en efectivo");
    if (metodo_pago === "transferencia") {
      if (!fecha_transferencia || !DATE_REGEX.test(String(fecha_transferencia))) {
        throw new Error("Fecha de transferencia requerida y debe tener formato YYYY-MM-DD");
      }
    }

    const safeNotas = sanitizeString(notas);

    // ── PROTECCIÓN A: Anti-duplicado antes de cualquier escritura ──
    {
      let dupQuery = supabase
        .from("pagos")
        .select("id, monto")
        .eq("cliente_id", cliente_id)
        .eq("mes_servicio_id", mes_servicio_id);

      if (metodo_pago === "efectivo") {
        dupQuery = dupQuery.eq("numero_recibo", safeRecibo!);
      } else {
        dupQuery = dupQuery
          .eq("metodo_pago", "transferencia")
          .eq("fecha_transferencia", fecha_transferencia)
          .eq("monto", monto);
      }

      const { data: dupCheck } = await dupQuery.limit(1);
      if (dupCheck && dupCheck.length > 0) {
        // Ya existe – leer estado actual del mes y devolver sin procesar
        const { data: mesActual } = await supabase
          .from("meses_servicio")
          .select("saldo_pendiente, estado_mes")
          .eq("id", mes_servicio_id)
          .single();

        console.log(`[registrar-pago] Duplicado detectado. Pago existente: ${dupCheck[0].id}`);

        return new Response(
          JSON.stringify({
            success: true,
            ya_procesado: true,
            pago_aplicado: Number(dupCheck[0].monto),
            excedente_aplicado: 0,
            excedente_guardado_como_saldo_a_favor: 0,
            saldo_restante: Number(mesActual?.saldo_pendiente ?? 0),
            estado: mesActual?.estado_mes ?? "pendiente",
            mensaje: "Este pago ya fue registrado anteriormente.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Leer mes de servicio
    const { data: mes, error: mesError } = await supabase
      .from("meses_servicio")
      .select("*")
      .eq("id", mes_servicio_id)
      .single();

    if (mesError || !mes) throw new Error("Mes de servicio no encontrado");
    if (mes.cliente_id !== cliente_id) throw new Error("El cliente no corresponde al mes de servicio");

    const currentSaldo = Number(mes.saldo_pendiente);

    // ── PROTECCIÓN B: Mes ya pagado ──
    if (currentSaldo <= 0) {
      throw new Error("Este mes ya está completamente pagado (saldo $0). Para registrar un pago adelantado, ingresalo directamente desde ese mes.");
    }

    let remaining = monto;
    let excedente_aplicado = 0;

    const amountForThisMonth = Math.min(remaining, currentSaldo);
    const newTotalPagado = Number(mes.total_pagado) + amountForThisMonth;
    const newSaldo = Math.max(0, currentSaldo - remaining);
    const newEstado = newSaldo <= 0 ? "pagado" : "pendiente";

    const { error: pagoError } = await supabase.from("pagos").insert({
      cliente_id,
      mes_servicio_id,
      monto: amountForThisMonth,
      metodo_pago,
      numero_recibo: metodo_pago === "efectivo" ? safeRecibo : null,
      fecha_transferencia: metodo_pago === "transferencia" ? fecha_transferencia : null,
      notas: safeNotas,
      fecha_pago_real,
    });
    if (pagoError) throw pagoError;

    const { error: updateError } = await supabase
      .from("meses_servicio")
      .update({
        total_pagado: newTotalPagado,
        saldo_pendiente: newSaldo,
        estado_mes: newEstado,
      })
      .eq("id", mes_servicio_id);
    if (updateError) throw updateError;

    remaining -= amountForThisMonth;

    if (remaining > 0) {
      const { data: nextMeses, error: nextError } = await supabase
        .from("meses_servicio")
        .select("*")
        .eq("cliente_id", cliente_id)
        .eq("estado_mes", "pendiente")
        .neq("id", mes_servicio_id)
        .order("anio", { ascending: true })
        .order("mes", { ascending: true });

      if (nextError) throw nextError;

      const futureMonths = (nextMeses || []).filter((m: any) => {
        if (m.anio > mes.anio) return true;
        if (m.anio === mes.anio && m.mes > mes.mes) return true;
        return false;
      });

      const notaExcedente = `Excedente aplicado desde ${getMesName(mes.mes)} ${mes.anio}`;

      for (const nextMes of futureMonths) {
        if (remaining <= 0) break;

        const nextSaldo = Number(nextMes.saldo_pendiente);
        if (nextSaldo <= 0) continue;

        // ── PROTECCIÓN C: Anti-duplicado de excedente ──
        const { data: excDup } = await supabase
          .from("pagos")
          .select("id")
          .eq("cliente_id", cliente_id)
          .eq("mes_servicio_id", nextMes.id)
          .like("notas", `${notaExcedente}%`)
          .limit(1);

        if (excDup && excDup.length > 0) {
          // Ya se aplicó excedente a este mes en una ejecución anterior – saltar
          const applyAmount = Math.min(remaining, nextSaldo);
          remaining -= applyAmount;
          continue;
        }

        const applyAmount = Math.min(remaining, nextSaldo);

        const { error: surplusPayErr } = await supabase.from("pagos").insert({
          cliente_id,
          mes_servicio_id: nextMes.id,
          monto: applyAmount,
          metodo_pago,
          numero_recibo: null,
          fecha_transferencia: null,
          notas: notaExcedente,
          fecha_pago_real,
        });
        if (surplusPayErr) throw surplusPayErr;

        const nextNewPagado = Number(nextMes.total_pagado) + applyAmount;
        const nextNewSaldo = Math.max(0, nextSaldo - applyAmount);
        const nextNewEstado = nextNewSaldo <= 0 ? "pagado" : "pendiente";

        const { error: nextUpdateErr } = await supabase
          .from("meses_servicio")
          .update({
            total_pagado: nextNewPagado,
            saldo_pendiente: nextNewSaldo,
            estado_mes: nextNewEstado,
          })
          .eq("id", nextMes.id);
        if (nextUpdateErr) throw nextUpdateErr;

        excedente_aplicado += applyAmount;
        remaining -= applyAmount;
      }

      // *** SALDO A FAVOR ***
      if (remaining > 0) {
        const { data: clienteData, error: clienteErr } = await supabase
          .from("clientes")
          .select("saldo_a_favor")
          .eq("id", cliente_id)
          .single();

        if (clienteErr) throw new Error("No se pudo obtener el saldo_a_favor del cliente: " + clienteErr.message);

        const saldoActual = Number(clienteData.saldo_a_favor ?? 0);
        const nuevoSaldoAFavor = Math.round((saldoActual + remaining) * 100) / 100;

        const { error: updateSaldoErr } = await supabase
          .from("clientes")
          .update({ saldo_a_favor: nuevoSaldoAFavor })
          .eq("id", cliente_id);

        if (updateSaldoErr) throw new Error("No se pudo guardar el saldo_a_favor: " + updateSaldoErr.message);

        console.log(
          `[registrar-pago] Excedente $${remaining} guardado como saldo_a_favor. ` +
          `Cliente: ${cliente_id}. Nuevo saldo_a_favor: $${nuevoSaldoAFavor}`
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        pago_aplicado: amountForThisMonth,
        excedente_aplicado,
        excedente_guardado_como_saldo_a_favor: remaining > 0 ? Math.round(remaining * 100) / 100 : 0,
        saldo_restante: newSaldo,
        estado: newEstado,
        mensaje: remaining > 0
          ? `$${remaining.toLocaleString("es-AR")} guardados como saldo a favor. Se aplicarán automáticamente al crear el próximo plan anual.`
          : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('[registrar-pago]', error);
    return new Response(
      JSON.stringify({ error: error.message || "No se pudo procesar el pago. Intente nuevamente." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getMesName(mes: number): string {
  const names = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return names[mes - 1] || `Mes ${mes}`;
}
