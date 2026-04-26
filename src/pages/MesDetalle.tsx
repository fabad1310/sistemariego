import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
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
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, CreditCard, DollarSign, PauseCircle, PlayCircle, MessageSquare, ImagePlus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarTrigger } from "@/components/ui/sidebar";
import ImageLightbox from "@/components/ImageLightbox";

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// Devuelve la fecha LOCAL correcta en formato YYYY-MM-DD.
// No usar toISOString() porque usa UTC y en Argentina (UTC-3)
// entre las 21:00-23:59 locales devuelve el día siguiente.
function localDateString(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function MesDetalle() {
  const { id: clienteId, mesId } = useParams<{ id: string; mesId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const [pagoForm, setPagoForm] = useState({
    monto: "",
    metodo_pago: "efectivo" as "efectivo" | "transferencia",
    numero_recibo: "",
    notas: "",
    fecha_pago_real: localDateString(),
  });

  const [submitLocked, setSubmitLocked] = useState(false);

  const [q1Form, setQ1Form] = useState({ minutos_precaria: "", minutos_empadronada: "" });
  const [q2Form, setQ2Form] = useState({ minutos_precaria: "", minutos_empadronada: "" });
  const [obsText, setObsText] = useState("");
  const [obsFile, setObsFile] = useState<File | null>(null);

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideValue, setOverrideValue] = useState("");

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
      const { data, error } = await supabase.from("pagos").select("*").eq("mes_servicio_id", mesId!).order("fecha_pago_real", { ascending: false });
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

  const q1Data = quincenas?.find((q: any) => q.numero_quincena === 1);
  const q2Data = quincenas?.find((q: any) => q.numero_quincena === 2);

  const calcPreview = useMemo(() => {
    const q1mp = Number(q1Form.minutos_precaria || q1Data?.minutos_precaria || 0);
    const q1me = Number(q1Form.minutos_empadronada || q1Data?.minutos_empadronada || 0);
    const q2mp = Number(q2Form.minutos_precaria || q2Data?.minutos_precaria || 0);
    const q2me = Number(q2Form.minutos_empadronada || q2Data?.minutos_empadronada || 0);

    const totalMinPrec = q1mp + q2mp;
    const totalMinEmp = q1me + q2me;
    const horasDecPrec = totalMinPrec / 60;
    const horasDecEmp = totalMinEmp / 60;
    const horasFinalPrec = totalMinPrec > 0 ? Math.ceil(horasDecPrec) : 0;
    const horasFinalEmp = totalMinEmp > 0 ? Math.ceil(horasDecEmp) : 0;

    const valorHoraPrec = Number(config?.valor_hora_discriminada || 0);
    const valorHoraEmp = Number(config?.valor_hora_no_discriminada || 0);

    const totalPrec = horasFinalPrec * valorHoraPrec;
    const totalEmp = horasFinalEmp * valorHoraEmp;
    const totalRiego = totalPrec + totalEmp;
    const montoAdminRaw = Number((mes as any)?.monto_administrativo || 0);
    const montoAdmin = totalRiego > 0 ? montoAdminRaw : 0;
    const totalMensual = totalRiego + montoAdmin;

    return {
      totalMinPrec, totalMinEmp,
      horasDecPrec, horasDecEmp,
      horasFinalPrec, horasFinalEmp,
      valorHoraPrec, valorHoraEmp,
      totalPrec, totalEmp, montoAdmin, totalMensual,
    };
  }, [q1Form, q2Form, q1Data, q2Data, config, mes]);

  const pagoMutation = useMutation({
    mutationFn: async () => {
      const monto = Number(pagoForm.monto);
      if (!Number.isFinite(monto) || monto <= 0) throw new Error("El monto debe ser un número positivo válido");
      if (monto > 100_000_000) throw new Error("El monto ingresado supera el límite permitido");
      if (pagoForm.metodo_pago === "efectivo" && !pagoForm.numero_recibo) throw new Error("Número de recibo requerido");
      if (!pagoForm.fecha_pago_real) throw new Error("La fecha real del pago es obligatoria");

      // Pre-check anti-duplicado en el cliente (últimos 30 segundos)
      const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
      const { data: recentPagos } = await supabase
        .from("pagos")
        .select("id, monto, fecha_registro")
        .eq("mes_servicio_id", mesId!)
        .eq("monto", monto)
        .gte("fecha_registro", thirtySecondsAgo)
        .limit(1);

      if (recentPagos && recentPagos.length > 0) {
        throw new Error(
          "⚠️ Se detectó un pago idéntico registrado hace menos de 30 segundos. " +
          "Si el pago anterior falló, actualizá la página y verificá el historial antes de reintentar."
        );
      }

      const res = await supabase.functions.invoke("registrar-pago", {
        body: {
          mes_servicio_id: mesId, cliente_id: clienteId, monto,
          metodo_pago: pagoForm.metodo_pago,
          numero_recibo: pagoForm.metodo_pago === "efectivo" ? pagoForm.numero_recibo : null,
          notas: pagoForm.notas || null,
          fecha_pago_real: pagoForm.fecha_pago_real,
        },
      });
      if (res.error) {
        throw new Error(
          "⚠️ Hubo un problema de conexión con el servidor. El pago puede haberse registrado de todas formas. " +
          "Verificá en la lista de pagos antes de intentar nuevamente para evitar duplicados."
        );
      }
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["mes_servicio", mesId] });
      queryClient.invalidateQueries({ queryKey: ["pagos", mesId] });
      queryClient.invalidateQueries({ queryKey: ["meses_servicio"] });
      queryClient.invalidateQueries({ queryKey: ["cliente", clienteId] });
      if (data?.ya_procesado) {
        toast.warning("⚠️ Este pago ya estaba registrado. No se realizaron cambios.", {
          description: "Si creés que es un error, actualizá la página y verificá el historial de pagos.",
        });
      } else {
        let msg = "Pago registrado exitosamente 💰";
        if (data?.excedente_aplicado > 0 && data?.excedente_guardado_como_saldo_a_favor > 0) {
          msg = `Pago registrado 💰 $${data.excedente_aplicado.toLocaleString("es-AR")} aplicados a meses siguientes. $${data.excedente_guardado_como_saldo_a_favor.toLocaleString("es-AR")} guardados como saldo a favor.`;
        } else if (data?.excedente_aplicado > 0) {
          msg = `Pago registrado 💰 Excedente de $${data.excedente_aplicado.toLocaleString("es-AR")} aplicado a meses siguientes`;
        } else if (data?.excedente_guardado_como_saldo_a_favor > 0) {
          msg = `Pago registrado 💰 $${data.excedente_guardado_como_saldo_a_favor.toLocaleString("es-AR")} guardados como saldo a favor para el próximo plan anual`;
        }
        toast.success(msg);
      }
      setPagoForm({ monto: "", metodo_pago: "efectivo", numero_recibo: "", notas: "", fecha_pago_real: localDateString() });
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ["mes_servicio", mesId] });
      queryClient.invalidateQueries({ queryKey: ["pagos", mesId] });
      toast.error(err.message || "Error al registrar pago");
    },
    onSettled: () => {
      setSubmitLocked(false);
    },
  });

  const handleSubmitPago = () => {
    if (submitLocked || pagoMutation.isPending) return;
    setSubmitLocked(true);
    pagoMutation.mutate();
  };

  // Advertencia si el usuario intenta cerrar la pestaña durante un pago en proceso
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pagoMutation.isPending) {
        e.preventDefault();
        e.returnValue = "Hay un pago en proceso. ¿Estás seguro de que querés salir?";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [pagoMutation.isPending]);

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

  const saveQuincena = useMutation({
    mutationFn: async (params: { numero: 1 | 2; minutos_precaria: number; minutos_empadronada: number }) => {
      const res = await supabase.functions.invoke("guardar-quincena", {
        body: {
          mes_servicio_id: mesId,
          numero_quincena: params.numero,
          minutos_precaria: params.minutos_precaria,
          minutos_empadronada: params.minutos_empadronada,
        },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["mes_servicio", mesId] });
      queryClient.invalidateQueries({ queryKey: ["quincenas", mesId] });
      toast.success(`Quincena guardada ✅ Total: $${data?.total_mensual?.toLocaleString()} (Prec: ${data?.horas_precaria_final}h | Emp: ${data?.horas_empadronada_final}h)`);
    },
    onError: (err: any) => toast.error(err.message || "Error al guardar quincena"),
  });

  const overrideMutation = useMutation({
    mutationFn: async (params: { usa_override: boolean; monto_override?: number }) => {
      const updateData: any = { usa_override: params.usa_override };
      if (params.usa_override && params.monto_override != null) {
        updateData.monto_override = params.monto_override;
        updateData.total_calculado = params.monto_override;
        updateData.saldo_pendiente = Math.max(0, params.monto_override - Number(mes?.total_pagado || 0));
        updateData.estado_mes = updateData.saldo_pendiente <= 0 ? "pagado" : "pendiente";
      } else if (!params.usa_override) {
        const totalRiego = (Number(mes?.horas_precaria_final || 0) * Number(config?.valor_hora_discriminada || 0)) +
          (Number(mes?.horas_empadronada_final || 0) * Number(config?.valor_hora_no_discriminada || 0));
        const montoAdmin = totalRiego > 0 ? Number((mes as any)?.monto_administrativo || 0) : 0;
        const totalCalc = totalRiego + montoAdmin;
        updateData.total_calculado = totalCalc;
        updateData.saldo_pendiente = Math.max(0, Math.round((totalCalc - Number(mes?.total_pagado || 0)) * 100) / 100);
        updateData.estado_mes = updateData.saldo_pendiente <= 0 ? "pagado" : "pendiente";
        updateData.monto_override = null;
      }
      const { error } = await supabase.from("meses_servicio").update(updateData).eq("id", mesId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mes_servicio", mesId] });
      queryClient.invalidateQueries({ queryKey: ["meses_servicio"] });
      toast.success("Override actualizado ✅");
      setOverrideOpen(false);
    },
    onError: (err: any) => toast.error(err.message || "Error al aplicar override"),
  });

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
        mes_servicio_id: mesId, texto: obsText || null, imagen_url,
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

  const saldo = Number(mes?.saldo_pendiente ?? 0);
  const totalCalc = Number(mes?.total_calculado ?? 0);
  const totalPagado = Number(mes?.total_pagado ?? 0);
  const progreso = totalCalc > 0 ? (totalPagado / totalCalc) * 100 : 0;
  const pagado = mes?.estado_mes === "pagado";
  const suspendido = (mes as any)?.estado_servicio === "suspendido";
  const usaOverride = (mes as any)?.usa_override === true;

  // Navigate back preserving year
  const goBack = useCallback(() => {
    const selectedYear = (location.state as any)?.selectedYear;
    navigate(`/clientes/${clienteId}`, { state: selectedYear ? { selectedYear } : undefined });
  }, [navigate, clienteId, location.state]);

  return (
    <div>
      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />

      <div className="flex items-center gap-3 mb-6">
        <SidebarTrigger />
        <Button variant="ghost" size="icon" onClick={goBack}>
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
            {usaOverride && (
              <Badge variant="secondary" className="ml-2 text-[10px] bg-warning/20 text-warning-foreground">⚡ Override</Badge>
            )}
          </p>
        </div>

        {isAdmin && !suspendido && (
          <Dialog open={overrideOpen} onOpenChange={(open) => {
            setOverrideOpen(open);
            if (open) setOverrideValue(String((mes as any)?.monto_override || totalCalc));
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Pencil className="h-4 w-4 mr-2" /> {usaOverride ? "Editar Override" : "Monto Manual"}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>💰 Override de Monto Manual</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Al activar el override, el monto manual reemplaza el cálculo automático <strong>solo para este mes</strong>. El cálculo original se conserva.
                </p>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={usaOverride}
                    onCheckedChange={(checked) => {
                      if (!checked) {
                        overrideMutation.mutate({ usa_override: false });
                      }
                    }}
                  />
                  <Label>{usaOverride ? "Override activo" : "Override desactivado"}</Label>
                </div>
                <div>
                  <Label>Monto Manual ($)</Label>
                  <Input type="number" min="0" step="0.01" value={overrideValue} onChange={(e) => setOverrideValue(e.target.value)} />
                </div>
                <div className="p-3 rounded-lg bg-muted text-sm">
                  <p>📊 Cálculo automático: <strong>${calcPreview.totalMensual.toLocaleString()}</strong></p>
                  <p>💰 Monto manual: <strong>${(Number(overrideValue) || 0).toLocaleString()}</strong></p>
                </div>
                <Button className="w-full" onClick={() => {
                  const val = Number(overrideValue);
                  if (!Number.isFinite(val) || val < 0) { toast.error("Valor inválido"); return; }
                  overrideMutation.mutate({ usa_override: true, monto_override: val });
                }} disabled={overrideMutation.isPending}>
                  {overrideMutation.isPending ? "Aplicando..." : "Aplicar Override"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {isAdmin && !suspendido && !pagado && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm"><PauseCircle className="h-4 w-4 mr-2" /> Suspender</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Suspender servicio desde este mes?</AlertDialogTitle>
                <AlertDialogDescription>Este mes y todos los posteriores pendientes serán marcados como suspendidos con total $0.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => suspensionMutation.mutate("suspender")}>Suspender</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {isAdmin && suspendido && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm"><PlayCircle className="h-4 w-4 mr-2" /> Reactivar</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Reactivar servicio desde este mes?</AlertDialogTitle>
                <AlertDialogDescription>Este mes y los posteriores suspendidos serán reactivados y recalculados.</AlertDialogDescription>
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
          {/* Quincenas - admin only */}
          {isAdmin && !suspendido && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">📅 Ingreso de Quincenas (Minutos)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">Quincena 1</span>
                    {q1Data && <Badge variant="outline" className="text-[10px]">✅ Cargada</Badge>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Minutos Precaria</Label>
                      <Input type="number" min="0" step="1" placeholder="0"
                        value={q1Form.minutos_precaria || (q1Data ? String(q1Data.minutos_precaria) : "")}
                        onChange={(e) => setQ1Form(p => ({ ...p, minutos_precaria: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Minutos Empadronada</Label>
                      <Input type="number" min="0" step="1" placeholder="0"
                        value={q1Form.minutos_empadronada || (q1Data ? String(q1Data.minutos_empadronada) : "")}
                        onChange={(e) => setQ1Form(p => ({ ...p, minutos_empadronada: e.target.value }))}
                      />
                    </div>
                  </div>
                  <Button size="sm" className="w-full mt-2" onClick={() => saveQuincena.mutate({
                    numero: 1,
                    minutos_precaria: Number(q1Form.minutos_precaria || q1Data?.minutos_precaria || 0),
                    minutos_empadronada: Number(q1Form.minutos_empadronada || q1Data?.minutos_empadronada || 0),
                  })} disabled={saveQuincena.isPending}>
                    {saveQuincena.isPending ? "Guardando..." : "Guardar Q1"}
                  </Button>
                </div>

                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">Quincena 2</span>
                    {q2Data && <Badge variant="outline" className="text-[10px]">✅ Cargada</Badge>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Minutos Precaria</Label>
                      <Input type="number" min="0" step="1" placeholder="0"
                        value={q2Form.minutos_precaria || (q2Data ? String(q2Data.minutos_precaria) : "")}
                        onChange={(e) => setQ2Form(p => ({ ...p, minutos_precaria: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Minutos Empadronada</Label>
                      <Input type="number" min="0" step="1" placeholder="0"
                        value={q2Form.minutos_empadronada || (q2Data ? String(q2Data.minutos_empadronada) : "")}
                        onChange={(e) => setQ2Form(p => ({ ...p, minutos_empadronada: e.target.value }))}
                      />
                    </div>
                  </div>
                  <Button size="sm" className="w-full mt-2" onClick={() => saveQuincena.mutate({
                    numero: 2,
                    minutos_precaria: Number(q2Form.minutos_precaria || q2Data?.minutos_precaria || 0),
                    minutos_empadronada: Number(q2Form.minutos_empadronada || q2Data?.minutos_empadronada || 0),
                  })} disabled={saveQuincena.isPending}>
                    {saveQuincena.isPending ? "Guardando..." : "Guardar Q2"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Calculation Breakdown */}
          {config && !suspendido && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">🧮 Motor de Cálculo (Fórmula)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {usaOverride && (
                  <div className="p-3 rounded bg-warning/10 border border-warning/30 space-y-1">
                    <p className="font-medium">⚡ Override Activo</p>
                    <p>Monto manual: <strong>${Number((mes as any)?.monto_override || 0).toLocaleString()}</strong></p>
                    <p className="text-xs text-muted-foreground">El cálculo automático se muestra debajo como referencia.</p>
                  </div>
                )}
                <div className="p-3 rounded bg-muted/50 space-y-1">
                  <p className="font-medium">📊 Precaria</p>
                  <p>Q1: {Number(q1Form.minutos_precaria || q1Data?.minutos_precaria || 0)} min + Q2: {Number(q2Form.minutos_precaria || q2Data?.minutos_precaria || 0)} min = <strong>{calcPreview.totalMinPrec} min</strong></p>
                  <p>{calcPreview.totalMinPrec} min ÷ 60 = {calcPreview.horasDecPrec.toFixed(2)} h → CEIL → <strong>{calcPreview.horasFinalPrec} h</strong></p>
                  <p>{calcPreview.horasFinalPrec} h × ${calcPreview.valorHoraPrec.toLocaleString()}/h = <strong>${calcPreview.totalPrec.toLocaleString()}</strong></p>
                </div>
                <div className="p-3 rounded bg-muted/50 space-y-1">
                  <p className="font-medium">📊 Empadronada</p>
                  <p>Q1: {Number(q1Form.minutos_empadronada || q1Data?.minutos_empadronada || 0)} min + Q2: {Number(q2Form.minutos_empadronada || q2Data?.minutos_empadronada || 0)} min = <strong>{calcPreview.totalMinEmp} min</strong></p>
                  <p>{calcPreview.totalMinEmp} min ÷ 60 = {calcPreview.horasDecEmp.toFixed(2)} h → CEIL → <strong>{calcPreview.horasFinalEmp} h</strong></p>
                  <p>{calcPreview.horasFinalEmp} h × ${calcPreview.valorHoraEmp.toLocaleString()}/h = <strong>${calcPreview.totalEmp.toLocaleString()}</strong></p>
                </div>
                <hr />
                {calcPreview.montoAdmin > 0 && (
                  <div className="p-3 rounded bg-muted/50 space-y-1">
                    <p className="font-medium">📋 Gestión Administrativa</p>
                    <p><strong>${calcPreview.montoAdmin.toLocaleString()}</strong></p>
                  </div>
                )}
                {calcPreview.montoAdmin === 0 && (calcPreview.totalPrec + calcPreview.totalEmp) === 0 && (
                  <div className="p-3 rounded bg-muted/50 space-y-1 text-muted-foreground">
                    <p className="text-xs">📋 Admin fee: $0 (no se aplica porque el monto base es $0)</p>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base">
                  <span>Total Mensual {usaOverride ? "(Calculado)" : ""}</span>
                  <span>${calcPreview.totalMensual.toLocaleString()}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">Fórmula: CEIL(total_min/60) × $/hora + Admin (si base &gt; 0)</p>
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

          {/* Payment form - admin only */}
          {isAdmin && !suspendido && pagado && (
            <Card>
              <CardContent className="p-4 text-center text-success font-medium">
                ✅ Este mes está completamente pagado.
              </CardContent>
            </Card>
          )}
          {isAdmin && !suspendido && !pagado && (
            <Card>
              <CardHeader><CardTitle className="text-base">💰 Registrar Pago</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Monto ($)</Label>
                  <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={pagoForm.monto} onChange={(e) => setPagoForm((p) => ({ ...p, monto: e.target.value }))} />
                  {Number(pagoForm.monto) > saldo && saldo > 0 && (
                    <p className="text-xs text-warning mt-1">⚠️ El monto excede el saldo. El excedente (${(Number(pagoForm.monto) - saldo).toLocaleString()}) se aplicará a meses siguientes.</p>
                  )}
                </div>
                <div>
                  <Label>📅 Fecha real del pago</Label>
                  <Input type="date" value={pagoForm.fecha_pago_real} onChange={(e) => setPagoForm((p) => ({ ...p, fecha_pago_real: e.target.value }))} max={localDateString()} />
                  <p className="text-xs text-muted-foreground mt-1">
                    Ingresá la fecha en que el cliente realizó el pago. Puede diferir de la fecha de ingreso al sistema.
                  </p>
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
                <div><Label>Notas (opcional)</Label><Input placeholder="Observaciones..." value={pagoForm.notas} onChange={(e) => setPagoForm((p) => ({ ...p, notas: e.target.value }))} /></div>
                <Button className="w-full" onClick={handleSubmitPago} disabled={submitLocked || pagoMutation.isPending}>
                  <CreditCard className="h-4 w-4 mr-2" />
                  {(submitLocked || pagoMutation.isPending) ? "Registrando..." : "Registrar Pago"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Observations */}
          <Card>
            <CardHeader><CardTitle className="text-base">📝 Observaciones</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {isAdmin && (
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
              )}
              {observaciones && observaciones.length > 0 && (
                <div className="space-y-3 border-t pt-3">
                  {observaciones.map((obs: any) => (
                    <div key={obs.id} className="p-3 rounded-lg bg-muted/50 text-sm">
                      {obs.texto && <p>{obs.texto}</p>}
                      {obs.imagen_url && (
                        <img
                          src={obs.imagen_url}
                          alt="Observación"
                          className="mt-2 rounded max-h-48 object-cover cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setLightboxSrc(obs.imagen_url)}
                        />
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
          <CardHeader><CardTitle className="text-base">📋 Historial de Pagos</CardTitle></CardHeader>
          <CardContent>
            {pagos && pagos.length > 0 ? (
              <div className="space-y-3">
                {pagos.map((p, i) => (
                  <motion.div key={p.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
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
                        Pago realizado: {new Date((p as any).fecha_pago_real + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}
                      </p>
                      {(p as any).fecha_registro && (
                        <p className="text-[10px] text-muted-foreground/80">
                          Ingresado al sistema: {new Date((p as any).fecha_registro).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
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
