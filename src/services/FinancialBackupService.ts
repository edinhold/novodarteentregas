import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/utils/financialCalculations";

export interface FinancialBackupPayload {
  version: string;
  generated_at: string;
  generated_by: {
    id?: string;
    email?: string;
  };
  summary: {
    total_store_credits: number;
    total_credit_codes: number;
    total_withdrawals: number;
    total_deliveries: number;
  };
  data: {
    store_credits: any[];
    credit_codes: any[];
    withdrawal_requests: any[];
    delivery_config: any[];
    financial_cleanup_logs: any[];
  };
}

export class FinancialBackupService {
  /**
   * Generates a complete financial backup object from real database tables
   */
  public static async generateBackup(): Promise<FinancialBackupPayload> {
    const { data: { user } } = await supabase.auth.getUser();

    // Fetch all financial data in parallel
    const [
      { data: storeCredits = [] },
      { data: creditCodes = [] },
      { data: withdrawalRequests = [] },
      { data: deliveryConfig = [] },
      { data: cleanupLogs = [] },
    ] = await Promise.all([
      supabase.from("store_credits").select("*"),
      supabase.from("credit_codes").select("*"),
      supabase.from("withdrawal_requests").select("*"),
      supabase.from("delivery_config").select("*"),
      supabase.from("financial_cleanup_logs" as any).select("*").order("created_at", { ascending: false }),
    ]);

    const timestamp = new Date().toISOString();

    const payload: FinancialBackupPayload = {
      version: "1.0",
      generated_at: timestamp,
      generated_by: {
        id: user?.id,
        email: user?.email,
      },
      summary: {
        total_store_credits: (storeCredits || []).length,
        total_credit_codes: (creditCodes || []).length,
        total_withdrawals: (withdrawalRequests || []).length,
        total_deliveries: 0,
      },
      data: {
        store_credits: storeCredits || [],
        credit_codes: creditCodes || [],
        withdrawal_requests: withdrawalRequests || [],
        delivery_config: deliveryConfig || [],
        financial_cleanup_logs: cleanupLogs || [],
      },
    };

    return payload;
  }

  /**
   * Triggers browser download of the generated financial backup file
   */
  public static async downloadBackup(): Promise<{ filename: string; recordCount: number }> {
    const backupData = await this.generateBackup();
    const jsonString = JSON.stringify(backupData, null, 2);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const filename = `backup-financeiro-duarte-${dateStr}-${timeStr}.json`;

    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    const recordCount =
      backupData.summary.total_store_credits +
      backupData.summary.total_credit_codes +
      backupData.summary.total_withdrawals;

    return { filename, recordCount };
  }
}
