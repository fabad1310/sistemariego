import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Settings, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { SidebarTrigger } from "@/components/ui/sidebar";

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function ClienteDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [configOpen, setConfigOpen] = useState(false);
  const [configForm, setConfigForm] = useState({
    horas_discriminadas: "",
    horas_no_discriminadas: "",
    valor_hora_discriminada: "",
    valor_hora_no_discriminada: "",
  });

  const { data: cliente } = useQuery({
    queryKey: ["cliente", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: configs } = useQuery({
    queryKey: ["configuraciones", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("configuracion_riego_cliente").select("*").eq("cliente_id", id!).order("anio", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: meses } = useQuery({
    queryKey: ["meses_servicio", id, selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase.from("meses_servicio").select("*").eq("cliente_id", id!).eq("anio", selectedYear).order("mes");
      if (error) throw error;
      return data;
    },
  });

  const availableYears = [...new Set(configs?.map((c) => c.anio) ?? [])].sort((a, b) => b - a);
  if (availableYears.length === 0) availableYears.push(currentYear);

  const createConfigMutation = useMutation({
    mutationFn: async () => {
      const hd = Number(configForm.horas_discriminadas);
      const hnd = Number(configForm.horas_no_discriminadas);
      const vhd = Number(configForm.valor_hora_discriminada);
      const vhnd = Number(configForm.valor_hora_no_discriminada);

      if (hd <= 0 || hnd < 0 || vhd <= 0 || vhnd < 0) throw new Error("Valores inválidos");

      const res = await supabase.functions.invoke("crear-configuracion", {
        body: {
          cliente_id: id,
          anio: selectedYear,
          horas_discriminadas: hd,
          horas_no_discriminadas: hnd,
          valor_hora_discriminada: vhd,
          valor_hora_no_discriminada: vhnd,
        },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["configuraciones", id] });
      queryClient.invalidateQueries({ queryKey: ["meses_servicio", id, selectedYear] });
      toast.success("Configuración creada y 12 meses generados 🌱");
      setConfigOpen(false);
      setConfigForm({ horas_discriminadas: "", horas_no_discriminadas: "", valor_hora_discriminada: "", valor_hora_no_discriminada: "" });
    },
    onError: (err: any) => {
      toast.error(err.message || "Error al crear configuración");
    },
  });

  const totalAnio = meses?.reduce((s, m) => s + Number(m.total_calculado), 0) ?? 0;
  const totalPagado = meses?.reduce((s, m) => s + Number(m.total_pagado), 0) ?? 0;
  const saldoPendiente = totalAnio - totalPagado;
  const progreso = totalAnio > 0 ? (totalPagado / totalAnio) * 100 : 0;
  const configExiste = configs?.some((c) => c.anio === selectedYear);

  const htCalc = Number(configForm.horas_discriminadas || 0) + Number(configForm.horas_no_discriminadas || 0);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <SidebarTrigger />
        <Button variant="ghost" size="icon" onClick={() => navigate("/clientes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{cliente ? `${cliente.nombre} ${cliente.apellido}` : "..."}</h1>
          <p className="text-sm text-muted-foreground">
            {cliente && (
              <>
                DNI: {cliente.dni}
                <Badge variant={cliente.estado === "activo" ? "default" : "destructive"} className="ml-2 text-[10px]">
                  {cliente.estado === "activo" ? "🟢 Activo" : "🔴 Inactivo"}
                </Badge>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Year selector + config */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
          <SelectTrigger className="w-[140px]">
            <CalendarDays className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[currentYear + 1, currentYear, currentYear - 1, currentYear - 2].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!configExiste && (
          <Dialog open={configOpen} onOpenChange={setConfigOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Settings className="h-4 w-4 mr-2" /> Crear Configuración {selectedYear}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>⚙️ Configuración de Riego — {selectedYear}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Horas Discriminadas</Label>
                    <Input type="number" min="0" step="0.01" value={configForm.horas_discriminadas} onChange={(e) => setConfigForm((p) => ({ ...p, horas_discriminadas: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Horas No Discriminadas</Label>
                    <Input type="number" min="0" step="0.01" value={configForm.horas_no_discriminadas} onChange={(e) => setConfigForm((p) => ({ ...p, horas_no_discriminadas: e.target.value }))} />
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">Horas totales/mes: <strong>{htCalc}</strong></div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Valor/Hora Discriminada ($)</Label>
                    <Input type="number" min="0" step="0.01" value={configForm.valor_hora_discriminada} onChange={(e) => setConfigForm((p) => ({ ...p, valor_hora_discriminada: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Valor/Hora No Discriminada ($)</Label>
                    <Input type="number" min="0" step="0.01" value={configForm.valor_hora_no_discriminada} onChange={(e) => setConfigForm((p) => ({ ...p, valor_hora_no_discriminada: e.target.value }))} />
                  </div>
                </div>
                <div className="text-sm bg-muted p-3 rounded-lg">
                  💧 Total mensual estimado: <strong>${((Number(configForm.horas_discriminadas || 0) * Number(configForm.valor_hora_discriminada || 0)) + (Number(configForm.horas_no_discriminadas || 0) * Number(configForm.valor_hora_no_discriminada || 0))).toLocaleString()}</strong>
                </div>
                <Button className="w-full" onClick={() => createConfigMutation.mutate()} disabled={createConfigMutation.isPending}>
                  {createConfigMutation.isPending ? "Creando..." : "Crear Configuración y Generar Meses"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Year Summary */}
      {configExiste && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-4 text-center mb-3">
              <div>
                <p className="text-xs text-muted-foreground">Total Año</p>
                <p className="text-lg font-bold">${totalAnio.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pagado</p>
                <p className="text-lg font-bold text-success">${totalPagado.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pendiente</p>
                <p className="text-lg font-bold text-destructive">${saldoPendiente.toLocaleString()}</p>
              </div>
            </div>
            <Progress value={progreso} className="h-2" />
            <p className="text-xs text-muted-foreground text-center mt-1">{progreso.toFixed(0)}% cobrado</p>
          </CardContent>
        </Card>
      )}

      {/* Monthly grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {meses?.map((m, i) => {
          const pagado = m.estado_mes === "pagado";
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.03 }}
            >
              <Card
                className={`cursor-pointer hover:shadow-md transition-all border-2 ${pagado ? "border-success/40 bg-success/5" : "border-destructive/20 bg-destructive/5"}`}
                onClick={() => navigate(`/clientes/${id}/mes/${m.id}`)}
              >
                <CardContent className="p-3 text-center">
                  <p className="text-xs font-medium text-muted-foreground">{MONTH_NAMES[m.mes - 1]}</p>
                  <p className="text-sm font-bold mt-1">{pagado ? "🟢" : "🔴"}</p>
                  <p className="text-xs mt-1">${Number(m.total_calculado).toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Pagado: ${Number(m.total_pagado).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
        {(!meses || meses.length === 0) && configExiste && (
          <div className="col-span-full text-center py-8 text-muted-foreground">Generando meses...</div>
        )}
        {!configExiste && (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            No hay configuración para {selectedYear}. Crea una para generar los 12 meses.
          </div>
        )}
      </div>
    </div>
  );
}
