import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useNavigate } from "react-router-dom";

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default function Reportes() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

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

  // Debtors
  const deudores = clientes?.map((c) => {
    const mesesCliente = meses?.filter((m) => m.cliente_id === c.id) ?? [];
    const deuda = mesesCliente.reduce((s, m) => s + Number(m.saldo_pendiente), 0);
    const total = mesesCliente.reduce((s, m) => s + Number(m.total_calculado), 0);
    return { ...c, deuda, total };
  }).filter((c) => c.deuda > 0).sort((a, b) => b.deuda - a.deuda) ?? [];

  // Monthly global data
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
            <CardHeader>
              <CardTitle className="text-base">Facturación vs Cobro — {year}</CardTitle>
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
            <CardHeader>
              <CardTitle className="text-base">⚠️ Clientes con Deuda — {year}</CardTitle>
            </CardHeader>
            <CardContent>
              {deudores.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>DNI</TableHead>
                      <TableHead className="text-right">Total Año</TableHead>
                      <TableHead className="text-right">Deuda</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deudores.map((d) => (
                      <TableRow key={d.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/clientes/${d.id}`)}>
                        <TableCell className="font-medium">{d.nombre} {d.apellido}</TableCell>
                        <TableCell>{d.dni}</TableCell>
                        <TableCell className="text-right">${d.total.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="destructive">${d.deuda.toLocaleString()}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">🎉 No hay deudores en {year}</p>
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
