import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, DollarSign, ImagePlus, Pencil, Ban, Eye } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import ImageLightbox from "@/components/ImageLightbox";

const gastoSchema = z.object({
  nombre_gasto: z.string().min(2, "Mínimo 2 caracteres").max(200),
  monto: z.coerce.number().positive("Monto debe ser mayor a 0"),
  metodo_pago: z.enum(["efectivo", "transferencia"]),
  numero_recibo: z.string().optional(),
  fecha_transferencia: z.string().optional(),
  pagado_por: z.string().min(2, "Mínimo 2 caracteres").max(100),
  fecha_pago: z.string().min(1, "Fecha requerida"),
}).refine((data) => {
  if (data.metodo_pago === "efectivo" && !data.numero_recibo) return false;
  return true;
}, { message: "Número de recibo requerido para pago en efectivo", path: ["numero_recibo"] })
.refine((data) => {
  if (data.metodo_pago === "transferencia" && !data.fecha_transferencia) return false;
  return true;
}, { message: "Fecha de transferencia requerida", path: ["fecha_transferencia"] });

type GastoForm = z.infer<typeof gastoSchema>;

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default function Gastos() {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [filtroMetodo, setFiltroMetodo] = useState<string>("todos");
  const [filtroFechaDesde, setFiltroFechaDesde] = useState("");
  const [filtroFechaHasta, setFiltroFechaHasta] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailGasto, setDetailGasto] = useState<any>(null);
  const [editGasto, setEditGasto] = useState<any>(null);
  const [obsText, setObsText] = useState("");
  const [obsFile, setObsFile] = useState<File | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const form = useForm<GastoForm>({
    resolver: zodResolver(gastoSchema),
    defaultValues: { nombre_gasto: "", monto: 0, metodo_pago: "efectivo", numero_recibo: "", fecha_transferencia: "", pagado_por: "", fecha_pago: "" },
  });

  const editForm = useForm<GastoForm>({
    resolver: zodResolver(gastoSchema),
    defaultValues: { nombre_gasto: "", monto: 0, metodo_pago: "efectivo", numero_recibo: "", fecha_transferencia: "", pagado_por: "", fecha_pago: "" },
  });

  const metodoPago = form.watch("metodo_pago");
  const editMetodoPago = editForm.watch("metodo_pago");

  const { data: gastos, isLoading } = useQuery({
    queryKey: ["gastos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("gastos").select("*").order("fecha_pago", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: observaciones } = useQuery({
    queryKey: ["observaciones_gasto", detailGasto?.id],
    enabled: !!detailGasto?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("observaciones_gasto").select("*").eq("gasto_id", detailGasto!.id).order("fecha_creacion", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: GastoForm) => {
      const { error } = await supabase.from("gastos").insert({
        nombre_gasto: values.nombre_gasto,
        monto: values.monto,
        metodo_pago: values.metodo_pago,
        numero_recibo: values.metodo_pago === "efectivo" ? values.numero_recibo : null,
        fecha_transferencia: values.metodo_pago === "transferencia" ? values.fecha_transferencia : null,
        pagado_por: values.pagado_por,
        fecha_pago: values.fecha_pago,
        estado: "confirmado",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gastos"] });
      queryClient.invalidateQueries({ queryKey: ["gastos_dashboard"] });
      toast.success("Gasto registrado ✅");
      form.reset();
      setCreateOpen(false);
    },
    onError: () => toast.error("Error al registrar gasto"),
  });

  const editMutation = useMutation({
    mutationFn: async (values: GastoForm) => {
      if (!editGasto) return;
      const { error } = await supabase.from("gastos").update({
        nombre_gasto: values.nombre_gasto,
        monto: values.monto,
        metodo_pago: values.metodo_pago,
        numero_recibo: values.metodo_pago === "efectivo" ? values.numero_recibo : null,
        fecha_transferencia: values.metodo_pago === "transferencia" ? values.fecha_transferencia : null,
        pagado_por: values.pagado_por,
        fecha_pago: values.fecha_pago,
      } as any).eq("id", editGasto.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gastos"] });
      queryClient.invalidateQueries({ queryKey: ["gastos_dashboard"] });
      toast.success("Gasto actualizado ✅");
      setEditGasto(null);
    },
    onError: () => toast.error("Error al actualizar gasto"),
  });

  const anularMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("gastos").update({ estado: "anulado" } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gastos"] });
      queryClient.invalidateQueries({ queryKey: ["gastos_dashboard"] });
      toast.success("Gasto anulado ✅");
      setDetailGasto(null);
    },
    onError: () => toast.error("Error al anular gasto"),
  });

  const obsMutation = useMutation({
    mutationFn: async () => {
      if (!detailGasto) return;
      let imagen_url: string | null = null;
      if (obsFile) {
        const ext = obsFile.name.split('.').pop();
        const path = `gastos/${detailGasto.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("observaciones").upload(path, obsFile);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from("observaciones").getPublicUrl(path);
        imagen_url = urlData.publicUrl;
      }
      if (!obsText && !imagen_url) throw new Error("Ingrese texto o imagen");
      const { error } = await supabase.from("observaciones_gasto").insert({
        gasto_id: detailGasto.id,
        texto: obsText || null,
        imagen_url,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["observaciones_gasto", detailGasto?.id] });
      toast.success("Observación agregada 📝");
      setObsText("");
      setObsFile(null);
    },
    onError: (err: any) => toast.error(err.message || "Error al agregar observación"),
  });

  const handleOpenEdit = (g: any) => {
    editForm.reset({
      nombre_gasto: g.nombre_gasto,
      monto: Number(g.monto),
      metodo_pago: g.metodo_pago,
      numero_recibo: g.numero_recibo || "",
      fecha_transferencia: g.fecha_transferencia || "",
      pagado_por: g.pagado_por,
      fecha_pago: g.fecha_pago,
    });
    setEditGasto(g);
  };

  const filtered = gastos?.filter((g: any) => {
    const matchSearch = g.nombre_gasto.toLowerCase().includes(search.toLowerCase()) ||
      g.pagado_por.toLowerCase().includes(search.toLowerCase());
    const matchMetodo = filtroMetodo === "todos" || g.metodo_pago === filtroMetodo;
    let matchFecha = true;
    if (filtroFechaDesde) matchFecha = matchFecha && g.fecha_pago >= filtroFechaDesde;
    if (filtroFechaHasta) matchFecha = matchFecha && g.fecha_pago <= filtroFechaHasta;
    return matchSearch && matchMetodo && matchFecha;
  }) ?? [];

  const totalConfirmado = filtered.filter((g: any) => g.estado === "confirmado").reduce((s: number, g: any) => s + Number(g.monto), 0);

  return (
    <div>
      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />

      <div className="flex items-center gap-3 mb-6">
        <SidebarTrigger />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Gastos</h1>
          <p className="text-sm text-muted-foreground">💸 Módulo contable de gastos</p>
        </div>
        {isAdmin && (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Nuevo Gasto</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>💸 Registrar Gasto</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
                <FormField control={form.control} name="nombre_gasto" render={({ field }) => (
                  <FormItem><FormLabel>Concepto</FormLabel><FormControl><Input placeholder="Mantenimiento, combustible..." {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="monto" render={({ field }) => (
                    <FormItem><FormLabel>Monto ($)</FormLabel><FormControl><Input type="number" min="0" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="metodo_pago" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Método de Pago</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="efectivo">💵 Efectivo</SelectItem>
                          <SelectItem value="transferencia">🏦 Transferencia</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                {metodoPago === "efectivo" && (
                  <FormField control={form.control} name="numero_recibo" render={({ field }) => (
                    <FormItem><FormLabel>Nº Recibo</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                )}
                {metodoPago === "transferencia" && (
                  <FormField control={form.control} name="fecha_transferencia" render={({ field }) => (
                    <FormItem><FormLabel>Fecha Transferencia</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                )}
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="pagado_por" render={({ field }) => (
                    <FormItem><FormLabel>Pagado por</FormLabel><FormControl><Input placeholder="Nombre" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="fecha_pago" render={({ field }) => (
                    <FormItem><FormLabel>Fecha de Pago</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Registrando..." : "Registrar Gasto"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {/* Summary card */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">Total gastos confirmados (filtro actual):</span>
            </div>
            <span className="text-xl font-bold">${totalConfirmado.toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por concepto o pagado por..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filtroMetodo} onValueChange={setFiltroMetodo}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="efectivo">💵 Efectivo</SelectItem>
            <SelectItem value="transferencia">🏦 Transferencia</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" className="w-[160px]" placeholder="Desde" value={filtroFechaDesde} onChange={(e) => setFiltroFechaDesde(e.target.value)} />
        <Input type="date" className="w-[160px]" placeholder="Hasta" value={filtroFechaHasta} onChange={(e) => setFiltroFechaHasta(e.target.value)} />
      </div>

      {/* Gastos table */}
      {isLoading ? (
        <Card><CardContent className="p-6"><div className="h-32 bg-muted rounded animate-pulse" /></CardContent></Card>
      ) : filtered.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Pagado por</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((g: any, i: number) => (
                  <motion.tr key={g.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="border-b">
                    <TableCell className="text-sm">{new Date(g.fecha_pago + "T12:00:00").toLocaleDateString("es-AR")}</TableCell>
                    <TableCell className="font-medium">{g.nombre_gasto}</TableCell>
                    <TableCell className="text-sm">{g.pagado_por}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{g.metodo_pago === "efectivo" ? "💵 Efectivo" : "🏦 Transfer."}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">${Number(g.monto).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={g.estado === "confirmado" ? "default" : "secondary"} className={g.estado === "anulado" ? "bg-muted-foreground/20" : ""}>
                        {g.estado === "confirmado" ? "✅ Confirmado" : "❌ Anulado"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => setDetailGasto(g)}><Eye className="h-4 w-4" /></Button>
                        {isAdmin && g.estado === "confirmado" && (
                          <Button size="sm" variant="ghost" onClick={() => handleOpenEdit(g)}><Pencil className="h-4 w-4" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="text-center py-12 text-muted-foreground">No se encontraron gastos</div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailGasto} onOpenChange={(open) => !open && setDetailGasto(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>📋 Detalle del Gasto</DialogTitle>
          </DialogHeader>
          {detailGasto && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Concepto:</span><p className="font-medium">{detailGasto.nombre_gasto}</p></div>
                <div><span className="text-muted-foreground">Monto:</span><p className="font-bold text-lg">${Number(detailGasto.monto).toLocaleString()}</p></div>
                <div><span className="text-muted-foreground">Método:</span><p>{detailGasto.metodo_pago === "efectivo" ? "💵 Efectivo" : "🏦 Transferencia"}</p></div>
                <div><span className="text-muted-foreground">Pagado por:</span><p>{detailGasto.pagado_por}</p></div>
                <div><span className="text-muted-foreground">Fecha de pago:</span><p>{new Date(detailGasto.fecha_pago + "T12:00:00").toLocaleDateString("es-AR")}</p></div>
                <div><span className="text-muted-foreground">Estado:</span>
                  <Badge variant={detailGasto.estado === "confirmado" ? "default" : "secondary"}>
                    {detailGasto.estado === "confirmado" ? "✅ Confirmado" : "❌ Anulado"}
                  </Badge>
                </div>
                {detailGasto.numero_recibo && <div><span className="text-muted-foreground">Recibo:</span><p>{detailGasto.numero_recibo}</p></div>}
                {detailGasto.fecha_transferencia && <div><span className="text-muted-foreground">Fecha transfer.:</span><p>{new Date(detailGasto.fecha_transferencia + "T12:00:00").toLocaleDateString("es-AR")}</p></div>}
              </div>

              {/* Observations section */}
              <hr />
              <p className="text-sm font-medium text-muted-foreground">📝 Observaciones</p>
              {observaciones && observaciones.length > 0 && (
                <div className="space-y-2">
                  {observaciones.map((o: any) => (
                    <div key={o.id} className="p-3 rounded-lg bg-muted/50 text-sm">
                      {o.texto && <p>{o.texto}</p>}
                      {o.imagen_url && (
                        <img
                          src={o.imagen_url}
                          alt="Observación"
                          className="mt-2 rounded-lg max-h-40 object-cover cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setLightboxSrc(o.imagen_url)}
                        />
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(o.fecha_creacion).toLocaleString("es-AR")}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {isAdmin && (
              <div className="space-y-2">
                <Textarea placeholder="Agregar observación..." value={obsText} onChange={(e) => setObsText(e.target.value)} />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <label className="cursor-pointer">
                      <ImagePlus className="h-4 w-4 mr-2" />
                      {obsFile ? obsFile.name : "Imagen"}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => setObsFile(e.target.files?.[0] || null)} />
                    </label>
                  </Button>
                  <Button size="sm" onClick={() => obsMutation.mutate()} disabled={obsMutation.isPending || (!obsText && !obsFile)}>
                    {obsMutation.isPending ? "Guardando..." : "Agregar"}
                  </Button>
                </div>
              </div>
              )}

              {/* Anular button - admin only */}
              {isAdmin && detailGasto.estado === "confirmado" && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full">
                      <Ban className="h-4 w-4 mr-2" /> Anular Gasto
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Anular este gasto?</AlertDialogTitle>
                      <AlertDialogDescription>
                        El gasto será marcado como anulado. No se eliminará el registro pero dejará de contarse en el balance de caja.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => anularMutation.mutate(detailGasto.id)}>Anular</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editGasto} onOpenChange={(open) => !open && setEditGasto(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>✏️ Editar Gasto</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit((v) => editMutation.mutate(v))} className="space-y-4">
              <FormField control={editForm.control} name="nombre_gasto" render={({ field }) => (
                <FormItem><FormLabel>Concepto</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="monto" render={({ field }) => (
                  <FormItem><FormLabel>Monto ($)</FormLabel><FormControl><Input type="number" min="0" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="metodo_pago" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Método de Pago</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="efectivo">💵 Efectivo</SelectItem>
                        <SelectItem value="transferencia">🏦 Transferencia</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              {editMetodoPago === "efectivo" && (
                <FormField control={editForm.control} name="numero_recibo" render={({ field }) => (
                  <FormItem><FormLabel>Nº Recibo</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              )}
              {editMetodoPago === "transferencia" && (
                <FormField control={editForm.control} name="fecha_transferencia" render={({ field }) => (
                  <FormItem><FormLabel>Fecha Transferencia</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              )}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="pagado_por" render={({ field }) => (
                  <FormItem><FormLabel>Pagado por</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="fecha_pago" render={({ field }) => (
                  <FormItem><FormLabel>Fecha de Pago</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <Button type="submit" className="w-full" disabled={editMutation.isPending}>
                {editMutation.isPending ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
