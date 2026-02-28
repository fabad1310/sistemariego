import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ArrowLeft, CreditCard, DollarSign, PauseCircle, PlayCircle, MessageSquare, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { SidebarTrigger } from "@/components/ui/sidebar";

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function MesDetalle() {
  const { id: clienteId, mesId } = useParams<{ id: string; mesId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [pagoForm, setPagoForm] = useState({
    monto: "",
    metodo_pago: "efectivo" as "efectivo" | "transferencia",
    numero_recibo: "",
    fecha_transferencia: "",
    notas: "",
  });

  // Quincena form
  const [quincenaForm, setQuincenaForm] = useState({
    numero_quincena: 1 as 1 | 2,
    minutos_precaria: "",
    minutos_empadronada: "",
    valor_minuto_precaria: "",
    valor_minuto_empadronada: "",
  });

  // Observation form
  const [obsText, setObsText] = useState("");
  const [obsFile, setObsFile] = useState<File | null>(null);

  const { data: mes } = useQuery({
    queryKey: ["mes_servicio", mesId],
    queryFn: async () => {
      const { data, error } = await supabase.from("meses_servicio").select("*").eq("id", mesId!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: config } = useQuery({
    queryKey: ["configuracion", mes?.configuracion_id],
    enabled: !!mes?.configuracion_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("configuracion_riego_cliente").select("*").eq("id", mes!.configuracion_id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: pagos } = useQuery({
    queryKey: ["pagos", mesId],
    queryFn: async () => {
      const { data, error } = await supabase.from("pagos").select("*").eq("mes_servicio_id", mesId!).order("fecha_registro", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: quincenas } = useQuery({
    queryKey: ["quincenas", mesId],
    queryFn: async () => {
      const { data, error } = await supabase.from("quincenas_servicio").select("*").eq("mes_servicio_id", mesId!).order("numero_quincena");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: observaciones } = useQuery({
    queryKey: ["observaciones", mesId],
    queryFn: async () => {
      const { data, error } = await supabase.from("observaciones_mes").select("*").eq("mes_servicio_id", mesId!).order("fecha_creacion", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const pagoMutation = useMutation({
    mutationFn: async () => {
      const monto = Number(pagoForm.monto);
      if (monto <= 0) throw new Error("El monto debe ser mayor a 0");
      if (pagoForm.metodo_pago === "efectivo" && !pagoForm.numero_recibo) throw new Error("Número de recibo requerido");
      if (pagoForm.metodo_pago === "transferencia" && !pagoForm.fecha_transferencia) throw new Error("Fecha de transferencia requerida");

      const res = await supabase.functions.invoke("registrar-pago", {
        body: {
          mes_servicio_id: mesId,
          cliente_id: clienteId,
          monto,
          metodo_pago: pagoForm.metodo_pago,
          numero_recibo: pagoForm.metodo_pago === "efectivo" ? pagoForm.numero_recibo : null,
          fecha_transferencia: pagoForm.metodo_pago === "transferencia" ? pagoForm.fecha_transferencia : null,
          notas: pagoForm.notas || null,
        },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["mes_servicio", mesId] });
      queryClient.invalidateQueries({ queryKey: ["pagos", mesId] });
      queryClient.invalidateQueries({ queryKey: ["meses_servicio"] });
      const msg = data?.excedente_aplicado
        ? `Pago registrado 💰 Excedente de $${data.excedente_aplicado} aplicado a meses siguientes`
        : "Pago registrado exitosamente 💰";
      toast.success(msg);
      setPagoForm({ monto: "", metodo_pago: "efectivo", numero_recibo: "", fecha_transferencia: "", notas: "" });
    },
    onError: (err: any) => toast.error(err.message || "Error al registrar pago"),
  });

  // Suspension mutation
  const suspensionMutation = useMutation({
    mutationFn: async (accion: "suspender" | "reactivar") => {
      const res = await supabase.functions.invoke("suspender-servicio", {
        body: { mes_servicio_id: mesId, accion },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries();
      toast.success(data?.meses_suspendidos
        ? `${data.meses_suspendidos} meses suspendidos ⏸`
        : `${data?.meses_reactivados} meses reactivados ▶️`);
    },
    onError: (err: any) => toast.error(err.message || "Error"),
  });

  // Quincena mutation
  const quincenaMutation = useMutation({
    mutationFn: async () => {
      const res = await supabase.functions.invoke("guardar-quincena", {
        body: {
          mes_servicio_id: mesId,
          numero_quincena: quincenaForm.numero_quincena,
          minutos_precaria: Number(quincenaForm.minutos_precaria) || 0,
          minutos_empadronada: Number(quincenaForm.minutos_empadronada) || 0,
          valor_minuto_precaria: Number(quincenaForm.valor_minuto_precaria) || 0,
          valor_minuto_empadronada: Number(quincenaForm.valor_minuto_empadronada) || 0,
        },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["mes_servicio", mesId] });
      queryClient.invalidateQueries({ queryKey: ["quincenas", mesId] });
      toast.success(`Quincena ${quincenaForm.numero_quincena} guardada. Total mensual: $${data?.total_mensual?.toLocaleString()} (${data?.horas_redondeadas}h) ✅`);
    },
    onError: (err: any) => toast.error(err.message || "Error al guardar quincena"),
  });

  // Observation mutation
  const obsMutation = useMutation({
    mutationFn: async () => {
      let imagen_url: string | null = null;

      if (obsFile) {
        const ext = obsFile.name.split('.').pop();
        const path = `${mesId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("observaciones").upload(path, obsFile);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from("observaciones").getPublicUrl(path);
        imagen_url = urlData.publicUrl;
      }

      if (!obsText && !imagen_url) throw new Error("Ingrese texto o imagen");

      const { error } = await supabase.from("observaciones_mes").insert({
        mes_servicio_id: mesId,
        texto: obsText || null,
        imagen_url,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["observaciones", mesId] });
      toast.success("Observación agregada 📝");
      setObsText("");
      setObsFile(null);
    },
    onError: (err: any) => toast.error(err.message || "Error al agregar observación"),
  });

  // Load quincena data into form
  const loadQuincena = (num: 1 | 2) => {
    const q = quincenas?.find((q: any) => q.numero_quincena === num);
    setQuincenaForm({
      numero_quincena: num,
      minutos_precaria: q ? String(q.minutos_precaria) : "",
      minutos_empadronada: q ? String(q.minutos_empadronada) : "",
      valor_minuto_precaria: q ? String(q.valor_minuto_precaria) : "",
      valor_minuto_empadronada: q ? String(q.valor_minuto_empadronada) : "",
    });
  };

  const saldo = Number(mes?.saldo_pendiente ?? 0);
  const totalCalc = Number(mes?.total_calculado ?? 0);
  const totalPagado = Number(mes?.total_pagado ?? 0);
  const progreso = totalCalc > 0 ? (totalPagado / totalCalc) * 100 : 0;
  const pagado = mes?.estado_mes === "pagado";
  const suspendido = (mes as any)?.estado_servicio === "suspendido";

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <SidebarTrigger />
        <Button variant="ghost" size="icon" onClick={() => navigate(`/clientes/${clienteId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {mes ? `${MONTH_NAMES[mes.mes - 1]} ${mes.anio}` : "..."}
          </h1>
          <p className="text-sm text-muted-foreground">
            💧 Detalle del mes de servicio
            {suspendido ? (
              <Badge variant="secondary" className="ml-2 text-[10px] bg-muted-foreground/20">⏸ Suspendido</Badge>
            ) : pagado ? (
              <Badge className="ml-2 text-[10px]">🟢 Pagado</Badge>
            ) : (
              <Badge variant="destructive" className="ml-2 text-[10px]">🔴 Pendiente</Badge>
            )}
          </p>
        </div>

        {/* Suspension controls */}
        {!suspendido && !pagado && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <PauseCircle className="h-4 w-4 mr-2" /> Suspender
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Suspender servicio desde este mes?</AlertDialogTitle>
                <AlertDialogDescription>
                  Este mes y todos los posteriores pendientes serán marcados como suspendidos con total $0. Los meses anteriores no se modificarán.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => suspensionMutation.mutate("suspender")}>Suspender</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {suspendido && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <PlayCircle className="h-4 w-4 mr-2" /> Reactivar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Reactivar servicio desde este mes?</AlertDialogTitle>
                <AlertDialogDescription>
                  Este mes y todos los posteriores suspendidos serán reactivados con los valores de la configuración actual.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => suspensionMutation.mutate("reactivar")}>Reactivar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {/* Calculation breakdown */}
          {config && !suspendido && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">📊 Desglose del Cálculo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Horas precaria × valor</span>
                  <span>{Number(config.horas_discriminadas)} h × ${Number(config.valor_hora_discriminada)} = <strong>${(Number(config.horas_discriminadas) * Number(config.valor_hora_discriminada)).toLocaleString()}</strong></span>
                </div>
                <div className="flex justify-between">
                  <span>Horas empadronada × valor</span>
                  <span>{Number(config.horas_no_discriminadas)} h × ${Number(config.valor_hora_no_discriminada)} = <strong>${(Number(config.horas_no_discriminadas) * Number(config.valor_hora_no_discriminada)).toLocaleString()}</strong></span>
                </div>
                <hr className="my-2" />
                <div className="flex justify-between font-bold">
                  <span>Total mensual</span>
                  <span>${totalCalc.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quincenas */}
          {!suspendido && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">📅 Quincenas (Minutos)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Display existing quincenas */}
                {quincenas && quincenas.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {quincenas.map((q: any) => (
                      <div key={q.id} className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm">
                        <span>Quincena {q.numero_quincena}</span>
                        <span>Prec: {Number(q.minutos_precaria)}min | Emp: {Number(q.minutos_empadronada)}min</span>
                        <span className="font-semibold">${Number(q.subtotal_calculado).toLocaleString()}</span>
                        <Button size="sm" variant="ghost" onClick={() => loadQuincena(q.numero_quincena)} disabled={pagado}>Editar</Button>
                      </div>
                    ))}
                  </div>
                )}

                {!pagado && (
                  <div className="space-y-3 border-t pt-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant={quincenaForm.numero_quincena === 1 ? "default" : "outline"} onClick={() => loadQuincena(1)}>Q1</Button>
                      <Button size="sm" variant={quincenaForm.numero_quincena === 2 ? "default" : "outline"} onClick={() => loadQuincena(2)}>Q2</Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Minutos Precaria</Label><Input type="number" min="0" value={quincenaForm.minutos_precaria} onChange={(e) => setQuincenaForm(p => ({ ...p, minutos_precaria: e.target.value }))} /></div>
                      <div><Label>Minutos Empadronada</Label><Input type="number" min="0" value={quincenaForm.minutos_empadronada} onChange={(e) => setQuincenaForm(p => ({ ...p, minutos_empadronada: e.target.value }))} /></div>
                      <div><Label>$/Min Precaria</Label><Input type="number" min="0" step="0.01" value={quincenaForm.valor_minuto_precaria} onChange={(e) => setQuincenaForm(p => ({ ...p, valor_minuto_precaria: e.target.value }))} /></div>
                      <div><Label>$/Min Empadronada</Label><Input type="number" min="0" step="0.01" value={quincenaForm.valor_minuto_empadronada} onChange={(e) => setQuincenaForm(p => ({ ...p, valor_minuto_empadronada: e.target.value }))} /></div>
                    </div>
                    <Button className="w-full" onClick={() => quincenaMutation.mutate()} disabled={quincenaMutation.isPending}>
                      {quincenaMutation.isPending ? "Guardando..." : `Guardar Quincena ${quincenaForm.numero_quincena}`}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Summary */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-3 text-center mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="font-bold">${totalCalc.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pagado</p>
                  <p className="font-bold text-success">${totalPagado.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pendiente</p>
                  <p className="font-bold text-destructive">${saldo.toLocaleString()}</p>
                </div>
              </div>
              <Progress value={progreso} className="h-2" />
            </CardContent>
          </Card>

          {/* Payment form */}
          {!pagado && !suspendido && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">💰 Registrar Pago</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Monto ($)</Label>
                  <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={pagoForm.monto} onChange={(e) => setPagoForm((p) => ({ ...p, monto: e.target.value }))} />
                  {Number(pagoForm.monto) > saldo && saldo > 0 && (
                    <p className="text-xs text-warning mt-1">⚠️ El monto excede el saldo. El excedente (${(Number(pagoForm.monto) - saldo).toLocaleString()}) se aplicará a meses siguientes.</p>
                  )}
                </div>
                <div>
                  <Label>Método de Pago</Label>
                  <Select value={pagoForm.metodo_pago} onValueChange={(v: "efectivo" | "transferencia") => setPagoForm((p) => ({ ...p, metodo_pago: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="efectivo">💵 Efectivo</SelectItem>
                      <SelectItem value="transferencia">🏦 Transferencia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {pagoForm.metodo_pago === "efectivo" && (
                  <div><Label>Número de Recibo</Label><Input placeholder="Ej: 00123" value={pagoForm.numero_recibo} onChange={(e) => setPagoForm((p) => ({ ...p, numero_recibo: e.target.value }))} /></div>
                )}
                {pagoForm.metodo_pago === "transferencia" && (
                  <div><Label>Fecha de Transferencia</Label><Input type="date" value={pagoForm.fecha_transferencia} onChange={(e) => setPagoForm((p) => ({ ...p, fecha_transferencia: e.target.value }))} /></div>
                )}
                <div><Label>Notas (opcional)</Label><Input placeholder="Observaciones..." value={pagoForm.notas} onChange={(e) => setPagoForm((p) => ({ ...p, notas: e.target.value }))} /></div>
                <Button className="w-full" onClick={() => pagoMutation.mutate()} disabled={pagoMutation.isPending}>
                  <CreditCard className="h-4 w-4 mr-2" />
                  {pagoMutation.isPending ? "Registrando..." : "Registrar Pago"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Observations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">📝 Observaciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Textarea placeholder="Escribir observación..." value={obsText} onChange={(e) => setObsText(e.target.value)} />
                <div className="flex items-center gap-2">
                  <Label className="cursor-pointer flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                    <ImagePlus className="h-4 w-4" />
                    {obsFile ? obsFile.name : "Adjuntar imagen"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => setObsFile(e.target.files?.[0] || null)} />
                  </Label>
                </div>
                <Button size="sm" onClick={() => obsMutation.mutate()} disabled={obsMutation.isPending || (!obsText && !obsFile)}>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  {obsMutation.isPending ? "Guardando..." : "Agregar Observación"}
                </Button>
              </div>

              {observaciones && observaciones.length > 0 && (
                <div className="space-y-3 border-t pt-3">
                  {observaciones.map((obs: any) => (
                    <div key={obs.id} className="p-3 rounded-lg bg-muted/50 text-sm">
                      {obs.texto && <p>{obs.texto}</p>}
                      {obs.imagen_url && (
                        <img src={obs.imagen_url} alt="Observación" className="mt-2 rounded max-h-48 object-cover" />
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(obs.fecha_creacion).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Payment history */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">📋 Historial de Pagos</CardTitle>
          </CardHeader>
          <CardContent>
            {pagos && pagos.length > 0 ? (
              <div className="space-y-3">
                {pagos.map((p, i) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 shrink-0">
                      <DollarSign className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">${Number(p.monto).toLocaleString()}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {p.metodo_pago === "efectivo" ? "💵 Efectivo" : "🏦 Transfer."}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(p.fecha_registro).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {p.numero_recibo && <p className="text-xs text-muted-foreground">Recibo: {p.numero_recibo}</p>}
                      {p.notas && <p className="text-xs text-muted-foreground italic">{p.notas}</p>}
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No hay pagos registrados para este mes</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
