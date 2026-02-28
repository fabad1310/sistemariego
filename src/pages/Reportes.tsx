import { useState } from "react";
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
import { Download, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import * as XLSX from "xlsx";

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MONTH_FULL = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function Reportes() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [year, setYear] = useState(currentYear);
  const [deudorSearch, setDeudorSearch] = useState("");

  const { data: clientes } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: meses } = useQuery({
    queryKey: ["meses_servicio_all", year],
    queryFn: async () => {
      const { data, error } = await supabase.from("meses_servicio").select("*").eq("anio", year);
      if (error) throw error;
      return data;
    },
  });

  const { data: pagos } = useQuery({
    queryKey: ["pagos_all", year],
    queryFn: async () => {
      const { data, error } = await supabase.from("pagos").select("*").gte("fecha_registro", `${year}-01-01`).lte("fecha_registro", `${year}-12-31`);
      if (error) throw error;
      return data;
    },
  });

  // Debtors - only up to current month, active service
  const maxMonth = year === currentYear ? currentMonth : 12;
  const deudoresAll = clientes?.map((c) => {
    const mesesCliente = meses?.filter((m) =>
      m.cliente_id === c.id &&
      m.mes <= maxMonth &&
      (m as any).estado_servicio !== "suspendido"
    ) ?? [];
    const deuda = mesesCliente.filter(m => Number(m.saldo_pendiente) > 0).reduce((s, m) => s + Number(m.saldo_pendiente), 0);
    const mesesPendientes = mesesCliente.filter(m => Number(m.saldo_pendiente) > 0);
    return {
      ...c,
      deuda,
      mesesPendientes,
      nombre_dueno: (c as any).nombre_dueno || "",
      nombre_propiedad: (c as any).nombre_propiedad || "",
      nombre_regante: (c as any).nombre_regante || "",
    };
  }).filter((c) => c.deuda > 0).sort((a, b) => b.deuda - a.deuda) ?? [];

  // Filter deudores by search
  const deudores = deudoresAll.filter((d) => {
    if (!deudorSearch) return true;
    const q = deudorSearch.toLowerCase();
    return (
      `${d.nombre} ${d.apellido}`.toLowerCase().includes(q) ||
      d.nombre_dueno.toLowerCase().includes(q) ||
      d.nombre_propiedad.toLowerCase().includes(q) ||
      d.nombre_regante.toLowerCase().includes(q) ||
      d.dni.toLowerCase().includes(q)
    );
  });

  const monthlyGlobal = MONTH_NAMES.map((name, i) => {
    const mesNum = i + 1;
    const mesesMes = meses?.filter((m) => m.mes === mesNum) ?? [];
    return {
      name,
      facturado: mesesMes.reduce((s, m) => s + Number(m.total_calculado), 0),
      cobrado: mesesMes.reduce((s, m) => s + Number(m.total_pagado), 0),
      pendiente: mesesMes.reduce((s, m) => s + Number(m.saldo_pendiente), 0),
    };
  });

  // Export debtors to Excel - ONE ROW PER CLIENT, grouped
  const exportDeudores = () => {
    const rows = deudores.map((d) => ({
      "Titular Riego": `${d.nombre} ${d.apellido}`,
      "Nombre Dueño": d.nombre_dueno || "—",
      "Propiedad": d.nombre_propiedad || "—",
      "Regante": d.nombre_regante || "—",
      "Total Deuda": d.deuda,
      "Meses Adeudados": d.mesesPendientes.map((m) => `${MONTH_FULL[m.mes - 1]} ${m.anio}`).join(", "),
    }));

    if (rows.length === 0) {
      rows.push({ "Titular Riego": "Sin deudores", "Nombre Dueño": "", "Propiedad": "", "Regante": "", "Total Deuda": 0, "Meses Adeudados": "" });
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Deudores");
    XLSX.writeFile(wb, `reporte_deudores_${year}.xlsx`);
  };

  // Export global monthly report
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

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <SidebarTrigger />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Reportes</h1>
          <p className="text-sm text-muted-foreground">📊 Análisis financiero del sistema de riego</p>
        </div>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[currentYear + 1, currentYear, currentYear - 1, currentYear - 2].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
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
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">⚠️ Clientes con Deuda — {year} (hasta {MONTH_NAMES[maxMonth - 1]})</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar titular, dueño, propiedad..." value={deudorSearch} onChange={(e) => setDeudorSearch(e.target.value)} className="pl-8 w-[260px]" />
                </div>
                <Button variant="outline" size="sm" onClick={exportDeudores}>
                  <Download className="h-4 w-4 mr-2" /> Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {deudores.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Titular de Riego</TableHead>
                      <TableHead>Dueño</TableHead>
                      <TableHead>Propiedad</TableHead>
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
                        <TableCell className="text-sm">{d.nombre_propiedad || "—"}</TableCell>
                        <TableCell className="text-sm">{d.nombre_regante || "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {d.mesesPendientes.map(m => (
                              <Badge key={m.id} variant="outline" className="text-[10px]">{MONTH_NAMES[m.mes - 1]}</Badge>
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
                <p className="text-center text-muted-foreground py-8">🎉 No hay deudores en {year} (hasta {MONTH_NAMES[maxMonth - 1]})</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historial">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">📋 Historial de Pagos — {year}</CardTitle>
            </CardHeader>
            <CardContent>
              {pagos && pagos.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead>Recibo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagos.slice(0, 50).map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm">
                          {new Date(p.fecha_registro).toLocaleDateString("es-AR")}
                        </TableCell>
                        <TableCell className="font-medium">${Number(p.monto).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{p.metodo_pago === "efectivo" ? "💵 Efectivo" : "🏦 Transfer."}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{p.numero_recibo || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">No hay pagos registrados en {year}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
