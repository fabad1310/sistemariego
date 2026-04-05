import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 1000;

/**
 * Trae TODOS los registros de una tabla de Supabase superando el límite de 1000 filas.
 * Itera automáticamente con paginación hasta que no haya más datos.
 *
 * @param tableName - Nombre de la tabla a consultar
 * @param selectFields - Campos a seleccionar (default "*")
 * @param filters - Función opcional para aplicar filtros/orden encadenados al query builder
 * @returns Array completo de todos los registros existentes
 */
export async function fetchAllPages<T = any>(
  tableName: string,
  selectFields: string = "*",
  filters?: (query: any) => any
): Promise<T[]> {
  const allData: T[] = [];
  let from = 0;

  while (true) {
    let query = (supabase as any)
      .from(tableName)
      .select(selectFields)
      .range(from, from + PAGE_SIZE - 1);

    if (filters) {
      query = filters(query);
    }

    const { data, error } = await query;

    if (error) throw error;
    if (!data || data.length === 0) break;

    allData.push(...(data as T[]));

    if (data.length < PAGE_SIZE) break;

    from += PAGE_SIZE;
  }

  return allData;
}
