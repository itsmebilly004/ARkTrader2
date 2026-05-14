export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string;
          user_id: string;
          loginid: string;
          account_type: string;
          currency: string;
          balance: number;
          is_demo: boolean;
          is_virtual: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          loginid: string;
          account_type?: string;
          currency?: string;
          balance?: number;
          is_demo?: boolean;
          is_virtual?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          loginid?: string;
          account_type?: string;
          currency?: string;
          balance?: number;
          is_demo?: boolean;
          is_virtual?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      bots: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          status: string;
          strategy: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          status?: string;
          strategy?: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          status?: string;
          strategy?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      sessions: {
        Row: {
          account_id: string;
          balance: number | null;
          created_at: string;
          currency: string | null;
          deriv_token: string;
          expires_at: string | null;
          id: string;
          is_active: boolean;
          is_demo: boolean;
          is_virtual: boolean | null;
          last_trading_error: string | null;
          loginid: string | null;
          token_source: string | null;
          trading_adapter: string | null;
          trading_authorized: boolean;
          trading_authorized_at: string | null;
          user_id: string;
        };
        Insert: {
          account_id: string;
          balance?: number | null;
          created_at?: string;
          currency?: string | null;
          deriv_token: string;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          is_demo?: boolean;
          is_virtual?: boolean | null;
          last_trading_error?: string | null;
          loginid?: string | null;
          token_source?: string | null;
          trading_adapter?: string | null;
          trading_authorized?: boolean;
          trading_authorized_at?: string | null;
          user_id: string;
        };
        Update: {
          account_id?: string;
          balance?: number | null;
          created_at?: string;
          currency?: string | null;
          deriv_token?: string;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          is_demo?: boolean;
          is_virtual?: boolean | null;
          last_trading_error?: string | null;
          loginid?: string | null;
          token_source?: string | null;
          trading_adapter?: string | null;
          trading_authorized?: boolean;
          trading_authorized_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      trades: {
        Row: {
          closed_at: string | null;
          created_at: string;
          deriv_contract_id: string | null;
          duration: string | null;
          entry_spot: number | null;
          exit_spot: number | null;
          id: string;
          payout: number | null;
          profit_loss: number | null;
          stake: number;
          status: string;
          symbol: string;
          trade_type: string;
          user_id: string;
        };
        Insert: {
          closed_at?: string | null;
          created_at?: string;
          deriv_contract_id?: string | null;
          duration?: string | null;
          entry_spot?: number | null;
          exit_spot?: number | null;
          id?: string;
          payout?: number | null;
          profit_loss?: number | null;
          stake: number;
          status?: string;
          symbol: string;
          trade_type: string;
          user_id: string;
        };
        Update: {
          closed_at?: string | null;
          created_at?: string;
          deriv_contract_id?: string | null;
          duration?: string | null;
          entry_spot?: number | null;
          exit_spot?: number | null;
          id?: string;
          payout?: number | null;
          profit_loss?: number | null;
          stake?: number;
          status?: string;
          symbol?: string;
          trade_type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          created_at: string;
          daily_loss_limit: number | null;
          default_demo: boolean | null;
          default_duration: string | null;
          default_stake: number | null;
          max_consecutive_losses: number | null;
          max_stake: number | null;
          preferred_symbol: string | null;
          theme: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          daily_loss_limit?: number | null;
          default_demo?: boolean | null;
          default_duration?: string | null;
          default_stake?: number | null;
          max_consecutive_losses?: number | null;
          max_stake?: number | null;
          preferred_symbol?: string | null;
          theme?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          daily_loss_limit?: number | null;
          default_demo?: boolean | null;
          default_duration?: string | null;
          default_stake?: number | null;
          max_consecutive_losses?: number | null;
          max_stake?: number | null;
          preferred_symbol?: string | null;
          theme?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          created_at: string;
          deriv_account: string | null;
          deriv_currency: string | null;
          deriv_user_id: string | null;
          email: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deriv_account?: string | null;
          deriv_currency?: string | null;
          deriv_user_id?: string | null;
          email?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deriv_account?: string | null;
          deriv_currency?: string | null;
          deriv_user_id?: string | null;
          email?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      watchlist: {
        Row: {
          added_at: string;
          id: string;
          symbol: string;
          user_id: string;
        };
        Insert: {
          added_at?: string;
          id?: string;
          symbol: string;
          user_id: string;
        };
        Update: {
          added_at?: string;
          id?: string;
          symbol?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
