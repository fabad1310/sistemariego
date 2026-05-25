import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MONTO = 100_000_000;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function getMesName(mes: number): string {
  const names = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  return names[mes - 1] || `Mes ${mes}`;
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
    const {
      pago_id,
      nuevo_monto,
      nueva_fecha_pago_real,
      nuevo_metodo_pago,
      nuevo_numero_recibo,
      nuevas_notas,
    } = body;

    if (!pago_id || !UUID_REGEX.test(String(pago_id))) throw new Error("pago_id inválido");
    if (
      typeof nuevo_monto !== "number" ||
      !Number.isFinite(nuevo_monto) ||
      nuevo_monto <= 0 ||
      nuevo_monto > MAX_MONTO
    ) {
      throw new Error("El monto debe ser un número positivo válido");
    }
    if (!nueva_fecha_pago_real || !DATE_REGEX.test(String(nueva_fecha_pago_real))) {
      throw new Error("Fecha de pago inválida (formato YYYY-MM-DD)");
    }
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const fechaReal = new Date(nueva_fecha_pago_real + "T12:00:00");
    if (fechaReal > today) throw new Error("La fecha de pago no puede ser futura");
    if (!["efectivo", "transferencia"].includes(nuevo_metodo_pago)) {
      throw new Error("Método de pago inválido");
    }

    // PASO 1: Obtener pago original
    const { data: pagoOriginal, error: pagoErr } = await supabase
      .from("pagos")
      .select("*")
      .eq("id", pago_id)
      .single();
    if (pagoErr || !pagoOriginal) throw new Error("Pago no encontrado");

    const esExcedente = pagoOriginal.notas?.startsWith("Excedente aplicado desde");
    if (esExcedente) {
      throw new Error(
        "Los pagos de excedente no pueden editarse directamente. Editá el pago original desde el mes donde se registró."
      );
    }

    const cliente_id = pagoOriginal.cliente_id;
    const mes_servicio_id_original = pagoOriginal.mes_servicio_id;
    const montoPagoOriginal = Number(pagoOriginal.monto);

    // PASO 2: mes original
    const { data: mesOriginal, error: mesErr } = await supabase
      .from("meses_servicio")
      .select("*")
      .eq("id", mes_servicio_id_original)
      .single();
    if (mesErr || !mesOriginal) throw new Error("Mes de servicio original no encontrado");

    const totalCalculadoMesOriginal = Number(mesOriginal.total_calculado);

    // PASO 3: todos los pagos del mes original
    const { data: todosPagosMes, error: pagosMesErr } = await supabase
      .from("pagos")
      .select("*")
      .eq("mes_servicio_id", mes_servicio_id_original);
    if (pagosMesErr) throw pagosMesErr;

    // PASO 4: excedentes generados desde este mes
    const mesNombre = getMesName(mesOriginal.mes);
    const notaExcedente = `Excedente aplicado desde ${mesNombre} ${mesOriginal.anio}`;
    const { data: excedentesGenerados, error: excErr } = await supabase
      .from("pagos")
      .select("*")
      .eq("cliente_id", cliente_id)
      .like("notas", `${notaExcedente}%`)
      .neq("mes_servicio_id", mes_servicio_id_original);
    if (excErr) throw excErr;

    // PASO 5: otros pagos del mes original (no este, no excedentes)
    const otrosPagosMes = (todosPagosMes || []).filter(
      (p: any) =>
        p.id !== pago_id && !(p.notas?.startsWith("Excedente aplicado desde"))
    );
    const sumOtrosPagosMes = otrosPagosMes.reduce(
      (acc: number, p: any) => acc + Number(p.monto),
      0
    );

    // PASO 5b: rollback de meses con excedente
    const mesesAfectadosIds = [
      ...new Set((excedentesGenerados || []).map((p: any) => p.mes_servicio_id as string)),
    ];
    for (const mesAfectadoId of mesesAfectadosIds) {
      const { data: mesAfectado } = await supabase
        .from("meses_servicio")
        .select("*")
        .eq("id", mesAfectadoId)
        .single();
      if (!mesAfectado) continue;

      const excedenteDeMes = (excedentesGenerados || []).filter(
        (p: any) => p.mes_servicio_id === mesAfectadoId
      );
      const montoExcedenteDeMes = excedenteDeMes.reduce(
        (acc: number, p: any) => acc + Number(p.monto),
        0
      );

      for (const excPago of excedenteDeMes) {
        await supabase.from("pagos").delete().eq("id", excPago.id);
      }

      const totalPagadoMesAfectado =
        Number(mesAfectado.total_pagado) - montoExcedenteDeMes;
      const nuevoSaldoMesAfectado = round2(
        Number(mesAfectado.total_calculado) - totalPagadoMesAfectado
      );
      const nuevoEstadoMesAfectado = nuevoSaldoMesAfectado <= 0 ? "pagado" : "pendiente";

      await supabase
        .from("meses_servicio")
        .update({
          total_pagado: Math.max(0, round2(totalPagadoMesAfectado)),
          saldo_pendiente: Math.max(0, nuevoSaldoMesAfectado),
          estado_mes: nuevoEstadoMesAfectado,
        })
        .eq("id", mesAfectadoId);
    }

    // PASO 6: revertir saldo_a_favor si lo había
    const montoTotalExcedentesAplicados = (excedentesGenerados || []).reduce(
      (acc: number, p: any) => acc + Number(p.monto),
      0
    );
    const montoCubreOriginalAntes = Math.min(
      montoPagoOriginal,
      Math.max(0, totalCalculadoMesOriginal - sumOtrosPagosMes)
    );
    const excedenteSaldoAFavor = round2(
      Math.max(
        0,
        montoPagoOriginal - montoCubreOriginalAntes - montoTotalExcedentesAplicados
      )
    );
    if (excedenteSaldoAFavor > 0) {
      const { data: clienteData } = await supabase
        .from("clientes")
        .select("saldo_a_favor")
        .eq("id", cliente_id)
        .single();
      if (clienteData) {
        const saldoActual = Number(clienteData.saldo_a_favor ?? 0);
        const nuevoSaldo = Math.max(0, round2(saldoActual - excedenteSaldoAFavor));
        await supabase
          .from("clientes")
          .update({ saldo_a_favor: nuevoSaldo })
          .eq("id", cliente_id);
      }
    }

    // PASO 7: actualizar pago original
    const safeRecibo = nuevo_numero_recibo
      ? String(nuevo_numero_recibo).trim().slice(0, 50)
      : null;
    if (nuevo_metodo_pago === "efectivo" && !safeRecibo) {
      throw new Error("Número de recibo requerido para pago en efectivo");
    }

    await supabase
      .from("pagos")
      .update({
        monto: nuevo_monto,
        metodo_pago: nuevo_metodo_pago,
        numero_recibo: nuevo_metodo_pago === "efectivo" ? safeRecibo : null,
        notas: nuevas_notas ? String(nuevas_notas).trim().slice(0, 500) : null,
        fecha_pago_real: nueva_fecha_pago_real,
      })
      .eq("id", pago_id);

    // PASO 8: recalcular mes original con nuevo monto
    const montoCubreOriginal = round2(
      Math.min(nuevo_monto, Math.max(0, totalCalculadoMesOriginal - sumOtrosPagosMes))
    );
    const nuevoTotalPagadoMesOriginal = round2(sumOtrosPagosMes + montoCubreOriginal);
    const nuevoSaldoMesOriginal = Math.max(
      0,
      round2(totalCalculadoMesOriginal - nuevoTotalPagadoMesOriginal)
    );
    const nuevoEstadoMesOriginal = nuevoSaldoMesOriginal <= 0 ? "pagado" : "pendiente";

    await supabase
      .from("meses_servicio")
      .update({
        total_pagado: nuevoTotalPagadoMesOriginal,
        saldo_pendiente: nuevoSaldoMesOriginal,
        estado_mes: nuevoEstadoMesOriginal,
      })
      .eq("id", mes_servicio_id_original);

    // PASO 9: re-aplicar excedente a meses siguientes
    let remaining = round2(nuevo_monto - montoCubreOriginal);
    let excedente_aplicado = 0;

    if (remaining > 0) {
      const { data: nextMeses } = await supabase
        .from("meses_servicio")
        .select("*")
        .eq("cliente_id", cliente_id)
        .eq("estado_mes", "pendiente")
        .neq("id", mes_servicio_id_original)
        .order("anio", { ascending: true })
        .order("mes", { ascending: true });

      const futureMonths = (nextMeses || []).filter((m: any) => {
        if (m.anio > mesOriginal.anio) return true;
        if (m.anio === mesOriginal.anio && m.mes > mesOriginal.mes) return true;
        return false;
      });

      for (const nextMes of futureMonths) {
        if (remaining <= 0) break;
        const nextSaldo = Number(nextMes.saldo_pendiente);
        if (nextSaldo <= 0) continue;

        const applyAmount = round2(Math.min(remaining, nextSaldo));

        await supabase.from("pagos").insert({
          cliente_id,
          mes_servicio_id: nextMes.id,
          monto: applyAmount,
          metodo_pago: nuevo_metodo_pago,
          numero_recibo: null,
          notas: `${notaExcedente} (editado)`,
          fecha_pago_real: nueva_fecha_pago_real,
        });

        const nextNewPagado = round2(Number(nextMes.total_pagado) + applyAmount);
        const nextNewSaldo = Math.max(0, round2(nextSaldo - applyAmount));
        const nextNewEstado = nextNewSaldo <= 0 ? "pagado" : "pendiente";

        await supabase
          .from("meses_servicio")
          .update({
            total_pagado: nextNewPagado,
            saldo_pendiente: nextNewSaldo,
            estado_mes: nextNewEstado,
          })
          .eq("id", nextMes.id);

        excedente_aplicado = round2(excedente_aplicado + applyAmount);
        remaining = round2(remaining - applyAmount);
      }

      if (remaining > 0) {
        const { data: clienteData } = await supabase
          .from("clientes")
          .select("saldo_a_favor")
          .eq("id", cliente_id)
          .single();
        if (clienteData) {
          const saldoActual = Number(clienteData.saldo_a_favor ?? 0);
          await supabase
            .from("clientes")
            .update({ saldo_a_favor: round2(saldoActual + remaining) })
            .eq("id", cliente_id);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        nuevo_saldo_mes_original: nuevoSaldoMesOriginal,
        excedente_reaplicado: excedente_aplicado,
        excedente_saldo_a_favor: remaining > 0 ? remaining : 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[editar-pago]", error);
    return new Response(
      JSON.stringify({ error: error.message || "No se pudo editar el pago." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
