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

    // UUID validation
    if (!mes_servicio_id || !UUID_REGEX.test(String(mes_servicio_id))) throw new Error("mes_servicio_id inválido");
    if (!cliente_id || !UUID_REGEX.test(String(cliente_id))) throw new Error("cliente_id inválido");

    // Monto validation
    if (typeof monto !== "number" || !Number.isFinite(monto) || monto <= 0 || monto > MAX_MONTO) {
      throw new Error("El monto debe ser un número positivo válido (máx 100.000.000)");
    }

    // Metodo pago validation
    if (!["efectivo", "transferencia"].includes(metodo_pago)) throw new Error("Método de pago inválido");

    // fecha_pago_real validation (REQUIRED)
    if (!fecha_pago_real || !DATE_REGEX.test(String(fecha_pago_real))) {
      throw new Error("fecha_pago_real es obligatoria (formato YYYY-MM-DD)");
    }
    // Validate not future date
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const fechaReal = new Date(fecha_pago_real + "T12:00:00");
    if (fechaReal > today) throw new Error("La fecha de pago no puede ser futura");

    // Conditional validations
    const safeRecibo = sanitizeString(numero_recibo, 50);
    if (metodo_pago === "efectivo" && !safeRecibo) throw new Error("Número de recibo requerido para pago en efectivo");
    if (metodo_pago === "transferencia") {
      if (!fecha_transferencia || !DATE_REGEX.test(String(fecha_transferencia))) {
        throw new Error("Fecha de transferencia requerida y debe tener formato YYYY-MM-DD");
      }
    }

    const safeNotas = sanitizeString(notas);

    // Get current month
    const { data: mes, error: mesError } = await supabase
      .from("meses_servicio")
      .select("*")
      .eq("id", mes_servicio_id)
      .single();

    if (mesError || !mes) throw new Error("Mes de servicio no encontrado");

    // Verify cliente_id matches the mes
    if (mes.cliente_id !== cliente_id) throw new Error("El cliente no corresponde al mes de servicio");

    let remaining = monto;
    let excedente_aplicado = 0;
    const currentSaldo = Number(mes.saldo_pendiente);

    // Apply payment to current month
    const amountForThisMonth = Math.min(remaining, currentSaldo);
    const newTotalPagado = Number(mes.total_pagado) + amountForThisMonth;
    const newSaldo = Math.max(0, currentSaldo - remaining);
    const newEstado = newSaldo <= 0 ? "pagado" : "pendiente";

    // Insert payment record for current month WITH fecha_pago_real
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

    // Update current month
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

    // Handle surplus — apply to next pending months
    if (remaining > 0) {
      const { data: nextMeses, error: nextError } = await supabase
        .from("meses_servicio")
        .select("*")
        .eq("cliente_id", cliente_id)
        .eq("anio", mes.anio)
        .gt("mes", mes.mes)
        .eq("estado_mes", "pendiente")
        .order("mes", { ascending: true });

      if (nextError) throw nextError;

      for (const nextMes of (nextMeses || [])) {
        if (remaining <= 0) break;

        const nextSaldo = Number(nextMes.saldo_pendiente);
        const applyAmount = Math.min(remaining, nextSaldo);

        const { error: surplusPayErr } = await supabase.from("pagos").insert({
          cliente_id,
          mes_servicio_id: nextMes.id,
          monto: applyAmount,
          metodo_pago,
          numero_recibo: null,
          fecha_transferencia: null,
          notas: `Excedente aplicado desde ${getMesName(mes.mes)}`,
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
    }

    return new Response(
      JSON.stringify({
        success: true,
        pago_aplicado: amountForThisMonth,
        excedente_aplicado,
        saldo_restante: newSaldo,
        estado: newEstado,
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
