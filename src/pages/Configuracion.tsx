import { useState } from "react";
import JSZip from "jszip";
import { Settings as SettingsIcon, Database, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { fetchAllPages } from "@/lib/fetchAll";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

// Tablas públicas a respaldar (todas las tablas de negocio del sistema)
const TABLAS = [
  "clientes",
  "configuracion_global",
  "configuracion_riego_cliente",
  "gastos",
  "meses_servicio",
  "observaciones_gasto",
  "observaciones_mes",
  "pagos",
  "quincenas_servicio",
] as const;

function toCSV(rows: any[]): string {
  if (!rows || rows.length === 0) return "";
  const headerSet = new Set<string>();
  for (const r of rows) {
    Object.keys(r ?? {}).forEach((k) => headerSet.add(k));
  }
  const headers: string[] = Array.from(headerSet);
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") v = JSON.stringify(v);
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape((row as any)[h])).join(","));
  }
  return lines.join("\n");
}

export default function Configuracion() {
  const { isAdmin } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [progreso, setProgreso] = useState<string>("");

  if (!isAdmin) return <Navigate to="/" replace />;

  const handleDescargar = async () => {
    if (downloading) return;
    setDownloading(true);
    setProgreso("Iniciando respaldo...");

    try {
      const zip = new JSZip();
      const fecha = new Date();
      const stamp =
        fecha.toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" })
          .replace(/[: ]/g, "-");

      const resumen: Record<string, number> = {};

      for (const tabla of TABLAS) {
        setProgreso(`Descargando ${tabla}...`);
        const rows = await fetchAllPages<any>(tabla, "*");
        resumen[tabla] = rows.length;

        // JSON completo (preserva tipos)
        zip.file(`json/${tabla}.json`, JSON.stringify(rows, null, 2));
        // CSV legible
        zip.file(`csv/${tabla}.csv`, toCSV(rows));
      }

      // Metadata del respaldo
      const metadata = {
        sistema: "Riego Miraflores",
        generado_en: fecha.toISOString(),
        zona_horaria: "America/Argentina/Buenos_Aires",
        total_tablas: TABLAS.length,
        registros_por_tabla: resumen,
        total_registros: Object.values(resumen).reduce((a, b) => a + b, 0),
      };
      zip.file("METADATA.json", JSON.stringify(metadata, null, 2));

      const readme = `RESPALDO BASE DE DATOS - RIEGO MIRAFLORES
Generado: ${fecha.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}

Contenido:
- /json/  -> archivos JSON con todos los registros (preserva tipos)
- /csv/   -> archivos CSV legibles en Excel
- METADATA.json -> resumen del respaldo

Tablas incluidas (${TABLAS.length}):
${TABLAS.map((t) => `  - ${t}: ${resumen[t]} registros`).join("\n")}

Total registros: ${metadata.total_registros}
`;
      zip.file("README.txt", readme);

      setProgreso("Comprimiendo archivo...");
      const blob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `respaldo-riego-miraflores-${stamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Respaldo descargado",
        description: `${metadata.total_registros} registros en ${TABLAS.length} tablas.`,
      });
      setProgreso("");
    } catch (err: any) {
      console.error("[Configuracion] Error en respaldo:", err);
      toast({
        title: "Error al generar respaldo",
        description: err?.message ?? "Error desconocido",
        variant: "destructive",
      });
      setProgreso("");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <SettingsIcon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
          <p className="text-sm text-muted-foreground">Opciones administrativas del sistema</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <CardTitle>Respaldo de la base de datos</CardTitle>
          </div>
          <CardDescription>
            Descarga un archivo ZIP con todos los datos del sistema hasta el momento actual.
            Incluye todas las tablas en formato JSON y CSV, sin límite de filas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Tablas incluidas:</p>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 list-disc list-inside">
              {TABLAS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>

          <Button
            onClick={handleDescargar}
            disabled={downloading}
            size="lg"
            className="w-full sm:w-auto"
          >
            {downloading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {progreso || "Procesando..."}
              </>
            ) : (
              <>
                <Database className="mr-2 h-4 w-4" />
                Descargar base de datos hasta la fecha
              </>
            )}
          </Button>

          {downloading && progreso && (
            <p className="text-xs text-muted-foreground">{progreso}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
