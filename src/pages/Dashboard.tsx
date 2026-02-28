import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, AlertTriangle, TrendingUp, Banknote, Wallet } from "lucide-react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useNavigate } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const PIE_COLORS = ["hsl(217, 91%, 50%)", "hsl(187, 72%, 45%)", "hsl(142, 71%, 45%)", "hsl(38, 92%, 50%)"];

const cardVariant = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.4 } }),
};

export default function Dashboard() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const { data: clientes } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: meses } = useQuery({
    queryKey: ["meses_servicio", currentYear],
    queryFn: async () => {
      const { data, error } = await supabase.from("meses_servicio").select("*").eq("anio", currentYear);
      if (error) throw error;
      return data;
    },
  });

  // Fetch all confirmed gastos
  const { data: gastos } = useQuery({
    queryKey: ["gastos_dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gastos")
        .select("monto, estado, fecha_pago")
        .eq("estado", "confirmado");
      if (error) throw error;
      return data;
    },
  });

  const clientesActivos = clientes?.filter((c) => c.estado === "activo").length ?? 0;

  // Only months up to current, active service, with debt
  const mesesHastaActual = meses?.filter((m) => m.mes <= currentMonth && (m as any).estado_servicio !== "suspendido") ?? [];
  const totalCobrado = mesesHastaActual.reduce((s, m) => s + Number(m.total_pagado), 0);
  const totalDeuda = mesesHastaActual
    .filter((m) => Number(m.saldo_pendiente) > 0)
    .reduce((s, m) => s + Number(m.saldo_pendiente), 0);

  // Total gastos confirmados
  const totalGastos = gastos?.reduce((s, g) => s + Number(g.monto), 0) ?? 0;
  const balanceCaja = totalCobrado - totalGastos;

  const clienteIdsConDeuda = new Set(
    mesesHastaActual.filter((m) => Number(m.saldo_pendiente) > 0).map((m) => m.cliente_id)
  );
  const clientesConDeuda = clientes?.filter((c) => clienteIdsConDeuda.has(c.id)) ?? [];

  // Check which clients have any suspended month
  const clienteIdsSuspendidos = new Set(
    meses?.filter((m) => (m as any).estado_servicio === "suspendido").map((m) => m.cliente_id) ?? []
  );

  const monthlyData = MONTHS.map((name, i) => {
    const mesNum = i + 1;
    const mesesMes = meses?.filter((m) => m.mes === mesNum) ?? [];
    return {
      name,
      facturado: mesesMes.reduce((s, m) => s + Number(m.total_calculado), 0),
      cobrado: mesesMes.reduce((s, m) => s + Number(m.total_pagado), 0),
    };
  });

  const pieData = [
    { name: "Cobrado", value: totalCobrado },
    { name: "Pendiente", value: totalDeuda },
  ];

  const kpis = [
    { label: "Clientes Activos", value: clientesActivos, icon: Users, emoji: "🌱" },
    { label: "Clientes con Deuda", value: clientesConDeuda.length, icon: AlertTriangle, emoji: "⚠️" },
    { label: "Total Deuda Clientes", value: `$${totalDeuda.toLocaleString()}`, icon: Banknote, emoji: "🔴" },
    { label: "Total Cobrado", value: `$${totalCobrado.toLocaleString()}`, icon: TrendingUp, emoji: "💰" },
    { label: "Balance de Caja", value: `$${balanceCaja.toLocaleString()}`, icon: Wallet, emoji: balanceCaja >= 0 ? "🟢" : "🔴" },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <SidebarTrigger />
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">💧 Resumen del sistema de riego — {currentYear} (hasta {MONTHS[currentMonth - 1]})</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {kpis.map((kpi, i) => (
          <motion.div key={kpi.label} custom={i} initial="hidden" animate="visible" variants={cardVariant}>
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
                <kpi.icon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{kpi.emoji} {kpi.value}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">📊 Facturación Mensual {currentYear}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Bar dataKey="facturado" fill="hsl(217, 91%, 50%)" radius={[4, 4, 0, 0]} name="Facturado" />
                  <Bar dataKey="cobrado" fill="hsl(187, 72%, 45%)" radius={[4, 4, 0, 0]} name="Cobrado" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">💰 Distribución de Pagos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {clientesConDeuda.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">⚠️ Clientes con Deuda Pendiente (hasta {MONTHS[currentMonth - 1]} {currentYear})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {clientesConDeuda.slice(0, 10).map((c) => {
                const deuda = mesesHastaActual
                  .filter((m) => m.cliente_id === c.id && Number(m.saldo_pendiente) > 0)
                  .reduce((s, m) => s + Number(m.saldo_pendiente), 0);
                const isSuspendido = clienteIdsSuspendidos.has(c.id);
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                    onClick={() => navigate(`/clientes/${c.id}`)}
                  >
                    <div>
                      <span className="font-medium">{c.nombre} {c.apellido}</span>
                      <span className="text-xs text-muted-foreground ml-2">DNI: {c.dni}</span>
                      {isSuspendido && (
                        <Badge variant="secondary" className="ml-2 text-[10px] bg-muted-foreground/20">⏸ Suspendido</Badge>
                      )}
                    </div>
                    <Badge variant="destructive">${deuda.toLocaleString()}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
