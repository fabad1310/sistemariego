
-- =============================================
-- REFACTORIZACIÓN GLOBAL - MIGRACIÓN ESTRUCTURAL
-- =============================================

-- 1. PAGOS: Agregar fecha_pago_real (fecha real del pago ingresada por el usuario)
ALTER TABLE public.pagos ADD COLUMN fecha_pago_real DATE NOT NULL DEFAULT CURRENT_DATE;
CREATE INDEX idx_pagos_fecha_pago_real ON public.pagos(fecha_pago_real);

-- 2. MESES_SERVICIO: Agregar columnas para override manual de montos
ALTER TABLE public.meses_servicio ADD COLUMN monto_override NUMERIC NULL;
ALTER TABLE public.meses_servicio ADD COLUMN usa_override BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. CLIENTES: Eliminar restricción UNIQUE en DNI (un cliente puede tener múltiples propiedades)
ALTER TABLE public.clientes DROP CONSTRAINT clientes_dni_key;

-- 4. UNIQUE constraint en meses_servicio(cliente_id, anio, mes) ya existe - verificado
-- meses_servicio_cliente_id_anio_mes_key ya está en su lugar
