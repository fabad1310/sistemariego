import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useReganteSesion } from "@/contexts/ReganteSesionContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Droplets, LogIn, KeyRound } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { signIn } = useAuth();
  const { iniciarSesionRegante } = useReganteSesion();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [codigoRegante, setCodigoRegante] = useState("");
  const [loadingRegante, setLoadingRegante] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error("Complete usuario y contraseña");
      return;
    }
    setLoading(true);
    try {
      await signIn(username, password);
      toast.success("Bienvenido 🌱");
    } catch (err: any) {
      toast.error("Credenciales inválidas");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRegante = async (e: React.FormEvent) => {
    e.preventDefault();
    const codigo = codigoRegante.trim().toUpperCase();
    if (codigo.length !== 5) {
      toast.error("El código debe tener 5 caracteres");
      return;
    }
    setLoadingRegante(true);
    try {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nombre, apellido, estado")
        .eq("codigo_regante", codigo)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast.error("Código inválido. Verificá el código de regante.");
        return;
      }
      if (data.estado === "inactivo") {
        toast.error("Tu cuenta está inactiva. Contactá a la administración.");
        return;
      }
      iniciarSesionRegante(data.id, data.nombre, data.apellido);
      toast.success(`Bienvenido ${data.nombre} 🌱`);
      navigate("/mi-cuenta", { replace: true });
    } catch (err: any) {
      toast.error("No se pudo validar el código. Intentá nuevamente.");
    } finally {
      setLoadingRegante(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Droplets className="h-[40px] w-[40px]" />
            </div>
          </div>
          <CardTitle className="text-xl">Riego Miraflores</CardTitle>
          <p className="text-sm text-muted-foreground">Sistema de Gestión de Riego</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                placeholder="admin / visita"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Ingresando..." :
              <>
                <LogIn className="h-4 w-4 mr-2" /> Ingresar
              </>
              }
            </Button>
          </form>

          {/* Separador */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              o ingresá como regante
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmitRegante} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="codigo-regante">Código de Regante</Label>
              <Input
                id="codigo-regante"
                placeholder="Ej: A3K7M"
                value={codigoRegante}
                onChange={(e) => setCodigoRegante(e.target.value.toUpperCase().slice(0, 5))}
                maxLength={5}
                autoComplete="off"
                className="font-mono tracking-widest text-center uppercase"
              />
            </div>
            <Button type="submit" variant="outline" className="w-full" disabled={loadingRegante}>
              {loadingRegante ? "Validando..." :
              <>
                <KeyRound className="h-4 w-4 mr-2" /> Ingresar como Regante
              </>
              }
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>);
}
