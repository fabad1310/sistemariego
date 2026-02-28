
-- Table for global configuration (admin fee, etc.)
CREATE TABLE public.configuracion_global (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clave text NOT NULL UNIQUE,
  valor numeric NOT NULL DEFAULT 0,
  descripcion text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.configuracion_global ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on configuracion_global" ON public.configuracion_global FOR ALL USING (true) WITH CHECK (true);

-- Insert default admin fee
INSERT INTO public.configuracion_global (clave, valor, descripcion)
VALUES ('monto_administrativo', 1000, 'Monto de gestión administrativa mensual aplicado a cada mes pendiente');

-- Add monto_administrativo column to meses_servicio
ALTER TABLE public.meses_servicio ADD COLUMN monto_administrativo numeric NOT NULL DEFAULT 0;
