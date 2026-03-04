import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, AlertTriangle, TrendingUp, Banknote, Wallet, Settings2, Download } from "lucide-react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useNavigate } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import * as XLSX from "xlsx";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MONTHS_FULL = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const PIE_COLORS = ["hsl(217, 91%, 50%)", "hsl(187, 72%, 45%)", "hsl(142, 71%, 45%)", "hsl(38, 92%, 50%)"];

const cardVariant = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.4 } }),
};

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [cobradoFilter, setCobradoFilter] = useState("total");
  const [cobradoYear, setCobradoYear] = useState(currentYear);
  const [adminFeeOpen, setAdminFeeOpen] = useState(false);
  const [adminFeeValue, setAdminFeeValue] = useState("");

  // Date cutoff for debt
  const [corteAnio, setCorteAnio] = useState(currentYear);
  const [corteMes, setCorteMes] = useState(currentMonth);

  const { data: allMeses } = useQuery({
    queryKey: ["meses_servicio_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("meses_servicio").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: clientes } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: gastos } = useQuery({
    queryKey: ["gastos_dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gastos").select("monto, estado, fecha_pago").eq("estado", "confirmado");
      if (error) throw error;
      return data;
    },
  });

  const { data: configGlobal } = useQuery({
    queryKey: ["configuracion_global"],
    queryFn: async () => {
      const { data, error } = await supabase.from("configuracion_global").select("*");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: allPagos } = useQuery({
    queryKey: ["pagos_all_export"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("pagos").select("*").order("fecha_pago_real", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const montoAdmin = Number(configGlobal?.find((c: any) => c.clave === "monto_administrativo")?.valor ?? 0);

  const adminFeeMutation = useMutation({
    mutationFn: async () => {
      const val = Number(adminFeeValue);
      if (!Number.isFinite(val) || val < 0) throw new Error("Valor inválido");
      const res = await supabase.functions.invoke("actualizar-valores-globales", {
        body: { clave: "monto_administrativo", valor: val },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["configuracion_global"] });
      queryClient.invalidateQueries({ queryKey: ["meses_servicio_all"] });
      queryClient.invalidateQueries({ queryKey: ["meses_servicio"] });
      toast.success(`Monto administrativo actualizado. ${data?.meses_actualizados ?? 0} meses pendientes recalculados ✅`);
      setAdminFeeOpen(false);
    },
    onError: (err: any) => toast.error(err.message || "Error al actualizar"),
  });

  const clientesActivos = clientes?.filter((c) => c.estado === "activo").length ?? 0;

  // Debt calculated up to the selected cutoff
  const mesesHastaCorte = allMeses?.filter((m) => {
    if ((m as any).estado_servicio === "suspendido") return false;
    if (m.anio < corteAnio) return true;
    if (m.anio === corteAnio && m.mes <= corteMes) return true;
    return false;
  }) ?? [];

  const totalDeuda = mesesHastaCorte
    .filter((m) => Number(m.saldo_pendiente) > 0)
    .reduce((s, m) => s + Number(m.saldo_pendiente), 0);

  const totalCobradoGlobal = allMeses?.reduce((s, m) => s + Number(m.total_pagado), 0) ?? 0;

  const totalCobradoFiltered = (() => {
    if (cobradoFilter === "total") return totalCobradoGlobal;
    const mesNum = parseInt(cobradoFilter);
    return allMeses
      ?.filter((m) => m.anio === cobradoYear && m.mes === mesNum)
      .reduce((s, m) => s + Number(m.total_pagado), 0) ?? 0;
  })();

  const totalGastos = gastos?.reduce((s, g) => s + Number(g.monto), 0) ?? 0;
  const balanceCaja = totalCobradoGlobal - totalGastos;

  const clienteIdsConDeuda = new Set(
    mesesHastaCorte.filter((m) => Number(m.saldo_pendiente) > 0).map((m) => m.cliente_id)
  );
  const clientesConDeuda = clientes?.filter((c) => clienteIdsConDeuda.has(c.id)) ?? [];

  const clienteIdsSuspendidos = new Set(
    allMeses?.filter((m) => (m as any).estado_servicio === "suspendido").map((m) => m.cliente_id) ?? []
  );

  const mesesCurrentYear = allMeses?.filter((m) => m.anio === currentYear) ?? [];
  const monthlyData = MONTHS.map((name, i) => {
    const mesNum = i + 1;
    const mesesMes = mesesCurrentYear.filter((m) => m.mes === mesNum);
    return {
      name,
      facturado: mesesMes.reduce((s, m) => s + Number(m.total_calculado), 0),
      cobrado: mesesMes.reduce((s, m) => s + Number(m.total_pagado), 0),
    };
  });

  const pieData = [
    { name: "Cobrado", value: totalCobradoGlobal },
    { name: "Pendiente", value: totalDeuda },
  ];

  const availableYears = [...new Set(allMeses?.map((m) => m.anio) ?? [])].sort();

  const cobradoLabel = cobradoFilter === "total"
    ? "Total Cobrado"
    : `Cobrado ${MONTHS_FULL[parseInt(cobradoFilter) - 1]} ${cobradoYear}`;

  // Export full database to Excel with date cutoff
  const exportDatabase = () => {
    if (!clientes || !allMeses || !allPagos) {
      toast.error("Datos aún cargando...");
      return;
    }

    const mesesHastaExport = allMeses.filter((m) => {
      if (m.anio < corteAnio) return true;
      if (m.anio === corteAnio && m.mes <= corteMes) return true;
      return false;
    });

    const clientRows = clientes.map((c) => {
      const mesesCliente = mesesHastaExport.filter((m) => m.cliente_id === c.id);
      const totalPagadoHist = mesesCliente.reduce((s, m) => s + Number(m.total_pagado), 0);
      const mesesPagadosCount = mesesCliente.filter((m) => m.estado_mes === "pagado").length;
      const mesesImpagosLista = mesesCliente
        .filter((m) => m.estado_mes !== "pagado" && (m as any).estado_servicio !== "suspendido" && Number(m.saldo_pendiente) > 0)
        .sort((a, b) => a.anio !== b.anio ? a.anio - b.anio : a.mes - b.mes);
      const deudaTotal = mesesImpagosLista.reduce((s, m) => s + Number(m.saldo_pendiente), 0);

      const mesesPagadosLista = mesesCliente
        .filter((m) => m.estado_mes === "pagado")
        .sort((a, b) => a.anio !== b.anio ? b.anio - a.anio : b.mes - a.mes);
      const ultimoMesPagado = mesesPagadosLista.length > 0
        ? `${MONTHS_FULL[mesesPagadosLista[0].mes - 1]} ${mesesPagadosLista[0].anio}`
        : "Sin pagos";

      const detalleMesesDeuda = mesesImpagosLista
        .map((m) => `${MONTHS_FULL[m.mes - 1]} ${m.anio} ($${Number(m.saldo_pendiente).toLocaleString("es-AR")})`)
        .join(" | ");

      return {
        "Nombre": `${c.nombre} ${c.apellido}`,
        "DNI": c.dni,
        "Nº Ramal": (c as any).numero_ramal || "—",
        "Total Pagado Histórico ($)": totalPagadoHist,
        "Meses Pagados": mesesPagadosCount,
        "Cant. Meses Adeudados": mesesImpagosLista.length,
        "Último Mes Pagado": ultimoMesPagado,
        "Meses que Debe (con monto)": detalleMesesDeuda || "Al día",
        "Deuda Actual Total ($)": deudaTotal,
      };
    });

    const mesRows = mesesHastaExport.map((m) => {
      const cliente = clientes.find((c) => c.id === m.cliente_id);
      return {
        "Cliente": cliente ? `${cliente.nombre} ${cliente.apellido}` : "—",
        "DNI": cliente?.dni || "—",
        "Año": m.anio,
        "Mes": MONTHS_FULL[m.mes - 1],
        "Total Calculado": Number(m.total_calculado),
        "Total Pagado": Number(m.total_pagado),
        "Saldo Pendiente": Number(m.saldo_pendiente),
        "Estado": m.estado_mes,
        "Servicio": (m as any).estado_servicio,
        "Override": (m as any).usa_override ? "Sí" : "No",
      };
    });

    const pagoRows = allPagos.map((p) => {
      const cliente = clientes.find((c) => c.id === p.cliente_id);
      return {
        "Cliente": cliente ? `${cliente.nombre} ${cliente.apellido}` : "—",
        "Monto": Number(p.monto),
        "Método": p.metodo_pago,
        "Fecha Pago": (p as any).fecha_pago_real || "—",
        "Recibo": p.numero_recibo || "—",
        "Notas": p.notas || "—",
      };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clientRows), "Clientes");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mesRows), "Meses");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pagoRows), "Pagos");
    XLSX.writeFile(wb, `base_datos_riego_hasta_${MONTHS_FULL[corteMes - 1]}_${corteAnio}.xlsx`);
    toast.success("Base de datos exportada ✅");
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <SidebarTrigger />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">💧 Riego Miraflores — Resumen del sistema</p>
        </div>
        
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={exportDatabase}>
              <Download className="h-4 w-4 mr-2" /> Exportar Base de Datos
            </Button>
          )}

          {isAdmin && (
          <Dialog open={adminFeeOpen} onOpenChange={(open) => { setAdminFeeOpen(open); if (open) setAdminFeeValue(String(montoAdmin)); }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="h-4 w-4 mr-2" />
                Cobro Administrativo: ${montoAdmin.toLocaleString()}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>⚙️ Monto Cobro Administrativo Mensual</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Este monto se suma al total de cada mes pendiente de pago. Al cambiar el valor, se actualizarán <strong>todos los meses pendientes</strong> de todos los clientes.
                </p>
                <div>
                  <Label>Monto Administrativo ($)</Label>
                  <Input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={adminFeeValue}
                    onChange={(e) => setAdminFeeValue(e.target.value)}
                  />
                </div>
                <div className="p-3 rounded-lg bg-muted text-sm">
                  <p>💡 Valor actual: <strong>${montoAdmin.toLocaleString()}</strong></p>
                  <p>Nuevo valor: <strong>${(Number(adminFeeValue) || 0).toLocaleString()}</strong></p>
                </div>
                <Button className="w-full" onClick={() => adminFeeMutation.mutate()} disabled={adminFeeMutation.isPending}>
                  {adminFeeMutation.isPending ? "Actualizando..." : "Actualizar y Recalcular Meses Pendientes"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      {/* Date cutoff filter */}
      <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-muted/50 border">
        <Label className="text-sm font-medium whitespace-nowrap">📅 Deuda hasta:</Label>
        <Select value={String(corteMes)} onValueChange={(v) => setCorteMes(Number(v))}>
          <SelectTrigger className="w-[130px] h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MONTHS_FULL.map((m, i) => (
              <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(corteAnio)} onValueChange={(v) => setCorteAnio(Number(v))}>
          <SelectTrigger className="w-[90px] h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[...availableYears, currentYear + 1].filter((v, i, a) => a.indexOf(v) === i).sort().map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <motion.div custom={0} initial="hidden" animate="visible" variants={cardVariant}>
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Clientes Activos</CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">🌱 {clientesActivos}</div></CardContent>
          </Card>
        </motion.div>

        <motion.div custom={1} initial="hidden" animate="visible" variants={cardVariant}>
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Clientes con Deuda</CardTitle>
              <AlertTriangle className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">⚠️ {clientesConDeuda.length}</div></CardContent>
          </Card>
        </motion.div>

        <motion.div custom={2} initial="hidden" animate="visible" variants={cardVariant}>
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Deuda Clientes</CardTitle>
              <Banknote className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">🔴 ${totalDeuda.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">Hasta {MONTHS[corteMes - 1]} {corteAnio}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div custom={3} initial="hidden" animate="visible" variants={cardVariant}>
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{cobradoLabel}</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">💰 ${totalCobradoFiltered.toLocaleString()}</div>
              <div className="flex gap-1 mt-2">
                <Select value={cobradoFilter} onValueChange={setCobradoFilter}>
                  <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="total">Total</SelectItem>
                    {MONTHS_FULL.map((m, i) => (<SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>))}
                  </SelectContent>
                </Select>
                {cobradoFilter !== "total" && (
                  <Select value={String(cobradoYear)} onValueChange={(v) => setCobradoYear(Number(v))}>
                    <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {availableYears.map((y) => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div custom={4} initial="hidden" animate="visible" variants={cardVariant}>
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Balance de Caja</CardTitle>
              <Wallet className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{balanceCaja >= 0 ? "🟢" : "🔴"} ${balanceCaja.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">Ingresos totales - Gastos</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">📊 Facturación Mensual {currentYear}</CardTitle></CardHeader>
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
          <CardHeader><CardTitle className="text-base">💰 Distribución de Pagos</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {pieData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i]} />))}
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
            <CardTitle className="text-base">⚠️ Clientes con Deuda Pendiente (hasta {MONTHS[corteMes - 1]} {corteAnio})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {clientesConDeuda.slice(0, 10).map((c) => {
                const deuda = mesesHastaCorte
                  .filter((m) => m.cliente_id === c.id && Number(m.saldo_pendiente) > 0)
                  .reduce((s, m) => s + Number(m.saldo_pendiente), 0);
                const isSuspendido = clienteIdsSuspendidos.has(c.id);
                return (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors" onClick={() => navigate(`/clientes/${c.id}`)}>
                    <div>
                      <span className="font-medium">{c.nombre} {c.apellido}</span>
                      <span className="text-xs text-muted-foreground ml-2">DNI: {c.dni}</span>
                      {isSuspendido && (<Badge variant="secondary" className="ml-2 text-[10px] bg-muted-foreground/20">⏸ Suspendido</Badge>)}
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
