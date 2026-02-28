import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Outlet } from "react-router-dom";

export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <div className="container py-6 px-4 md:px-8 max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
