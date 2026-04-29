import { useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { LayoutDashboard, Users, FileBarChart, Droplets, Sun, Moon, Receipt, LogOut, Download, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { useIsMobile } from "@/hooks/use-mobile";

const navItems = [
  { title: "Dashboard", icon: LayoutDashboard, path: "/" },
  { title: "Clientes", icon: Users, path: "/clientes" },
  { title: "Gastos", icon: Receipt, path: "/gastos" },
  { title: "Reportes", icon: FileBarChart, path: "/reportes" },
  { title: "Configuración", icon: Settings, path: "/configuracion", adminOnly: true },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, isAdmin, isReadOnly, user } = useAuth();
  const { install, canInstall, isIOS, isAndroid, hasNativePrompt } = usePWAInstall();
  const isMobile = useIsMobile();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const displayName = user?.email?.split("@")[0] ?? "usuario";

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Droplets className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight">Riego Miraflores</span>
            <span className="text-[10px] text-sidebar-foreground/60">Sistema de Gestión</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarMenu>
          {navItems.filter((i) => !i.adminOnly || isAdmin).map((item) => {
            const isActive =
              item.path === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.path);
            return (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  isActive={isActive}
                  onClick={() => navigate(item.path)}
                  tooltip={item.title}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="p-3 space-y-2">
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-sidebar-foreground/70">
          <span className="font-medium capitalize">{displayName}</span>
          <Badge variant={isAdmin ? "default" : "secondary"} className="text-[9px] px-1.5 py-0">
            {isAdmin ? "ADMIN" : "VISITA"}
          </Badge>
        </div>
        {isMobile && canInstall && (
          <button
            onClick={async () => {
              if (isIOS) {
                alert(
                  "📲 Para instalar en iPhone/iPad:\n\n" +
                    "1. Tocá el ícono de Compartir (cuadrado con flecha ↑) en Safari\n" +
                    '2. Deslizá y tocá "Agregar a pantalla de inicio"\n' +
                    '3. Tocá "Agregar"'
                );
              } else if (hasNativePrompt) {
                await install();
              } else if (isAndroid) {
                alert(
                  "📲 Para instalar en Android:\n\n" +
                    "1. Abrí el menú del navegador (⋮ arriba a la derecha)\n" +
                    '2. Tocá "Instalar app" o "Agregar a pantalla de inicio"\n' +
                    '3. Confirmá tocando "Instalar"\n\n' +
                    "Si no ves la opción, asegurate de estar usando Chrome y que la página esté abierta directamente (no dentro de otra app)."
                );
              }
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>Instalar app en mi teléfono</span>
          </button>
        )}
        <button
          onClick={() => setDark(!dark)}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span>{dark ? "Modo claro" : "Modo oscuro"}</span>
        </button>
        <button
          onClick={() => signOut()}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>Cerrar sesión</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
