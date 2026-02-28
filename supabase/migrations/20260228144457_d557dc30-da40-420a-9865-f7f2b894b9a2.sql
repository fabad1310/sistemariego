
-- =============================================
-- Sistema de Gestión Integral de Riego Agrícola
-- =============================================

-- 1. CLIENTES
CREATE TABLE public.clientes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  dni TEXT NOT NULL UNIQUE,
  telefono TEXT,
  email TEXT,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. CONFIGURACION ANUAL DE RIEGO
CREATE TABLE public.configuracion_riego_cliente (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  anio INTEGER NOT NULL,
  horas_totales_mes NUMERIC(10,2) NOT NULL,
  horas_discriminadas NUMERIC(10,2) NOT NULL,
  horas_no_discriminadas NUMERIC(10,2) NOT NULL,
  valor_hora_discriminada NUMERIC(12,2) NOT NULL,
  valor_hora_no_discriminada NUMERIC(12,2) NOT NULL,
  fecha_configuracion DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cliente_id, anio)
);

-- 3. MESES DE SERVICIO
CREATE TABLE public.meses_servicio (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  configuracion_id UUID NOT NULL REFERENCES public.configuracion_riego_cliente(id) ON DELETE CASCADE,
  anio INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes >= 1 AND mes <= 12),
  total_calculado NUMERIC(12,2) NOT NULL,
  total_pagado NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_pendiente NUMERIC(12,2) NOT NULL,
  estado_mes TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_mes IN ('pendiente', 'pagado')),
  fecha_generacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cliente_id, anio, mes)
);

-- 4. PAGOS
CREATE TABLE public.pagos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  mes_servicio_id UUID NOT NULL REFERENCES public.meses_servicio(id) ON DELETE CASCADE,
  monto NUMERIC(12,2) NOT NULL,
  metodo_pago TEXT NOT NULL CHECK (metodo_pago IN ('efectivo', 'transferencia')),
  numero_recibo TEXT,
  fecha_transferencia DATE,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now(),
  notas TEXT
);

-- Trigger para updated_at en clientes
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_clientes_updated_at
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for performance
CREATE INDEX idx_configuracion_cliente ON public.configuracion_riego_cliente(cliente_id);
CREATE INDEX idx_meses_cliente ON public.meses_servicio(cliente_id);
CREATE INDEX idx_meses_config ON public.meses_servicio(configuracion_id);
CREATE INDEX idx_pagos_mes ON public.pagos(mes_servicio_id);
CREATE INDEX idx_pagos_cliente ON public.pagos(cliente_id);

-- RLS: Since no auth for now, allow all operations (public system)
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion_riego_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meses_servicio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;

-- Public access policies (no auth required for now)
CREATE POLICY "Allow all on clientes" ON public.clientes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on configuracion" ON public.configuracion_riego_cliente FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on meses" ON public.meses_servicio FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on pagos" ON public.pagos FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.clientes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meses_servicio;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pagos;
