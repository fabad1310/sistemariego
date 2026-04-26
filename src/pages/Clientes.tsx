import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, UserCircle, DollarSign } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/contexts/AuthContext";

const clienteSchema = z.object({
  nombre: z.string().min(2, "Mínimo 2 caracteres"),
  apellido: z.string().min(2, "Mínimo 2 caracteres"),
  dni: z.string().min(5, "DNI inválido"),
  telefono: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  nombre_dueno: z.string().optional(),
  numero_ramal: z.string().optional(),
  nombre_regante: z.string().optional(),
});

type ClienteForm = z.infer<typeof clienteSchema>;

export default function Clientes() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [open, setOpen] = useState(false);
  const [globalOpen, setGlobalOpen] = useState(false);
  const [globalForm, setGlobalForm] = useState({ valor_hora_discriminada: "", valor_hora_no_discriminada: "" });

  const form = useForm<ClienteForm>({
    resolver: zodResolver(clienteSchema),
    defaultValues: { nombre: "", apellido: "", dni: "", telefono: "", email: "", nombre_dueno: "", numero_ramal: "", nombre_regante: "" },
  });

  const { data: clientes, isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").order("apellido", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: mesesAll } = useQuery({
    queryKey: ["meses_servicio_suspension_check"],
    queryFn: async () => {
      const { data, error } = await supabase.from("meses_servicio").select("cliente_id, estado_servicio");
      if (error) throw error;
      return data;
    },
  });

  const clienteIdsSuspendidos = new Set(
    mesesAll?.filter((m) => (m as any).estado_servicio === "suspendido").map((m) => m.cliente_id) ?? []
  );

  const createMutation = useMutation({
    mutationFn: async (values: ClienteForm) => {
      const { error } = await supabase.from("clientes").insert({
        nombre: values.nombre,
        apellido: values.apellido,
        dni: values.dni,
        telefono: values.telefono || null,
        email: values.email || null,
        nombre_dueno: values.nombre_dueno || null,
        numero_ramal: values.numero_ramal || null,
        nombre_regante: values.nombre_regante || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      toast.success("Cliente creado exitosamente 🌱");
      form.reset();
      setOpen(false);
    },
    onError: () => {
      toast.error("Error al crear cliente");
    },
  });

  const globalUpdateMutation = useMutation({
    mutationFn: async () => {
      const vhd = Number(globalForm.valor_hora_discriminada);
      const vhnd = Number(globalForm.valor_hora_no_discriminada);
      if (vhd <= 0) throw new Error("Valor hora precaria debe ser mayor a 0");
      if (vhnd < 0) throw new Error("Valor hora empadronada no puede ser negativo");

      const res = await supabase.functions.invoke("actualizar-valores-globales", {
        body: { valor_hora_discriminada: vhd, valor_hora_no_discriminada: vhnd },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries();
      toast.success(`Valores actualizados. ${data?.configs_actualizadas ?? 0} configuraciones y ${data?.meses_actualizados ?? 0} meses pendientes recalculados ✅`);
      setGlobalOpen(false);
      setGlobalForm({ valor_hora_discriminada: "", valor_hora_no_discriminada: "" });
    },
    onError: (err: any) => toast.error(err.message || "Error al actualizar valores"),
  });

  // Scroll al top al cambiar búsqueda o filtro (mejora la percepción top-down)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [search, filtroEstado]);

  const filtered = clientes?.filter((c) => {
    const matchSearch =
      c.nombre.toLowerCase().includes(search.toLowerCase()) ||
      c.apellido.toLowerCase().includes(search.toLowerCase()) ||
      c.dni.includes(search) ||
      ((c as any).numero_ramal || "").toLowerCase().includes(search.toLowerCase());
    const matchEstado = filtroEstado === "todos" || c.estado === filtroEstado;
    return matchSearch && matchEstado;
  });

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <SidebarTrigger />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">👥 Gestión de clientes del sistema de riego</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
          <Dialog open={globalOpen} onOpenChange={setGlobalOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <DollarSign className="h-4 w-4 mr-2" /> Actualizar Valores Globales
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>💲 Actualizar Valores de Hora — Global</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-sm">
                  ⚠️ Esta acción actualizará todos los meses <strong>pendientes</strong> de todos los clientes activos del año actual. Los meses ya pagados <strong>no se modificarán</strong>.
                </div>
                <div>
                  <Label>Nuevo Valor/Hora Precaria ($)</Label>
                  <Input type="number" min="0" step="0.01" value={globalForm.valor_hora_discriminada} onChange={(e) => setGlobalForm((p) => ({ ...p, valor_hora_discriminada: e.target.value }))} />
                </div>
                <div>
                  <Label>Nuevo Valor/Hora Empadronada ($)</Label>
                  <Input type="number" min="0" step="0.01" value={globalForm.valor_hora_no_discriminada} onChange={(e) => setGlobalForm((p) => ({ ...p, valor_hora_no_discriminada: e.target.value }))} />
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button className="w-full" disabled={!globalForm.valor_hora_discriminada || globalUpdateMutation.isPending}>
                      {globalUpdateMutation.isPending ? "Actualizando..." : "Aplicar a Todos los Clientes Activos"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Confirmar actualización global?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta acción actualizará los valores de hora para todos los clientes activos del año actual.
                        Solo se recalcularán meses con estado pendiente. Los meses ya pagados NO se modificarán.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => globalUpdateMutation.mutate()}>
                        Confirmar Actualización
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </DialogContent>
          </Dialog>
          )}

          {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" /> Nuevo Cliente
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>🌱 Nuevo Cliente</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="nombre" render={({ field }) => (
                      <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input placeholder="Juan" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="apellido" render={({ field }) => (
                      <FormItem><FormLabel>Apellido</FormLabel><FormControl><Input placeholder="Pérez" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="dni" render={({ field }) => (
                    <FormItem><FormLabel>DNI</FormLabel><FormControl><Input placeholder="12345678" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="telefono" render={({ field }) => (
                    <FormItem><FormLabel>Teléfono</FormLabel><FormControl><Input placeholder="+54 11 1234-5678" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem><FormLabel>Email</FormLabel><FormControl><Input placeholder="juan@email.com" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <hr />
                  <p className="text-sm font-medium text-muted-foreground">🌾 Datos de Riego</p>
                  <FormField control={form.control} name="nombre_dueno" render={({ field }) => (
                    <FormItem><FormLabel>Nombre del Dueño</FormLabel><FormControl><Input placeholder="Nombre del dueño" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="numero_ramal" render={({ field }) => (
                    <FormItem><FormLabel>Número de Ramal</FormLabel><FormControl><Input placeholder="Ej: R-15" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="nombre_regante" render={({ field }) => (
                    <FormItem><FormLabel>Nombre del Regante</FormLabel><FormControl><Input placeholder="Nombre del regante" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Creando..." : "Crear Cliente"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre, apellido, DNI o número de ramal..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="activo">🟢 Activos</SelectItem>
            <SelectItem value="inactivo">🔴 Inactivos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                    <div className="h-3 bg-muted rounded w-1/3" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered?.map((c, i) => {
            const isSuspendido = clienteIdsSuspendidos.has(c.id);
            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15, ease: "easeOut" }}>
                <Card className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all" onClick={() => navigate(`/clientes/${c.id}`)}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <UserCircle className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold truncate">{c.nombre} {c.apellido}</span>
                          <Badge variant={c.estado === "activo" ? "default" : "destructive"} className="text-[10px]">
                            {c.estado === "activo" ? "🟢 Activo" : "🔴 Inactivo"}
                          </Badge>
                          {isSuspendido && (
                            <Badge variant="secondary" className="text-[10px] bg-muted-foreground/20">⏸ Suspendido</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">DNI: {c.dni}</p>
                        {(c as any).numero_ramal && (
                          <p className="text-xs text-muted-foreground">🔢 Ramal: {(c as any).numero_ramal}</p>
                        )}
                        {c.telefono && <p className="text-xs text-muted-foreground">{c.telefono}</p>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
          {filtered?.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">No se encontraron clientes</div>
          )}
        </div>
      )}
    </div>
  );
}
