import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useNavigate } from "react-router-dom";
import { Download, Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as XLSX from "xlsx";

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MONTH_FULL = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const PAGE_SIZE = 50;

export default function Reportes() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [year, setYear] = useState(currentYear);
  const [deudorSearch, setDeudorSearch] = useState("");

  // Date cutoff filter for debt
  const [corteAnio, setCorteAnio] = useState(currentYear);
  const [corteMes, setCorteMes] = useState(currentMonth);

  // Pagination for historial
  const [histPage, setHistPage] = useState(1);

  // Historial filter
  const [historialFiltro, setHistorialFiltro] = useState<"general" | "ingresos" | "gastos">("general");

  const { data: clientes } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: mesesYear } = useQuery({
    queryKey: ["meses_servicio_all", year],
    queryFn: async () => {
      const { data, error } = await supabase.from("meses_servicio").select("*").eq("anio", year);
      if (error) throw error;
      return data;
    },
  });

  const { data: allMeses } = useQuery({
    queryKey: ["meses_servicio_all_years"],
    queryFn: async () => {
      const { data, error } = await supabase.from("meses_servicio").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Historial: paginated query for ALL pagos (no year filter)
  const { data: historialPagos, isLoading: pagosLoading } = useQuery({
    queryKey: ["pagos_historial", histPage],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagos")
        .select("*, meses_servicio!inner(anio, mes)")
        .order("fecha_pago_real", { ascending: false })
        .range(0, histPage * PAGE_SIZE - 1);
      if (error) throw error;
      return data as any[];
    },
  });

  // Historial: todos los gastos para el historial unificado
  const { data: historialGastos, isLoading: gastosLoading } = useQuery({
    queryKey: ["gastos_historial", histPage],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gastos")
        .select("*")
        .order("fecha_pago", { ascending: false })
        .range(0, histPage * PAGE_SIZE - 1);
      if (error) throw error;
      return data as any[];
    },
  });

  // Debtors: filtered by cutoff date
  const mesesHastaCorte = allMeses?.filter((m) => {
    if ((m as any).estado_servicio === "suspendido") return false;
    if (m.anio < corteAnio) return true;
    if (m.anio === corteAnio && m.mes <= corteMes) return true;
    return false;
  }) ?? [];

  const deudoresAll = clientes?.map((c) => {
    const mesesCliente = mesesHastaCorte.filter((m) => m.cliente_id === c.id);
    const deuda = mesesCliente.filter(m => Number(m.saldo_pendiente) > 0).reduce((s, m) => s + Number(m.saldo_pendiente), 0);
    const mesesPendientes = mesesCliente.filter(m => Number(m.saldo_pendiente) > 0);
    return {
      ...c,
      deuda,
      mesesPendientes,
      nombre_dueno: (c as any).nombre_dueno || "",
      numero_ramal: (c as any).numero_ramal || "",
      nombre_regante: (c as any).nombre_regante || "",
    };
  }).filter((c) => c.deuda > 0).sort((a, b) => b.deuda - a.deuda) ?? [];

  const deudores = deudoresAll.filter((d) => {
    if (!deudorSearch) return true;
    const q = deudorSearch.toLowerCase();
    return (
      `${d.nombre} ${d.apellido}`.toLowerCase().includes(q) ||
      d.nombre_dueno.toLowerCase().includes(q) ||
      d.numero_ramal.toLowerCase().includes(q) ||
      d.nombre_regante.toLowerCase().includes(q) ||
      d.dni.toLowerCase().includes(q)
    );
  });

  const monthlyGlobal = MONTH_NAMES.map((name, i) => {
    const mesNum = i + 1;
    const mesesMes = mesesYear?.filter((m) => m.mes === mesNum) ?? [];
    return {
      name,
      facturado: mesesMes.reduce((s, m) => s + Number(m.total_calculado), 0),
      cobrado: mesesMes.reduce((s, m) => s + Number(m.total_pagado), 0),
      pendiente: mesesMes.reduce((s, m) => s + Number(m.saldo_pendiente), 0),
    };
  });

  // Construir lista unificada de movimientos para el historial
  const movimientosUnificados = (() => {
    const ingresos = (historialPagos || []).map((p: any) => ({
      id: p.id,
      tipo: "ingreso" as const,
      fecha: p.fecha_pago_real,
      descripcion: (() => {
        const cliente = clientes?.find((c) => c.id === p.cliente_id);
        const mesInfo = p.meses_servicio;
        const nombreCliente = cliente ? `${cliente.nombre} ${cliente.apellido}` : "—";
        const mesPeriodo = mesInfo ? ` — ${MONTH_FULL[mesInfo.mes - 1]} ${mesInfo.anio}` : "";
        return nombreCliente + mesPeriodo;
      })(),
      monto: Number(p.monto),
      metodo_pago: p.metodo_pago,
      referencia: p.numero_recibo || (p.notas ? p.notas.slice(0, 40) : null) || "—",
      notas: p.notas || null,
      raw: p,
    }));

    const egresos = (historialGastos || []).map((g: any) => ({
      id: g.id,
      tipo: "gasto" as const,
      fecha: g.fecha_pago,
      descripcion: g.nombre_gasto,
      monto: Number(g.monto),
      metodo_pago: g.metodo_pago,
      referencia: g.numero_recibo || (g.pagado_por ? `Pagado por: ${g.pagado_por}` : "—"),
      notas: null,
      estado: g.estado,
      raw: g,
    }));

    type Movimiento = { id: any; tipo: "ingreso" | "gasto"; fecha: any; descripcion: string; monto: number; metodo_pago: any; referencia: any; notas: any; estado?: any; raw: any };
    let lista: Movimiento[] = [];
    if (historialFiltro === "general") lista = [...ingresos, ...egresos];
    else if (historialFiltro === "ingresos") lista = ingresos;
    else lista = egresos;

    return lista.sort((a, b) => {
      const da = new Date(a.fecha + "T12:00:00").getTime();
      const db = new Date(b.fecha + "T12:00:00").getTime();
      return db - da;
    });
  })();

  const histLoading = pagosLoading || gastosLoading;

  const exportDeudores = () => {
    const rows = deudores.map((d) => {
      const mesesClienteAll = mesesHastaCorte.filter((m) => m.cliente_id === d.id);
      const mesesDeudaOrdenados = d.mesesPendientes
        .slice()
        .sort((a: any, b: any) => a.anio !== b.anio ? a.anio - b.anio : a.mes - b.mes);

      const mesesPagados = mesesClienteAll
        .filter((m) => m.estado_mes === "pagado")
        .sort((a, b) => a.anio !== b.anio ? b.anio - a.anio : b.mes - a.mes);
      const ultimoMesPagado = mesesPagados.length > 0
        ? `${MONTH_FULL[mesesPagados[0].mes - 1]} ${mesesPagados[0].anio}`
        : "Sin pagos registrados";

      const detalleMeses = mesesDeudaOrdenados
        .map((m: any) => `${MONTH_FULL[m.mes - 1]} ${m.anio} ($${Number(m.saldo_pendiente).toLocaleString("es-AR")})`)
        .join(" | ");

      return {
        "Titular de Riego": `${d.nombre} ${d.apellido}`,
        "Nombre Dueño": d.nombre_dueno || "—",
        "Nº Ramal": d.numero_ramal || "—",
        "Regante": d.nombre_regante || "—",
        "DNI": d.dni,
        "Último Mes Pagado": ultimoMesPagado,
        "Cant. Meses Adeudados": mesesDeudaOrdenados.length,
        "Meses que Debe (con monto)": detalleMeses || "—",
        "Deuda Total ($)": d.deuda,
      };
    });

    if (rows.length === 0) {
      rows.push({
        "Titular de Riego": "Sin deudores",
        "Nombre Dueño": "—", "Nº Ramal": "—", "Regante": "—", "DNI": "—",
        "Último Mes Pagado": "—", "Cant. Meses Adeudados": 0,
        "Meses que Debe (con monto)": "—", "Deuda Total ($)": 0,
      });
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 28 }, { wch: 24 }, { wch: 12 }, { wch: 20 }, { wch: 12 },
      { wch: 22 }, { wch: 10 }, { wch: 80 }, { wch: 16 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Deudores");
    XLSX.writeFile(wb, `reporte_deudores_hasta_${MONTH_FULL[corteMes - 1]}_${corteAnio}.xlsx`);
  };

  const exportGlobal = () => {
    const ws = XLSX.utils.json_to_sheet(monthlyGlobal.map(m => ({
      Mes: m.name,
      Facturado: m.facturado,
      Cobrado: m.cobrado,
      Pendiente: m.pendiente,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte Mensual");
    XLSX.writeFile(wb, `reporte_mensual_${year}.xlsx`);
  };

  const totalDeudaCorte = deudoresAll.reduce((s, d) => s + d.deuda, 0);
  const availableYears = [...new Set(allMeses?.map((m) => m.anio) ?? [currentYear])].sort();
  const hasMoreHist = (historialPagos?.length ?? 0) >= histPage * PAGE_SIZE || (historialGastos?.length ?? 0) >= histPage * PAGE_SIZE;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <SidebarTrigger />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Reportes</h1>
          <p className="text-sm text-muted-foreground">📊 Análisis financiero — Riego Miraflores</p>
        </div>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: (currentYear + 4) - 2025 + 1 }, (_, i) => currentYear + 4 - i)
              .filter(y => y >= 2025)
              .map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))
            }
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="mensual" className="space-y-4">
        <TabsList>
          <TabsTrigger value="mensual">📈 Reporte Mensual</TabsTrigger>
          <TabsTrigger value="deudores">⚠️ Deudores</TabsTrigger>
          <TabsTrigger value="historial">📋 Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="mensual">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Facturación vs Cobro — {year}</CardTitle>
              <Button variant="outline" size="sm" onClick={exportGlobal}>
                <Download className="h-4 w-4 mr-2" /> Excel
              </Button>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyGlobal}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="facturado" fill="hsl(217, 91%, 50%)" radius={[4, 4, 0, 0]} name="Facturado" />
                    <Bar dataKey="cobrado" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} name="Cobrado" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deudores">
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex flex-row items-center justify-between gap-3">
                <CardTitle className="text-base">⚠️ Deuda Histórica</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar por nombre, DNI, ramal..." value={deudorSearch} onChange={(e) => setDeudorSearch(e.target.value)} className="pl-8 w-[260px]" />
                  </div>
                  <Button variant="outline" size="sm" onClick={exportDeudores}>
                    <Download className="h-4 w-4 mr-2" /> Excel
                  </Button>
                </div>
              </div>
              {/* Date cutoff selector */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
                <Label className="text-sm font-medium whitespace-nowrap">📅 Mostrar deuda hasta:</Label>
                <Select value={String(corteMes)} onValueChange={(v) => setCorteMes(Number(v))}>
                  <SelectTrigger className="w-[140px] h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_FULL.map((m, i) => (
                      <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(corteAnio)} onValueChange={(v) => setCorteAnio(Number(v))}>
                  <SelectTrigger className="w-[100px] h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[...availableYears, currentYear + 1].filter((v, i, a) => a.indexOf(v) === i).sort().map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Badge variant="outline" className="text-xs ml-auto">
                  Deuda total: <strong className="ml-1">${totalDeudaCorte.toLocaleString()}</strong>
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {deudores.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Titular de Riego</TableHead>
                      <TableHead>Dueño</TableHead>
                      <TableHead>Nº Ramal</TableHead>
                      <TableHead>Regante</TableHead>
                      <TableHead>Meses Pend.</TableHead>
                      <TableHead className="text-right">Deuda Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deudores.map((d) => (
                      <TableRow key={d.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/clientes/${d.id}`)}>
                        <TableCell className="font-medium">{d.nombre} {d.apellido}</TableCell>
                        <TableCell className="text-sm">{d.nombre_dueno || "—"}</TableCell>
                        <TableCell className="text-sm">{d.numero_ramal || "—"}</TableCell>
                        <TableCell className="text-sm">{d.nombre_regante || "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {d.mesesPendientes.map(m => (
                              <Badge key={m.id} variant="outline" className="text-[10px]">{MONTH_NAMES[m.mes - 1]} {m.anio}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="destructive">${d.deuda.toLocaleString()}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">🎉 No hay deudores hasta {MONTH_FULL[corteMes - 1]} {corteAnio}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historial">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <CardTitle className="text-base">📋 Historial de Movimientos</CardTitle>
                <div className="flex rounded-lg border overflow-hidden text-sm">
                  <button
                    onClick={() => setHistorialFiltro("general")}
                    className={`px-4 py-1.5 font-medium transition-colors ${historialFiltro === "general" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                  >
                    General
                  </button>
                  <button
                    onClick={() => setHistorialFiltro("ingresos")}
                    className={`px-4 py-1.5 font-medium transition-colors border-l ${historialFiltro === "ingresos" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                  >
                    💚 Ingresos
                  </button>
                  <button
                    onClick={() => setHistorialFiltro("gastos")}
                    className={`px-4 py-1.5 font-medium transition-colors border-l ${historialFiltro === "gastos" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                  >
                    🔴 Gastos
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {movimientosUnificados.length > 0 ? (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead>Método</TableHead>
                        <TableHead>Referencia</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movimientosUnificados.map((mov) => (
                        <TableRow key={`${mov.tipo}-${mov.id}`}>
                          <TableCell className="text-sm whitespace-nowrap">
                            {new Date(mov.fecha + "T12:00:00").toLocaleDateString("es-AR", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </TableCell>
                          <TableCell>
                            {mov.tipo === "ingreso" ? (
                              <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]">
                                💚 Ingreso
                              </Badge>
                            ) : (
                              <Badge variant="outline" className={`text-[10px] ${(mov as any).estado === "anulado" ? "opacity-40" : "border-destructive/40 text-destructive"}`}>
                                🔴 Gasto{(mov as any).estado === "anulado" ? " (Anulado)" : ""}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm font-medium max-w-[240px] truncate">
                            {mov.descripcion}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {mov.metodo_pago === "efectivo" ? "💵 Efectivo" : "🏦 Transfer."}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">
                            {mov.referencia}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            <span className={mov.tipo === "ingreso" ? "text-emerald-600" : "text-destructive"}>
                              {mov.tipo === "ingreso" ? "+" : "-"}${mov.monto.toLocaleString("es-AR")}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {hasMoreHist && (
                    <div className="flex justify-center mt-4">
                      <Button variant="outline" onClick={() => setHistPage(p => p + 1)} disabled={histLoading}>
                        {histLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Cargar más
                      </Button>
                    </div>
                  )}
                </>
              ) : histLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  {historialFiltro === "general" ? "No hay movimientos registrados" :
                   historialFiltro === "ingresos" ? "No hay ingresos registrados" :
                   "No hay gastos registrados"}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}