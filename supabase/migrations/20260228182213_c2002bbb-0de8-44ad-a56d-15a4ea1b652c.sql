
-- Add integer hour result columns to meses_servicio
ALTER TABLE public.meses_servicio 
  ADD COLUMN IF NOT EXISTS horas_precaria_final integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS horas_empadronada_final integer NOT NULL DEFAULT 0;

-- Drop rate/subtotal columns from quincenas_servicio (rates now live in config only)
ALTER TABLE public.quincenas_servicio 
  DROP COLUMN IF EXISTS valor_minuto_precaria,
  DROP COLUMN IF EXISTS valor_minuto_empadronada,
  DROP COLUMN IF EXISTS subtotal_calculado;
