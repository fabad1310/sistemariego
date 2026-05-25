import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useReganteSesion } from "@/contexts/ReganteSesionContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Droplets, LogOut, Wallet } from "lucide-react";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function formatMoney(n: number) {
  return `$${Number(n || 0).toLocaleString("es-AR")}`;
}

function formatFechaAR(iso: string | null | undefined) {
  if (!iso) return "—";
  // Solo fecha (YYYY-MM-DD) o ISO
  const d = iso.length === 10 ? new Date(iso + "T12:00:00") : new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function MiCuenta() {
  const { clienteId, clienteNombre, clienteApellido, isReganteSesion, cerrarSesionRegante } = useReganteSesion();
  const navigate = useNavigate();
  const anioActual = new Date().getFullYear();

  useEffect(() => {
    if (!isReganteSesion) navigate("/login", { replace: true });
  }, [isReganteSesion, navigate]);

  if (!isReganteSesion || !clienteId) {
    return <Navigate to="/login" replace />;
  }

  const { data: cliente } = useQuery({
    queryKey: ["mi-cuenta-cliente", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").eq("id", clienteId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: configs } = useQuery({
    queryKey: ["mi-cuenta-configs", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracion_riego_cliente")
        .select("*")
        .eq("cliente_id", clienteId)
        .order("anio", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: meses } = useQuery({
    queryKey: ["mi-cuenta-meses", clienteId, anioActual],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meses_servicio")
        .select("*")
        .eq("cliente_id", clienteId)
        .eq("anio", anioActual)
        .order("mes");
      if (error) throw error;
      return data;
    },
  });

  const { data: pagos } = useQuery({
    queryKey: ["mi-cuenta-pagos", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagos")
        .select("*")
        .eq("cliente_id", clienteId)
        .order("fecha_pago_real", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const planActual = configs?.find((c: any) => c.anio === anioActual);
  const saldoAFavor = Number((cliente as any)?.saldo_a_favor ?? 0);

  const mesesById = new Map<string, any>((meses || []).map((m: any) => [m.id, m]));

  const handleLogout = () => {
    cerrarSesionRegante();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Droplets className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base sm:text-lg font-bold leading-tight truncate">
              Mi Cuenta — Riego Miraflores
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {clienteNombre} {clienteApellido}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {saldoAFavor > 0 && (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="p-4 flex items-center gap-3">
              <Wallet className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">Tenés saldo a favor</p>
                <p className="text-xs text-muted-foreground">
                  Se aplicará automáticamente a los próximos meses.
                </p>
              </div>
              <Badge variant="default" className="text-sm">{formatMoney(saldoAFavor)}</Badge>
            </CardContent>
          </Card>
        )}

        {/* Mis Datos */}
        <Card>
          <CardHeader><CardTitle className="text-base">👤 Mis Datos</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Nombre:</span> <strong>{cliente?.nombre} {cliente?.apellido}</strong></div>
            <div><span className="text-muted-foreground">DNI:</span> <strong>{cliente?.dni}</strong></div>
            <div><span className="text-muted-foreground">Teléfono:</span> <strong>{cliente?.telefono || "—"}</strong></div>
            <div><span className="text-muted-foreground">Email:</span> <strong>{cliente?.email || "—"}</strong></div>
            <div><span className="text-muted-foreground">N° de Ramal:</span> <strong>{(cliente as any)?.numero_ramal || "—"}</strong></div>
            <div>
              <span className="text-muted-foreground">Estado:</span>{" "}
              <Badge variant={cliente?.estado === "activo" ? "default" : "destructive"} className="text-[10px]">
                {cliente?.estado === "activo" ? "🟢 Activo" : "🔴 Inactivo"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Mi Plan de Riego */}
        <Card>
          <CardHeader><CardTitle className="text-base">🌾 Mi Plan de Riego ({anioActual})</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {planActual ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Horas totales/mes:</span> <strong>{planActual.horas_totales_mes}</strong></div>
                <div><span className="text-muted-foreground">Horas precarias:</span> <strong>{planActual.horas_discriminadas}</strong></div>
                <div><span className="text-muted-foreground">Horas empadronadas:</span> <strong>{planActual.horas_no_discriminadas}</strong></div>
                <div><span className="text-muted-foreground">Valor/hora precaria:</span> <strong>{formatMoney(Number(planActual.valor_hora_discriminada))}</strong></div>
                <div><span className="text-muted-foreground">Valor/hora empadronada:</span> <strong>{formatMoney(Number(planActual.valor_hora_no_discriminada))}</strong></div>
              </div>
            ) : (
              <p className="text-muted-foreground">No hay plan de riego configurado para este año.</p>
            )}
          </CardContent>
        </Card>

        {/* Estado de Pagos */}
        <Card>
          <CardHeader><CardTitle className="text-base">📅 Estado de Pagos {anioActual}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {meses && meses.length > 0 ? (
              meses.map((m: any) => {
                const pagado = m.estado_mes === "pagado";
                return (
                  <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border">
                    <div>
                      <p className="font-medium">{MONTHS[m.mes - 1]}</p>
                      <p className="text-xs text-muted-foreground">
                        Total: {formatMoney(Number(m.total_calculado))} · Pagado: {formatMoney(Number(m.total_pagado))}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge variant={pagado ? "default" : "secondary"} className={pagado ? "bg-green-600 hover:bg-green-600 text-white" : "bg-yellow-500 hover:bg-yellow-500 text-white"}>
                        {pagado ? "Pagado" : "Pendiente"}
                      </Badge>
                      {!pagado && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Saldo: {formatMoney(Number(m.saldo_pendiente))}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">No hay meses cargados para este año.</p>
            )}
          </CardContent>
        </Card>

        {/* Historial de Pagos */}
        <Card>
          <CardHeader><CardTitle className="text-base">💳 Historial de Pagos</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {pagos && pagos.length > 0 ? (
              pagos.map((p: any) => {
                const mes = mesesById.get(p.mes_servicio_id);
                const mesLabel = mes ? `${MONTHS[mes.mes - 1]} ${mes.anio}` : "—";
                return (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{formatMoney(Number(p.monto))} · {p.metodo_pago}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFechaAR(p.fecha_pago_real)} · {mesLabel}
                        {p.numero_recibo ? ` · Recibo ${p.numero_recibo}` : ""}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">Aún no hay pagos registrados.</p>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground py-4">
          Vista de solo lectura. Si necesitás modificar algún dato, contactá a la administración.
        </p>
      </main>
    </div>
  );
}
