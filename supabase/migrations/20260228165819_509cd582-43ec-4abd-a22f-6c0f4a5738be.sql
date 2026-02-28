
-- CAMBIO 1: Add new client fields
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS titular_riego text,
  ADD COLUMN IF NOT EXISTS nombre_dueno text,
  ADD COLUMN IF NOT EXISTS nombre_propiedad text,
  ADD COLUMN IF NOT EXISTS nombre_regante text;

-- CAMBIO 2: Create quincenas_servicio table
CREATE TABLE public.quincenas_servicio (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mes_servicio_id uuid NOT NULL REFERENCES public.meses_servicio(id) ON DELETE CASCADE,
  numero_quincena integer NOT NULL CHECK (numero_quincena IN (1, 2)),
  minutos_precaria numeric NOT NULL DEFAULT 0,
  minutos_empadronada numeric NOT NULL DEFAULT 0,
  valor_minuto_precaria numeric NOT NULL DEFAULT 0,
  valor_minuto_empadronada numeric NOT NULL DEFAULT 0,
  subtotal_calculado numeric NOT NULL DEFAULT 0,
  fecha_registro timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT unique_quincena_per_mes UNIQUE(mes_servicio_id, numero_quincena)
);

ALTER TABLE public.quincenas_servicio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on quincenas" ON public.quincenas_servicio
  FOR ALL USING (true) WITH CHECK (true);

-- CAMBIO 4: Add estado_servicio to meses_servicio
ALTER TABLE public.meses_servicio
  ADD COLUMN IF NOT EXISTS estado_servicio text NOT NULL DEFAULT 'activo';

-- CAMBIO 6: Create observaciones_mes table
CREATE TABLE public.observaciones_mes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mes_servicio_id uuid NOT NULL REFERENCES public.meses_servicio(id) ON DELETE CASCADE,
  texto text,
  imagen_url text,
  fecha_creacion timestamp with time zone NOT NULL DEFAULT now(),
  usuario_creador text
);

ALTER TABLE public.observaciones_mes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on observaciones" ON public.observaciones_mes
  FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for observation images
INSERT INTO storage.buckets (id, name, public)
VALUES ('observaciones', 'observaciones', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read observaciones" ON storage.objects
  FOR SELECT USING (bucket_id = 'observaciones');

CREATE POLICY "Anyone can upload observaciones" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'observaciones');

CREATE POLICY "Anyone can delete observaciones" ON storage.objects
  FOR DELETE USING (bucket_id = 'observaciones');

-- Index for performance
CREATE INDEX idx_quincenas_mes_servicio ON public.quincenas_servicio(mes_servicio_id);
CREATE INDEX idx_observaciones_mes_servicio ON public.observaciones_mes(mes_servicio_id);
CREATE INDEX idx_meses_estado_servicio ON public.meses_servicio(estado_servicio);
