
# Plan de implementación — Limpieza, anti-duplicado y mejoras de integridad

Cambios quirúrgicos sin tocar lógica de negocio que ya funciona. Cada paso es trazable y reversible.

---

## 1. Eliminar `fecha_transferencia` de la tabla `pagos`

**Migración SQL:**
```sql
ALTER TABLE public.pagos DROP COLUMN IF EXISTS fecha_transferencia;
```

**`supabase/functions/registrar-pago/index.ts`:**
- Quitar `fecha_transferencia` del destructuring del body.
- Eliminar bloque de validación `if (metodo_pago === "transferencia") { if (!fecha_transferencia...) }`. Para transferencia ya no se exige nada extra (solo `monto`, `metodo_pago`, `fecha_pago_real`).
- En la query anti-duplicado de transferencias, reemplazar `.eq("fecha_transferencia", fecha_transferencia)` por `.eq("fecha_pago_real", fecha_pago_real)`.
- En el `.insert()` principal y en el loop de excedentes, quitar `fecha_transferencia: ...`.
- Agregar comentarios:
  ```ts
  // fecha_pago_real: fecha en que el cliente pagó (ingresada por el operador)
  // fecha_registro: generada automáticamente (timestamp del servidor)
  ```

**`src/pages/MesDetalle.tsx`:**
- Quitar `fecha_transferencia: ""` del estado `pagoForm` y del `setPagoForm` de reset.
- Quitar la validación `if (pagoForm.metodo_pago === "transferencia" && !pagoForm.fecha_transferencia)`.
- Quitar `fecha_transferencia` del body enviado a `registrar-pago`.
- Eliminar el bloque JSX `{pagoForm.metodo_pago === "transferencia" && (<div>...Fecha de Transferencia...</div>)}`.

**`src/integrations/supabase/types.ts`:** se regenera automáticamente tras la migración.

**Nota:** la tabla `gastos` mantiene su `fecha_transferencia` intacta (módulo independiente).

---

## 2. Nomenclatura oficial de fechas (UI)

En `MesDetalle.tsx`:
- Label del input de fecha: `📅 Fecha real del pago`.
- Texto de ayuda debajo del campo: *"Ingresá la fecha en que el cliente realizó el pago. Puede diferir de la fecha de ingreso al sistema."*
- En el historial de pagos: mostrar `fecha_pago_real` con prefijo **"Pago realizado:"** y `fecha_registro` debajo en pequeño/muted con prefijo **"Ingresado al sistema:"**.

---

## 3. Carga visual de clientes top-down (`Clientes.tsx`)

- Skeleton loader: pasar de 3 a 6 cards.
- Cambiar animación de entrada: `initial={{ opacity: 0, y: -10 }}`.
- Delay progresivo más rápido y escalonado: `transition={{ delay: i < 20 ? 0 : (i - 20) * 0.03 }}`.
- `useEffect` que haga `window.scrollTo({ top: 0, behavior: 'smooth' })` cuando cambian `search` o `filtroEstado`.

---

## 4. Anti-duplicado de pagos (doble capa)

**Frontend (`MesDetalle.tsx`):**
- Estado local `submitLocked` que se activa al primer click y se libera en `onSettled`.
- Pre-check antes del invoke: query a `pagos` por `mes_servicio_id` + `monto` + `fecha_registro >= now() - 30s`. Si existe, lanzar error claro al usuario.
- Toast diferenciado cuando el server devuelve `ya_procesado: true` (warning con descripción).
- Ocultar el formulario de pago cuando `pagado === true` y mostrar en su lugar una card verde: *"✅ Este mes está completamente pagado."*
- `useEffect` con `beforeunload` mientras `pagoMutation.isPending` para advertir si el usuario intenta cerrar la pestaña.
- Validaciones de monto adicionales: positivo, finito, ≤ 100.000.000.

**Backend (`registrar-pago/index.ts`):**
- Check anti-duplicado adicional independiente del método: mismo `mes_servicio_id` + `monto` + `fecha_pago_real` registrado en los últimos 60s → devolver `ya_procesado: true`.
- Pequeño `await new Promise(r => setTimeout(r, 100))` después del primer insert antes de procesar excedentes (mitigar race conditions).
- Usar `Math.round((x) * 100) / 100` en cálculos de saldo para evitar punto flotante.

---

## 5. Saldo a favor — visibilidad y robustez

**`crear-plan-anual/index.ts`:**
- Confirmar orden cronológico (ya está: `sort((a,b) => a.mes - b.mes)`).
- Agregar log: `[crear-plan-anual] Saldo a favor antes: $X. Meses creados: N. Aplicado: $Y. Restante: $Z`.
- Asegurar `Math.max(0, ...)` al actualizar `saldo_a_favor` del cliente.
- Mantener atomicidad: cualquier error en aplicación de saldo lanza con mensaje claro.

**`ClienteDetalle.tsx`:**
- Si `cliente.saldo_a_favor > 0`, mostrar badge informativo en la cabecera del cliente:
  ```
  💰 Saldo a favor disponible: $X — Se aplicará automáticamente al crear el próximo plan anual
  ```
- En el dialog de "Crear Plan Anual", si hay saldo > 0, mostrar aviso azul antes de confirmar:
  ```
  ℹ️ Se aplicarán automáticamente $X de saldo a favor a los primeros meses de este plan.
  ```

---

## 6. Correcciones de integridad adicionales

- **`guardar-quincena/index.ts`:** si `mes.estado_mes === "pagado"`, no recalcular el total (devolver mensaje claro). Mantener verificación de existencia del mes (ya existe).
- **`MesDetalle.tsx` overrideMutation:** envolver `saldo_pendiente` con redondeo:
  ```ts
  Math.max(0, Math.round((totalCalc - Number(mes?.total_pagado || 0)) * 100) / 100)
  ```

---

## Archivos a modificar

| Archivo | Cambios |
|---|---|
| Migración SQL | DROP COLUMN `fecha_transferencia` en `pagos` |
| `supabase/functions/registrar-pago/index.ts` | Quitar `fecha_transferencia`, check 60s extra, pausa 100ms, redondeo |
| `supabase/functions/crear-plan-anual/index.ts` | Logging mejorado, `Math.max(0,...)` en saldo restante |
| `supabase/functions/guardar-quincena/index.ts` | Bloquear recálculo si el mes está pagado |
| `src/pages/MesDetalle.tsx` | Quitar `fecha_transferencia`, labels, pre-check 30s, `submitLocked`, beforeunload, ocultar form si pagado, redondeo override, validación monto |
| `src/pages/Clientes.tsx` | 6 skeletons, animación top-down, scroll al top, delay escalonado |
| `src/pages/ClienteDetalle.tsx` | Badge saldo a favor + aviso en dialog crear plan |

---

## Reglas de seguridad respetadas

- No se eliminan datos (solo una columna redundante de la tabla `pagos`).
- Toda lógica de negocio existente queda intacta.
- Errores en español argentino con `toast.error()`.
- Logs `console.log` en edge functions críticas.
- Se mantiene `localDateString()` para fechas locales (UTC-3).
- CORS y validación de `isAdmin` sin cambios.
- Tras los cambios, búsqueda global confirmará que no quedan referencias rotas a `fecha_transferencia` en el contexto de `pagos`.
