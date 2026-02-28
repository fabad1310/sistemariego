

# 🌊 Sistema de Gestión Integral de Riego Agrícola

## Visión General
Sistema empresarial completo para gestionar clientes, configuraciones anuales de riego, generación automática de meses de servicio, registro de pagos con manejo de excedentes, y reportes financieros. Estilo visual azul/profesional tipo SaaS premium, sin autenticación por ahora.

---

## 🗄 Base de Datos (Lovable Cloud / Supabase)

### Tablas
- **clientes** — datos personales, DNI único, estado activo/inactivo
- **configuracion_riego_cliente** — configuración anual por cliente (horas, valores), con constraint UNIQUE(cliente_id, año)
- **meses_servicio** — 12 meses generados automáticamente al crear configuración, con total_calculado, total_pagado, saldo_pendiente, estado
- **pagos** — registro de pagos vinculados a mes_servicio, con campos condicionales según método de pago (efectivo → recibo, transferencia → fecha)

### Lógica en Edge Functions
- **Generación automática de meses**: al crear configuración anual, genera los 12 meses con cálculos automáticos
- **Registro de pagos transaccional**: actualiza saldo, maneja excedentes que se aplican a meses siguientes automáticamente, todo en una transacción
- **Validaciones**: no pagos negativos, no duplicados, validación de horas totales = discriminadas + no discriminadas

---

## 🎨 Interfaz — Estilo Azul/Profesional SaaS

### Paleta y Diseño
- Tonos azules corporativos con acentos en cyan/teal
- Modo claro y oscuro
- Animaciones suaves (fade-in, scale, hover effects)
- Iconografía con Lucide + emojis estratégicos (💧🌱📊💰)
- 100% responsive

### Páginas

#### 1. Dashboard Principal
- Tarjetas KPI animadas: clientes activos, clientes con deuda, total facturado anual, total cobrado
- Gráficos con Recharts (barras facturación mensual, pie distribución de pagos)
- Lista rápida de clientes con deuda

#### 2. Gestión de Clientes
- Tabla moderna con buscador en tiempo real y filtro por estado
- Paginación
- Botón para crear nuevo cliente (modal/drawer animado)
- Cards con badges de estado (🟢 activo / 🔴 inactivo)

#### 3. Vista Cliente Individual
- Datos personales editables
- Selector dinámico de año
- Grilla visual de 12 meses tipo calendario con indicadores de color (🟢 pagado / 🔴 pendiente)
- Resumen: total año vs total pagado vs saldo pendiente
- Barra de progreso de pagos

#### 4. Vista Detalle de Mes
- Desglose del cálculo (horas × valor)
- Historial de pagos del mes en timeline
- Formulario de registro de pago con campos condicionales (recibo si efectivo, fecha si transferencia)
- Indicador de excedente aplicado desde/hacia otros meses
- Actualización en tiempo real del saldo

#### 5. Reportes
- Reporte anual por cliente (tabla + gráfico)
- Reporte mensual global (todos los clientes)
- Reporte de deudores con montos pendientes
- Historial financiero completo con filtros

---

## ⚙️ Funcionalidades Clave

- **Creación de configuración anual** → genera automáticamente 12 meses con cálculos
- **Registro de pago** → transaccional, actualiza saldo, maneja excedentes en cascada
- **Campos condicionales** → formulario de pago se adapta según método seleccionado
- **Estados dinámicos** → badges visuales actualizados automáticamente
- **Búsqueda en tiempo real** → filtrado instantáneo de clientes
- **Validaciones robustas** — Zod en frontend, constraints en BD, validación en edge functions

---

## 🔮 Preparado para el Futuro
- Estructura de BD lista para agregar autenticación y roles
- API desacoplada via edge functions (reutilizable)
- Arquitectura modular para agregar exportación Excel, intereses por mora, auditoría

