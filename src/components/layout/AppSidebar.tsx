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
import { LayoutDashboard, Users, FileBarChart, Droplets, Sun, Moon, Receipt, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { title: "Dashboard", icon: LayoutDashboard, path: "/" },
  { title: "Clientes", icon: Users, path: "/clientes" },
  { title: "Gastos", icon: Receipt, path: "/gastos" },
  { title: "Reportes", icon: FileBarChart, path: "/reportes" },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, isAdmin, isReadOnly, user } = useAuth();
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
            <span className="text-sm font-bold tracking-tight">AquaGest</span>
            <span className="text-[10px] text-sidebar-foreground/60">Gestión de Riego</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarMenu>
          {navItems.map((item) => {
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
