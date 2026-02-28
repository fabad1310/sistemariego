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
import { ArrowLeft, Settings, CalendarDays, Pencil, ChevronRight, ChevronLeft } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const editClienteSchema = z.object({
  nombre: z.string().min(2, "Mínimo 2 caracteres"),
  apellido: z.string().min(2, "Mínimo 2 caracteres"),
  dni: z.string().min(5, "DNI inválido"),
  telefono: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  estado: z.enum(["activo", "inactivo"]),
  nombre_dueno: z.string().optional(),
  nombre_propiedad: z.string().optional(),
  nombre_regante: z.string().optional(),
});
type EditClienteForm = z.infer<typeof editClienteSchema>;

export default function ClienteDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [configOpen, setConfigOpen] = useState(false);
  const [editConfigOpen, setEditConfigOpen] = useState(false);
  const [editClienteOpen, setEditClienteOpen] = useState(false);

  // Config form: hourly rates + step control
  const [configStep, setConfigStep] = useState<1 | 2>(1);
  const [configForm, setConfigForm] = useState({
    valor_hora_precaria: "",
    valor_hora_empadronada: "",
  });
  // Quincenas data for all 12 months: { [mes]: { q1_precaria, q1_empadronada, q2_precaria, q2_empadronada } }
  const [quincenasForm, setQuincenasForm] = useState<Record<number, { q1_precaria: string; q1_empadronada: string; q2_precaria: string; q2_empadronada: string }>>(() => {
    const init: Record<number, any> = {};
    for (let i = 1; i <= 12; i++) init[i] = { q1_precaria: "", q1_empadronada: "", q2_precaria: "", q2_empadronada: "" };
    return init;
  });
  const [editConfigForm, setEditConfigForm] = useState({
    valor_hora_precaria: "",
    valor_hora_empadronada: "",
  });

  const editClienteForm = useForm<EditClienteForm>({
    resolver: zodResolver(editClienteSchema),
    defaultValues: { nombre: "", apellido: "", dni: "", telefono: "", email: "", estado: "activo", nombre_dueno: "", nombre_propiedad: "", nombre_regante: "" },
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

  const currentConfig = configs?.find((c) => c.anio === selectedYear);
  const hasSuspendedService = meses?.some((m) => (m as any).estado_servicio === "suspendido") ?? false;

  // Edit client mutation
  const editClienteMutation = useMutation({
    mutationFn: async (values: EditClienteForm) => {
      const { data: existing } = await supabase.from("clientes").select("id").eq("dni", values.dni).neq("id", id!).maybeSingle();
      if (existing) throw new Error("Ya existe otro cliente con ese DNI");
      const { error } = await supabase.from("clientes").update({
        nombre: values.nombre, apellido: values.apellido, dni: values.dni,
        telefono: values.telefono || null, email: values.email || null, estado: values.estado,
        nombre_dueno: values.nombre_dueno || null, nombre_propiedad: values.nombre_propiedad || null, nombre_regante: values.nombre_regante || null,
      } as any).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cliente", id] });
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      toast.success("Cliente actualizado ✅");
      setEditClienteOpen(false);
    },
    onError: (err: any) => toast.error(err.message || "Error al actualizar"),
  });


  const createPlanMutation = useMutation({
    mutationFn: async () => {
      const vhp = Number(configForm.valor_hora_precaria);
      const vhe = Number(configForm.valor_hora_empadronada);
      if (vhp < 0 || vhe < 0) throw new Error("Valores inválidos");
      if (vhp === 0 && vhe === 0) throw new Error("Debe ingresar al menos un valor por hora");

      const quincenas_data = Array.from({ length: 12 }, (_, i) => {
        const q = quincenasForm[i + 1];
        return {
          mes: i + 1,
          q1_precaria: Number(q.q1_precaria) || 0,
          q1_empadronada: Number(q.q1_empadronada) || 0,
          q2_precaria: Number(q.q2_precaria) || 0,
          q2_empadronada: Number(q.q2_empadronada) || 0,
        };
      });

      const res = await supabase.functions.invoke("crear-plan-anual", {
        body: { cliente_id: id, anio: selectedYear, valor_hora_precaria: vhp, valor_hora_empadronada: vhe, quincenas_data },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["configuraciones", id] });
      queryClient.invalidateQueries({ queryKey: ["meses_servicio", id, selectedYear] });
      toast.success("Plan anual creado con todos los meses y quincenas 🌱");
      setConfigOpen(false);
      setConfigStep(1);
      setConfigForm({ valor_hora_precaria: "", valor_hora_empadronada: "" });
      const init: Record<number, any> = {};
      for (let i = 1; i <= 12; i++) init[i] = { q1_precaria: "", q1_empadronada: "", q2_precaria: "", q2_empadronada: "" };
      setQuincenasForm(init);
    },
    onError: (err: any) => toast.error(err.message || "Error al crear plan anual"),
  });
  const editConfigMutation = useMutation({
    mutationFn: async () => {
      if (!currentConfig) throw new Error("No hay configuración para editar");
      const vhp = Number(editConfigForm.valor_hora_precaria);
      const vhe = Number(editConfigForm.valor_hora_empadronada);
      if (vhp < 0 || vhe < 0) throw new Error("Valores inválidos");

      const res = await supabase.functions.invoke("actualizar-configuracion", {
        body: { configuracion_id: currentConfig.id, valor_hora_precaria: vhp, valor_hora_empadronada: vhe },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["configuraciones", id] });
      queryClient.invalidateQueries({ queryKey: ["meses_servicio", id, selectedYear] });
      toast.success(`Configuración actualizada. ${data?.meses_actualizados ?? 0} meses pendientes recalculados ✅`);
      setEditConfigOpen(false);
    },
    onError: (err: any) => toast.error(err.message || "Error al actualizar configuración"),
  });

  const totalAnio = meses?.reduce((s, m) => s + Number(m.total_calculado), 0) ?? 0;
  const totalPagado = meses?.reduce((s, m) => s + Number(m.total_pagado), 0) ?? 0;
  const saldoPendiente = totalAnio - totalPagado;
  const progreso = totalAnio > 0 ? (totalPagado / totalAnio) * 100 : 0;
  const configExiste = configs?.some((c) => c.anio === selectedYear);

  const handleOpenEditCliente = () => {
    if (cliente) {
      editClienteForm.reset({
        nombre: cliente.nombre, apellido: cliente.apellido, dni: cliente.dni,
        telefono: cliente.telefono || "", email: cliente.email || "", estado: cliente.estado as "activo" | "inactivo",
        nombre_dueno: (cliente as any).nombre_dueno || "", nombre_propiedad: (cliente as any).nombre_propiedad || "",
        nombre_regante: (cliente as any).nombre_regante || "",
      });
    }
    setEditClienteOpen(true);
  };

  const handleOpenEditConfig = () => {
    if (currentConfig) {
      setEditConfigForm({
        valor_hora_precaria: String(currentConfig.valor_hora_discriminada),
        valor_hora_empadronada: String(currentConfig.valor_hora_no_discriminada),
      });
    }
    setEditConfigOpen(true);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <SidebarTrigger />
        <Button variant="ghost" size="icon" onClick={() => navigate("/clientes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{cliente ? `${cliente.nombre} ${cliente.apellido}` : "..."}</h1>
            <span className="text-xs text-muted-foreground">(Titular de Riego)</span>
            {hasSuspendedService && (
              <Badge variant="secondary" className="bg-muted-foreground/20 text-sm">⏸ Servicio Suspendido</Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {cliente && (
              <>
                DNI: {cliente.dni}
                <Badge variant={cliente.estado === "activo" ? "default" : "destructive"} className="ml-2 text-[10px]">
                  {cliente.estado === "activo" ? "🟢 Activo" : "🔴 Inactivo"}
                </Badge>
                {(cliente as any).nombre_propiedad && (
                  <span className="ml-2">🏡 {(cliente as any).nombre_propiedad}</span>
                )}
              </>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleOpenEditCliente}>
          <Pencil className="h-4 w-4 mr-2" /> Editar Cliente
        </Button>
      </div>

      {/* Edit Client Dialog */}
      <Dialog open={editClienteOpen} onOpenChange={setEditClienteOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>✏️ Editar Cliente</DialogTitle></DialogHeader>
          <Form {...editClienteForm}>
            <form onSubmit={editClienteForm.handleSubmit((v) => editClienteMutation.mutate(v))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editClienteForm.control} name="nombre" render={({ field }) => (
                  <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editClienteForm.control} name="apellido" render={({ field }) => (
                  <FormItem><FormLabel>Apellido</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={editClienteForm.control} name="dni" render={({ field }) => (
                <FormItem><FormLabel>DNI</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={editClienteForm.control} name="telefono" render={({ field }) => (
                <FormItem><FormLabel>Teléfono</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={editClienteForm.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={editClienteForm.control} name="estado" render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="activo">🟢 Activo</SelectItem>
                      <SelectItem value="inactivo">🔴 Inactivo</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <hr />
              <p className="text-sm font-medium text-muted-foreground">🌾 Datos de Riego</p>
              <FormField control={editClienteForm.control} name="nombre_dueno" render={({ field }) => (
                <FormItem><FormLabel>Nombre del Dueño</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={editClienteForm.control} name="nombre_propiedad" render={({ field }) => (
                <FormItem><FormLabel>Nombre de Propiedad</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={editClienteForm.control} name="nombre_regante" render={({ field }) => (
                <FormItem><FormLabel>Nombre del Regante</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <Button type="submit" className="w-full" disabled={editClienteMutation.isPending}>
                {editClienteMutation.isPending ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

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
          <Dialog open={configOpen} onOpenChange={(open) => { setConfigOpen(open); if (!open) setConfigStep(1); }}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Settings className="h-4 w-4 mr-2" /> Crear Plan Anual {selectedYear}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>
                  {configStep === 1 ? `⚙️ Paso 1: Tarifas por Hora — ${selectedYear}` : `📋 Paso 2: Minutos por Quincena — ${selectedYear}`}
                </DialogTitle>
              </DialogHeader>

              {configStep === 1 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Ingrese los valores por hora para cada tipo de riego.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>$/Hora Precaria</Label>
                      <Input type="number" min="0" step="0.01" placeholder="0.00" value={configForm.valor_hora_precaria} onChange={(e) => setConfigForm((p) => ({ ...p, valor_hora_precaria: e.target.value }))} />
                    </div>
                    <div>
                      <Label>$/Hora Empadronada</Label>
                      <Input type="number" min="0" step="0.01" placeholder="0.00" value={configForm.valor_hora_empadronada} onChange={(e) => setConfigForm((p) => ({ ...p, valor_hora_empadronada: e.target.value }))} />
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => {
                      const vhp = Number(configForm.valor_hora_precaria);
                      const vhe = Number(configForm.valor_hora_empadronada);
                      if (vhp === 0 && vhe === 0) { toast.error("Debe ingresar al menos un valor por hora"); return; }
                      if (vhp < 0 || vhe < 0) { toast.error("Los valores no pueden ser negativos"); return; }
                      setConfigStep(2);
                    }}
                  >
                    Continuar — Cargar Quincenas <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}

              {configStep === 2 && (() => {
                const vhp = Number(configForm.valor_hora_precaria) || 0;
                const vhe = Number(configForm.valor_hora_empadronada) || 0;
                let totalAnual = 0;

                return (
                  <div className="flex flex-col gap-3 overflow-hidden">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Button variant="ghost" size="sm" onClick={() => setConfigStep(1)}>
                        <ChevronLeft className="h-4 w-4 mr-1" /> Volver a Tarifas
                      </Button>
                      <span>💧 Precaria: ${vhp}/h | Empadronada: ${vhe}/h</span>
                    </div>
                    <ScrollArea className="flex-1 max-h-[55vh] pr-2">
                      <div className="space-y-3">
                        {MONTH_NAMES.map((name, i) => {
                          const mes = i + 1;
                          const q = quincenasForm[mes];
                          const totalMinP = (Number(q.q1_precaria) || 0) + (Number(q.q2_precaria) || 0);
                          const totalMinE = (Number(q.q1_empadronada) || 0) + (Number(q.q2_empadronada) || 0);
                          const horasP = totalMinP > 0 ? Math.ceil(totalMinP / 60) : 0;
                          const horasE = totalMinE > 0 ? Math.ceil(totalMinE / 60) : 0;
                          const totalMes = (horasP * vhp) + (horasE * vhe);
                          totalAnual += totalMes;

                          return (
                            <Card key={mes} className="border">
                              <CardContent className="p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-semibold text-sm">{name}</span>
                                  <span className="text-sm font-bold">${totalMes.toLocaleString()}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground">Quincena 1</p>
                                    <div className="grid grid-cols-2 gap-1">
                                      <div>
                                        <Label className="text-[10px]">Min. Precaria</Label>
                                        <Input type="number" min="0" step="1" placeholder="0" className="h-8 text-sm"
                                          value={q.q1_precaria}
                                          onChange={(e) => setQuincenasForm(prev => ({ ...prev, [mes]: { ...prev[mes], q1_precaria: e.target.value } }))}
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-[10px]">Min. Empadronada</Label>
                                        <Input type="number" min="0" step="1" placeholder="0" className="h-8 text-sm"
                                          value={q.q1_empadronada}
                                          onChange={(e) => setQuincenasForm(prev => ({ ...prev, [mes]: { ...prev[mes], q1_empadronada: e.target.value } }))}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground">Quincena 2</p>
                                    <div className="grid grid-cols-2 gap-1">
                                      <div>
                                        <Label className="text-[10px]">Min. Precaria</Label>
                                        <Input type="number" min="0" step="1" placeholder="0" className="h-8 text-sm"
                                          value={q.q2_precaria}
                                          onChange={(e) => setQuincenasForm(prev => ({ ...prev, [mes]: { ...prev[mes], q2_precaria: e.target.value } }))}
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-[10px]">Min. Empadronada</Label>
                                        <Input type="number" min="0" step="1" placeholder="0" className="h-8 text-sm"
                                          value={q.q2_empadronada}
                                          onChange={(e) => setQuincenasForm(prev => ({ ...prev, [mes]: { ...prev[mes], q2_empadronada: e.target.value } }))}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                {(totalMinP > 0 || totalMinE > 0) && (
                                  <div className="mt-2 text-[10px] text-muted-foreground bg-muted p-1.5 rounded">
                                    {totalMinP > 0 && <span>Precaria: {totalMinP}min → {horasP}h × ${vhp} = ${(horasP * vhp).toLocaleString()} | </span>}
                                    {totalMinE > 0 && <span>Empadronada: {totalMinE}min → {horasE}h × ${vhe} = ${(horasE * vhe).toLocaleString()}</span>}
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </ScrollArea>
                    <div className="border-t pt-3 flex items-center justify-between">
                      <div className="text-sm font-bold">Total Anual: <span className="text-primary">${totalAnual.toLocaleString()}</span></div>
                      <Button onClick={() => createPlanMutation.mutate()} disabled={createPlanMutation.isPending}>
                        {createPlanMutation.isPending ? "Guardando..." : "Guardar Plan Anual"}
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </DialogContent>
          </Dialog>
        )}

        {configExiste && (
          <Button variant="outline" onClick={handleOpenEditConfig}>
            <Pencil className="h-4 w-4 mr-2" /> Editar Configuración {selectedYear}
          </Button>
        )}
      </div>

      {/* Edit Config Dialog */}
      <Dialog open={editConfigOpen} onOpenChange={setEditConfigOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>✏️ Editar Configuración — {selectedYear}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-sm">
              ⚠️ Solo se recalcularán los meses con estado <strong>pendiente</strong>. Los meses ya pagados no se modificarán.
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>$/Hora Precaria</Label>
                <Input type="number" min="0" step="0.01" value={editConfigForm.valor_hora_precaria} onChange={(e) => setEditConfigForm((p) => ({ ...p, valor_hora_precaria: e.target.value }))} />
              </div>
              <div>
                <Label>$/Hora Empadronada</Label>
                <Input type="number" min="0" step="0.01" value={editConfigForm.valor_hora_empadronada} onChange={(e) => setEditConfigForm((p) => ({ ...p, valor_hora_empadronada: e.target.value }))} />
              </div>
            </div>
            <div className="text-sm bg-muted p-3 rounded-lg">
              💧 El sistema recalculará los meses pendientes usando los minutos ya cargados en las quincenas con los nuevos valores por hora.
            </div>
            <Button className="w-full" onClick={() => editConfigMutation.mutate()} disabled={editConfigMutation.isPending}>
              {editConfigMutation.isPending ? "Actualizando..." : "Actualizar Configuración"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

      {/* Config info */}
      {currentConfig && (
        <div className="mb-4 text-sm text-muted-foreground flex gap-4">
          <span>💧 Precaria: <strong>${Number(currentConfig.valor_hora_discriminada).toLocaleString()}/hora</strong></span>
          <span>💧 Empadronada: <strong>${Number(currentConfig.valor_hora_no_discriminada).toLocaleString()}/hora</strong></span>
        </div>
      )}

      {/* Monthly grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {meses?.map((m, i) => {
          const pagado = m.estado_mes === "pagado";
          const suspendido = (m as any).estado_servicio === "suspendido";
          return (
            <motion.div key={m.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}>
              <Card
                className={`cursor-pointer hover:shadow-md transition-all border-2 ${
                  suspendido ? "border-muted-foreground/30 bg-muted-foreground/10 opacity-60"
                    : pagado ? "border-success/40 bg-success/5"
                    : "border-destructive/20 bg-destructive/5"
                }`}
                onClick={() => navigate(`/clientes/${id}/mes/${m.id}`)}
              >
                <CardContent className="p-3 text-center">
                  <p className="text-xs font-medium text-muted-foreground">{MONTH_NAMES[m.mes - 1]}</p>
                  <p className="text-sm font-bold mt-1">
                    {suspendido ? "⏸" : pagado ? "🟢" : "🔴"}
                  </p>
                  <p className="text-xs mt-1">${Number(m.total_calculado).toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {suspendido ? "Suspendido" : `Pagado: $${Number(m.total_pagado).toLocaleString()}`}
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
