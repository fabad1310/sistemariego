ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS codigo_regante TEXT UNIQUE;

DO $$
DECLARE
  rec RECORD;
  nuevo_codigo TEXT;
  intentos INT;
BEGIN
  FOR rec IN SELECT id FROM public.clientes WHERE codigo_regante IS NULL LOOP
    intentos := 0;
    LOOP
      nuevo_codigo := array_to_string(
        ARRAY(
          SELECT substring('ABCDEFGHJKMNPQRSTUVWXYZ23456789', floor(random()*31)::int + 1, 1)
          FROM generate_series(1, 5)
        ), ''
      );
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.clientes WHERE codigo_regante = nuevo_codigo
      );
      intentos := intentos + 1;
      IF intentos > 100 THEN
        RAISE EXCEPTION 'No se pudo generar código único para cliente %', rec.id;
      END IF;
    END LOOP;
    UPDATE public.clientes SET codigo_regante = nuevo_codigo WHERE id = rec.id;
  END LOOP;
END $$;

ALTER TABLE public.clientes
  ALTER COLUMN codigo_regante SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_codigo_regante
  ON public.clientes (codigo_regante);