import { useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Settings, CalendarDays, Pencil } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
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
  numero_ramal: z.string().optional(),
  nombre_regante: z.string().optional(),
});
type EditClienteForm = z.infer<typeof editClienteSchema>;

const defaultQuincenaFields = {
  q1_precaria: "", q1_empadronada: "", q2_precaria: "", q2_empadronada: "",
};

export default function ClienteDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const currentYear = new Date().getFullYear();
  
  // Preserve year from navigation state
  const initialYear = (location.state as any)?.selectedYear ?? currentYear;
  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [configOpen, setConfigOpen] = useState(false);
  const [editConfigOpen, setEditConfigOpen] = useState(false);
  const [editClienteOpen, setEditClienteOpen] = useState(false);

  const [selectedMonths, setSelectedMonths] = useState<number[]>([1,2,3,4,5,6,7,8,9,10,11,12]);

  const [configForm, setConfigForm] = useState({
    valor_hora_precaria: "", valor_hora_empadronada: "",
    ...defaultQuincenaFields,
  });
  const [editConfigForm, setEditConfigForm] = useState({
    valor_hora_precaria: "", valor_hora_empadronada: "",
    ...defaultQuincenaFields,
  });

  const editClienteForm = useForm<EditClienteForm>({
    resolver: zodResolver(editClienteSchema),
    defaultValues: { nombre: "", apellido: "", dni: "", telefono: "", email: "", estado: "activo", nombre_dueno: "", numero_ramal: "", nombre_regante: "" },
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

  const editClienteMutation = useMutation({
    mutationFn: async (values: EditClienteForm) => {
      const { error } = await supabase.from("clientes").update({
        nombre: values.nombre, apellido: values.apellido, dni: values.dni,
        telefono: values.telefono || null, email: values.email || null, estado: values.estado,
        nombre_dueno: values.nombre_dueno || null, numero_ramal: values.numero_ramal || null, nombre_regante: values.nombre_regante || null,
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
      if (selectedMonths.length === 0) throw new Error("Debe seleccionar al menos un mes");

      const res = await supabase.functions.invoke("crear-plan-anual", {
        body: {
          cliente_id: id, anio: selectedYear,
          valor_hora_precaria: vhp, valor_hora_empadronada: vhe,
          q1_precaria: Number(configForm.q1_precaria) || 0,
          q1_empadronada: Number(configForm.q1_empadronada) || 0,
          q2_precaria: Number(configForm.q2_precaria) || 0,
          q2_empadronada: Number(configForm.q2_empadronada) || 0,
          meses_seleccionados: selectedMonths,
        },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["configuraciones", id] });
      queryClient.invalidateQueries({ queryKey: ["meses_servicio", id, selectedYear] });
      const mensajePlan = data?.saldo_a_favor_aplicado > 0
        ? `Plan creado con ${data?.meses_creados} meses 🌱 — Se aplicaron $${data.saldo_a_favor_aplicado.toLocaleString("es-AR")} de saldo a favor ✅`
        : `Plan creado con ${data?.meses_creados} meses 🌱`;
      toast.success(mensajePlan);
      queryClient.invalidateQueries({ queryKey: ["cliente", id] });
      setConfigOpen(false);
      setConfigForm({ valor_hora_precaria: "", valor_hora_empadronada: "", ...defaultQuincenaFields });
      setSelectedMonths([1,2,3,4,5,6,7,8,9,10,11,12]);
    },
    onError: (err: any) => toast.error(err.message || "Error al crear plan"),
  });

  const editConfigMutation = useMutation({
    mutationFn: async () => {
      if (!currentConfig) throw new Error("No hay configuración para editar");
      const vhp = Number(editConfigForm.valor_hora_precaria);
      const vhe = Number(editConfigForm.valor_hora_empadronada);
      if (vhp < 0 || vhe < 0) throw new Error("Valores inválidos");

      const res = await supabase.functions.invoke("actualizar-configuracion", {
        body: {
          configuracion_id: currentConfig.id,
          valor_hora_precaria: vhp, valor_hora_empadronada: vhe,
          q1_precaria: Number(editConfigForm.q1_precaria) || 0,
          q1_empadronada: Number(editConfigForm.q1_empadronada) || 0,
          q2_precaria: Number(editConfigForm.q2_precaria) || 0,
          q2_empadronada: Number(editConfigForm.q2_empadronada) || 0,
        },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["configuraciones", id] });
      queryClient.invalidateQueries({ queryKey: ["meses_servicio", id, selectedYear] });
      toast.success(`Configuración actualizada. ${data?.meses_actualizados ?? 0} meses recalculados ✅`);
      setEditConfigOpen(false);
    },
    onError: (err: any) => toast.error(err.message || "Error al actualizar configuración"),
  });

  const totalAnio = meses?.reduce((s, m) => s + Number(m.total_calculado), 0) ?? 0;
  const totalPagado = meses?.reduce((s, m) => s + Number(m.total_pagado), 0) ?? 0;
  const saldoPendiente = totalAnio - totalPagado;
  const progreso = totalAnio > 0 ? (totalPagado / totalAnio) * 100 : 0;
  const configExiste = configs?.some((c) => c.anio === selectedYear);
  const existingMeses = new Set(meses?.map(m => m.mes) ?? []);

  const handleOpenEditCliente = () => {
    if (cliente) {
      editClienteForm.reset({
        nombre: cliente.nombre, apellido: cliente.apellido, dni: cliente.dni,
        telefono: cliente.telefono || "", email: cliente.email || "", estado: cliente.estado as "activo" | "inactivo",
        nombre_dueno: (cliente as any).nombre_dueno || "", numero_ramal: (cliente as any).numero_ramal || "",
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
        q1_precaria: "", q1_empadronada: "", q2_precaria: "", q2_empadronada: "",
      });
    }
    setEditConfigOpen(true);
  };

  const { data: configGlobal } = useQuery({
    queryKey: ["configuracion_global"],
    queryFn: async () => {
      const { data, error } = await supabase.from("configuracion_global").select("*");
      if (error) throw error;
      return data as any[];
    },
  });
  const montoAdmin = Number(configGlobal?.find((c: any) => c.clave === "monto_administrativo")?.valor ?? 0);

  const renderCalcPreview = (form: typeof configForm) => {
    const vhp = Number(form.valor_hora_precaria) || 0;
    const vhe = Number(form.valor_hora_empadronada) || 0;
    const q1p = Number(form.q1_precaria) || 0;
    const q1e = Number(form.q1_empadronada) || 0;
    const q2p = Number(form.q2_precaria) || 0;
    const q2e = Number(form.q2_empadronada) || 0;
    const totalMinP = q1p + q2p;
    const totalMinE = q1e + q2e;
    const horasP = totalMinP > 0 ? Math.ceil(totalMinP / 60) : 0;
    const horasE = totalMinE > 0 ? Math.ceil(totalMinE / 60) : 0;
    const totalRiego = (horasP * vhp) + (horasE * vhe);
    const montoAdminFinal = totalRiego > 0 ? montoAdmin : 0;
    const totalMes = totalRiego + montoAdminFinal;
    const totalAnual = totalMes * selectedMonths.length;

    if (totalMinP === 0 && totalMinE === 0 && montoAdminFinal === 0) return null;

    return (
      <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
        <p className="font-semibold text-xs text-muted-foreground">📊 Cálculo por mes ({selectedMonths.length} meses seleccionados):</p>
        {totalMinP > 0 && (
          <p>💧 Precaria: {q1p} + {q2p} = {totalMinP} min → <strong>{horasP}h</strong> × ${vhp.toLocaleString()} = <strong>${(horasP * vhp).toLocaleString()}</strong></p>
        )}
        {totalMinE > 0 && (
          <p>💧 Empadronada: {q1e} + {q2e} = {totalMinE} min → <strong>{horasE}h</strong> × ${vhe.toLocaleString()} = <strong>${(horasE * vhe).toLocaleString()}</strong></p>
        )}
        {montoAdminFinal > 0 && (
          <p>📋 Gestión Administrativa: <strong>${montoAdminFinal.toLocaleString()}</strong></p>
        )}
        {totalRiego === 0 && montoAdmin > 0 && (
          <p className="text-xs text-muted-foreground">📋 Admin fee: $0 (no se aplica porque el monto base es $0)</p>
        )}
        <hr className="border-border" />
        <p className="font-bold">Total por mes: ${totalMes.toLocaleString()} | Total período: ${totalAnual.toLocaleString()}</p>
      </div>
    );
  };

  const renderQuincenaInputs = (form: typeof configForm, setForm: typeof setConfigForm) => (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">📅 Quincena 1</p>
          <div>
            <Label className="text-xs">Minutos Precaria</Label>
            <Input type="number" min="0" step="1" placeholder="0"
              value={form.q1_precaria}
              onChange={(e) => setForm((p) => ({ ...p, q1_precaria: e.target.value }))}
            />
          </div>
          <div>
            <Label className="text-xs">Minutos Empadronada</Label>
            <Input type="number" min="0" step="1" placeholder="0"
              value={form.q1_empadronada}
              onChange={(e) => setForm((p) => ({ ...p, q1_empadronada: e.target.value }))}
            />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">📅 Quincena 2</p>
          <div>
            <Label className="text-xs">Minutos Precaria</Label>
            <Input type="number" min="0" step="1" placeholder="0"
              value={form.q2_precaria}
              onChange={(e) => setForm((p) => ({ ...p, q2_precaria: e.target.value }))}
            />
          </div>
          <div>
            <Label className="text-xs">Minutos Empadronada</Label>
            <Input type="number" min="0" step="1" placeholder="0"
              value={form.q2_empadronada}
              onChange={(e) => setForm((p) => ({ ...p, q2_empadronada: e.target.value }))}
            />
          </div>
        </div>
      </div>
    </>
  );

  const toggleMonth = (month: number) => {
    setSelectedMonths(prev =>
      prev.includes(month)
        ? prev.filter(m => m !== month)
        : [...prev, month].sort((a, b) => a - b)
    );
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
                {(cliente as any).numero_ramal && (
                  <span className="ml-2">🔢 Ramal: {(cliente as any).numero_ramal}</span>
                )}
              </>
            )}
          </div>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={handleOpenEditCliente}>
            <Pencil className="h-4 w-4 mr-2" /> Editar Cliente
          </Button>
        )}
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
              <FormField control={editClienteForm.control} name="numero_ramal" render={({ field }) => (
                <FormItem><FormLabel>Número de Ramal</FormLabel><FormControl><Input placeholder="Ej: R-15" {...field} /></FormControl><FormMessage /></FormItem>
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

        {isAdmin && (
        <Dialog open={configOpen} onOpenChange={(open) => {
          setConfigOpen(open);
          if (open) {
            const available = [1,2,3,4,5,6,7,8,9,10,11,12].filter(m => !existingMeses.has(m));
            setSelectedMonths(available);
          }
        }}>
          <DialogTrigger asChild>
            <Button variant="outline" disabled={existingMeses.size >= 12}>
              <Settings className="h-4 w-4 mr-2" /> {configExiste ? "Agregar Meses" : "Crear Plan"} {selectedYear}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>⚙️ Plan — {selectedYear}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Seleccione los meses a crear e ingrese tarifas y minutos por quincena.
              </p>

              <div>
                <Label className="text-sm font-medium">📅 Meses a crear</Label>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {MONTH_NAMES.map((name, i) => {
                    const mesNum = i + 1;
                    const exists = existingMeses.has(mesNum);
                    return (
                      <div key={mesNum} className={`flex items-center gap-2 p-2 rounded border ${exists ? "bg-muted/50 opacity-50" : ""}`}>
                        <Checkbox
                          checked={selectedMonths.includes(mesNum)}
                          onCheckedChange={() => !exists && toggleMonth(mesNum)}
                          disabled={exists}
                        />
                        <span className="text-xs">{name}</span>
                        {exists && <Badge variant="outline" className="text-[8px] ml-auto">✅</Badge>}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2 mt-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setSelectedMonths([1,2,3,4,5,6,7,8,9,10,11,12].filter(m => !existingMeses.has(m)))}>Todos</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setSelectedMonths([])}>Ninguno</Button>
                </div>
              </div>

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

              <hr className="border-border" />
              <p className="text-sm font-medium">📅 Minutos por Quincena (para los meses seleccionados)</p>
              {renderQuincenaInputs(configForm, setConfigForm)}
              {renderCalcPreview(configForm)}

              <Button className="w-full" onClick={() => createPlanMutation.mutate()} disabled={createPlanMutation.isPending || selectedMonths.length === 0}>
                {createPlanMutation.isPending ? "Creando..." : `Crear ${selectedMonths.length} Meses`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        )}

        {isAdmin && configExiste && (
          <Button variant="outline" onClick={handleOpenEditConfig}>
            <Pencil className="h-4 w-4 mr-2" /> Editar Configuración {selectedYear}
          </Button>
        )}
      </div>

      {/* Edit Config Dialog */}
      <Dialog open={editConfigOpen} onOpenChange={setEditConfigOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>✏️ Editar Configuración — {selectedYear}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-sm">
              ⚠️ Se actualizarán todos los meses no suspendidos (incluidos los pagados se recalcularán). Los meses con override activo no se modificarán.
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

            <hr className="border-border" />
            <p className="text-sm font-medium">📅 Nuevos Minutos por Quincena</p>
            {renderQuincenaInputs(editConfigForm, setEditConfigForm)}
            {renderCalcPreview(editConfigForm)}

            <Button className="w-full" onClick={() => editConfigMutation.mutate()} disabled={editConfigMutation.isPending}>
              {editConfigMutation.isPending ? "Actualizando..." : "Actualizar Configuración y Recalcular"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Year Summary */}
      {meses && meses.length > 0 && (
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

      {/* Saldo a Favor */}
      {cliente && Number((cliente as any).saldo_a_favor ?? 0) > 0 && (
        <Card className="mb-4 border-2 border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">💚 Saldo a Favor Acumulado</p>
              <p className="text-xs text-muted-foreground">Se aplicará automáticamente al crear el próximo plan anual</p>
            </div>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
              ${Number((cliente as any).saldo_a_favor).toLocaleString("es-AR")}
            </p>
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
          const esPagado = m.estado_mes === "pagado";
          const esSuspendido = (m as any).estado_servicio === "suspendido";
          const tieneOverride = (m as any).usa_override === true;
          const esInactivo = Number(m.total_calculado) === 0 && !esSuspendido && Number(m.total_pagado) === 0;
          return (
            <motion.div key={m.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}>
              <Card
                className={`cursor-pointer hover:shadow-md transition-all border-2 ${
                  esInactivo ? "border-muted/50 bg-muted/30 opacity-50 grayscale"
                    : esSuspendido ? "border-muted-foreground/30 bg-muted-foreground/10 opacity-60"
                    : esPagado ? "border-success/40 bg-success/5"
                    : "border-destructive/20 bg-destructive/5"
                }`}
                onClick={() => navigate(`/clientes/${id}/mes/${m.id}`, { state: { selectedYear } })}
              >
                <CardContent className="p-3 text-center">
                  <p className="text-xs font-medium text-muted-foreground">{MONTH_NAMES[m.mes - 1]}</p>
                  <p className="text-sm font-bold mt-1">
                    {esInactivo ? "❌" : esSuspendido ? "⏸" : esPagado ? "🟢" : "🔴"}
                    {tieneOverride && !esInactivo && " ⚡"}
                  </p>
                  <p className="text-xs mt-1">${Number(m.total_calculado).toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {esInactivo ? "Sin actividad" : esSuspendido ? "Suspendido" : `Pagado: $${Number(m.total_pagado).toLocaleString()}`}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
        {(!meses || meses.length === 0) && !configExiste && (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            No hay meses para {selectedYear}. Crea un plan para generar meses.
          </div>
        )}
      </div>
    </div>
  );
}
