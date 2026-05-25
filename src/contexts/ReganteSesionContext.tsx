import { createContext, useContext, useState, ReactNode } from "react";

interface ReganteSesionType {
  clienteId: string | null;
  clienteNombre: string | null;
  clienteApellido: string | null;
  isReganteSesion: boolean;
  iniciarSesionRegante: (clienteId: string, nombre: string, apellido: string) => void;
  cerrarSesionRegante: () => void;
}

const ReganteSesionContext = createContext<ReganteSesionType | undefined>(undefined);

export function ReganteSesionProvider({ children }: { children: ReactNode }) {
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteNombre, setClienteNombre] = useState<string | null>(null);
  const [clienteApellido, setClienteApellido] = useState<string | null>(null);

  const iniciarSesionRegante = (id: string, nombre: string, apellido: string) => {
    setClienteId(id);
    setClienteNombre(nombre);
    setClienteApellido(apellido);
  };

  const cerrarSesionRegante = () => {
    setClienteId(null);
    setClienteNombre(null);
    setClienteApellido(null);
  };

  return (
    <ReganteSesionContext.Provider
      value={{
        clienteId,
        clienteNombre,
        clienteApellido,
        isReganteSesion: clienteId !== null,
        iniciarSesionRegante,
        cerrarSesionRegante,
      }}
    >
      {children}
    </ReganteSesionContext.Provider>
  );
}

export function useReganteSesion() {
  const ctx = useContext(ReganteSesionContext);
  if (!ctx) throw new Error("useReganteSesion must be used within ReganteSesionProvider");
  return ctx;
}
