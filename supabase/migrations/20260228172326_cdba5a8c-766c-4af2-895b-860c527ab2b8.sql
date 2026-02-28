
-- CAMBIO 1: Remove duplicate titular_riego column (all values are NULL, safe to drop)
ALTER TABLE public.clientes DROP COLUMN IF EXISTS titular_riego;

-- CAMBIO 3: Create gastos table
CREATE TABLE public.gastos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre_gasto TEXT NOT NULL,
  monto NUMERIC NOT NULL,
  metodo_pago TEXT NOT NULL,
  numero_recibo TEXT,
  fecha_transferencia DATE,
  pagado_por TEXT NOT NULL,
  fecha_pago DATE NOT NULL,
  fecha_registro TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  estado TEXT NOT NULL DEFAULT 'confirmado'
);

-- Enable RLS
ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on gastos" ON public.gastos
  FOR ALL USING (true) WITH CHECK (true);

-- Create observaciones_gasto table
CREATE TABLE public.observaciones_gasto (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gasto_id UUID NOT NULL REFERENCES public.gastos(id) ON DELETE CASCADE,
  texto TEXT,
  imagen_url TEXT,
  fecha_creacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.observaciones_gasto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on observaciones_gasto" ON public.observaciones_gasto
  FOR ALL USING (true) WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_gastos_fecha_pago ON public.gastos(fecha_pago DESC);
CREATE INDEX idx_gastos_estado ON public.gastos(estado);
CREATE INDEX idx_observaciones_gasto_gasto_id ON public.observaciones_gasto(gasto_id);
