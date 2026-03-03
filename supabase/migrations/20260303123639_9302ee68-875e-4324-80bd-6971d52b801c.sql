ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS saldo_a_favor NUMERIC(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.clientes.saldo_a_favor IS
  'Excedente de pagos que no pudo aplicarse a meses existentes porque el plan del siguiente año aún no fue creado. Se aplica automáticamente al crear un nuevo plan anual.';