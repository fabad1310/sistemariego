export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      clientes: {
        Row: {
          apellido: string
          created_at: string
          dni: string
          email: string | null
          estado: string
          id: string
          nombre: string
          nombre_dueno: string | null
          nombre_propiedad: string | null
          nombre_regante: string | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          apellido: string
          created_at?: string
          dni: string
          email?: string | null
          estado?: string
          id?: string
          nombre: string
          nombre_dueno?: string | null
          nombre_propiedad?: string | null
          nombre_regante?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          apellido?: string
          created_at?: string
          dni?: string
          email?: string | null
          estado?: string
          id?: string
          nombre?: string
          nombre_dueno?: string | null
          nombre_propiedad?: string | null
          nombre_regante?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      configuracion_riego_cliente: {
        Row: {
          anio: number
          cliente_id: string
          created_at: string
          fecha_configuracion: string
          horas_discriminadas: number
          horas_no_discriminadas: number
          horas_totales_mes: number
          id: string
          valor_hora_discriminada: number
          valor_hora_no_discriminada: number
        }
        Insert: {
          anio: number
          cliente_id: string
          created_at?: string
          fecha_configuracion?: string
          horas_discriminadas: number
          horas_no_discriminadas: number
          horas_totales_mes: number
          id?: string
          valor_hora_discriminada: number
          valor_hora_no_discriminada: number
        }
        Update: {
          anio?: number
          cliente_id?: string
          created_at?: string
          fecha_configuracion?: string
          horas_discriminadas?: number
          horas_no_discriminadas?: number
          horas_totales_mes?: number
          id?: string
          valor_hora_discriminada?: number
          valor_hora_no_discriminada?: number
        }
        Relationships: [
          {
            foreignKeyName: "configuracion_riego_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          estado: string
          fecha_pago: string
          fecha_registro: string
          fecha_transferencia: string | null
          id: string
          metodo_pago: string
          monto: number
          nombre_gasto: string
          numero_recibo: string | null
          pagado_por: string
        }
        Insert: {
          estado?: string
          fecha_pago: string
          fecha_registro?: string
          fecha_transferencia?: string | null
          id?: string
          metodo_pago: string
          monto: number
          nombre_gasto: string
          numero_recibo?: string | null
          pagado_por: string
        }
        Update: {
          estado?: string
          fecha_pago?: string
          fecha_registro?: string
          fecha_transferencia?: string | null
          id?: string
          metodo_pago?: string
          monto?: number
          nombre_gasto?: string
          numero_recibo?: string | null
          pagado_por?: string
        }
        Relationships: []
      }
      meses_servicio: {
        Row: {
          anio: number
          cliente_id: string
          configuracion_id: string
          estado_mes: string
          estado_servicio: string
          fecha_generacion: string
          horas_empadronada_final: number
          horas_precaria_final: number
          id: string
          mes: number
          saldo_pendiente: number
          total_calculado: number
          total_pagado: number
        }
        Insert: {
          anio: number
          cliente_id: string
          configuracion_id: string
          estado_mes?: string
          estado_servicio?: string
          fecha_generacion?: string
          horas_empadronada_final?: number
          horas_precaria_final?: number
          id?: string
          mes: number
          saldo_pendiente: number
          total_calculado: number
          total_pagado?: number
        }
        Update: {
          anio?: number
          cliente_id?: string
          configuracion_id?: string
          estado_mes?: string
          estado_servicio?: string
          fecha_generacion?: string
          horas_empadronada_final?: number
          horas_precaria_final?: number
          id?: string
          mes?: number
          saldo_pendiente?: number
          total_calculado?: number
          total_pagado?: number
        }
        Relationships: [
          {
            foreignKeyName: "meses_servicio_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meses_servicio_configuracion_id_fkey"
            columns: ["configuracion_id"]
            isOneToOne: false
            referencedRelation: "configuracion_riego_cliente"
            referencedColumns: ["id"]
          },
        ]
      }
      observaciones_gasto: {
        Row: {
          fecha_creacion: string
          gasto_id: string
          id: string
          imagen_url: string | null
          texto: string | null
        }
        Insert: {
          fecha_creacion?: string
          gasto_id: string
          id?: string
          imagen_url?: string | null
          texto?: string | null
        }
        Update: {
          fecha_creacion?: string
          gasto_id?: string
          id?: string
          imagen_url?: string | null
          texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "observaciones_gasto_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "gastos"
            referencedColumns: ["id"]
          },
        ]
      }
      observaciones_mes: {
        Row: {
          fecha_creacion: string
          id: string
          imagen_url: string | null
          mes_servicio_id: string
          texto: string | null
          usuario_creador: string | null
        }
        Insert: {
          fecha_creacion?: string
          id?: string
          imagen_url?: string | null
          mes_servicio_id: string
          texto?: string | null
          usuario_creador?: string | null
        }
        Update: {
          fecha_creacion?: string
          id?: string
          imagen_url?: string | null
          mes_servicio_id?: string
          texto?: string | null
          usuario_creador?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "observaciones_mes_mes_servicio_id_fkey"
            columns: ["mes_servicio_id"]
            isOneToOne: false
            referencedRelation: "meses_servicio"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          cliente_id: string
          fecha_registro: string
          fecha_transferencia: string | null
          id: string
          mes_servicio_id: string
          metodo_pago: string
          monto: number
          notas: string | null
          numero_recibo: string | null
        }
        Insert: {
          cliente_id: string
          fecha_registro?: string
          fecha_transferencia?: string | null
          id?: string
          mes_servicio_id: string
          metodo_pago: string
          monto: number
          notas?: string | null
          numero_recibo?: string | null
        }
        Update: {
          cliente_id?: string
          fecha_registro?: string
          fecha_transferencia?: string | null
          id?: string
          mes_servicio_id?: string
          metodo_pago?: string
          monto?: number
          notas?: string | null
          numero_recibo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_mes_servicio_id_fkey"
            columns: ["mes_servicio_id"]
            isOneToOne: false
            referencedRelation: "meses_servicio"
            referencedColumns: ["id"]
          },
        ]
      }
      quincenas_servicio: {
        Row: {
          fecha_registro: string
          id: string
          mes_servicio_id: string
          minutos_empadronada: number
          minutos_precaria: number
          numero_quincena: number
        }
        Insert: {
          fecha_registro?: string
          id?: string
          mes_servicio_id: string
          minutos_empadronada?: number
          minutos_precaria?: number
          numero_quincena: number
        }
        Update: {
          fecha_registro?: string
          id?: string
          mes_servicio_id?: string
          minutos_empadronada?: number
          minutos_precaria?: number
          numero_quincena?: number
        }
        Relationships: [
          {
            foreignKeyName: "quincenas_servicio_mes_servicio_id_fkey"
            columns: ["mes_servicio_id"]
            isOneToOne: false
            referencedRelation: "meses_servicio"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
