import { db } from '../db';
import { goldTransactionsTable, goldGoalsTable, zakatRemindersTable } from '../db/schema';
import { type DashboardData } from '../schema';
import { eq, sum, sql } from 'drizzle-orm';

// Constants for zakat calculations
const ZAKAT_NISAB_GRAMS = 85; // Nisab threshold for gold in grams
const ZAKAT_REQUIRED_DAYS = 354; // One lunar year in days

// Handler for getting comprehensive dashboard data for a user
export async function getDashboardData(userId: number): Promise<DashboardData> {
  try {
    // Calculate total gold holdings
    const totalGoldGrams = await calculateTotalGoldHoldings(userId);
    
    // For demo purposes, use a fixed gold price per gram (in USD)
    // In production, this would come from an external API or database
    const currentGoldPrice = 65.50; // ~$65.50 per gram (approximate as of 2024)
    
    // Calculate estimated total value
    const estimatedTotalValue = totalGoldGrams * currentGoldPrice;
    
    // Get goals progress
    const goalsProgress = await calculateGoalsProgress(userId);
    
    // Get zakat status
    const zakatStatus = await calculateZakatStatus(userId, totalGoldGrams);
    
    return {
      total_gold_grams: totalGoldGrams,
      estimated_total_value: estimatedTotalValue,
      current_gold_price: currentGoldPrice,
      goals_progress: goalsProgress,
      zakat_status: zakatStatus
    };
  } catch (error) {
    console.error('Dashboard data retrieval failed:', error);
    throw error;
  }
}

// Handler for calculating user's total gold holdings
export async function calculateTotalGoldHoldings(userId: number): Promise<number> {
  try {
    // Get sum of all buy transactions
    const buyResult = await db
      .select({
        total: sum(goldTransactionsTable.weight_grams)
      })
      .from(goldTransactionsTable)
      .where(
        sql`${goldTransactionsTable.user_id} = ${userId} AND ${goldTransactionsTable.type} = 'buy'`
      )
      .execute();

    // Get sum of all sell transactions
    const sellResult = await db
      .select({
        total: sum(goldTransactionsTable.weight_grams)
      })
      .from(goldTransactionsTable)
      .where(
        sql`${goldTransactionsTable.user_id} = ${userId} AND ${goldTransactionsTable.type} = 'sell'`
      )
      .execute();

    const totalBought = buyResult[0]?.total ? parseFloat(buyResult[0].total) : 0;
    const totalSold = sellResult[0]?.total ? parseFloat(sellResult[0].total) : 0;

    // Net holdings = total bought - total sold
    return Math.max(0, totalBought - totalSold);
  } catch (error) {
    console.error('Gold holdings calculation failed:', error);
    throw error;
  }
}

// Handler for calculating progress towards goals
export async function calculateGoalsProgress(userId: number): Promise<Array<{
  id: number;
  title: string;
  target_weight_grams: number;
  current_progress_percentage: number;
  deadline: Date;
  is_completed: boolean;
}>> {
  try {
    // Get all goals for the user
    const goals = await db
      .select()
      .from(goldGoalsTable)
      .where(eq(goldGoalsTable.user_id, userId))
      .execute();

    // Get current gold holdings
    const currentHoldings = await calculateTotalGoldHoldings(userId);

    // Calculate progress for each goal
    return goals.map(goal => {
      const targetWeight = parseFloat(goal.target_weight_grams);
      const progressPercentage = targetWeight > 0 
        ? Math.min(100, (currentHoldings / targetWeight) * 100) 
        : 0;

      return {
        id: goal.id,
        title: goal.title,
        target_weight_grams: targetWeight,
        current_progress_percentage: Math.round(progressPercentage * 100) / 100, // Round to 2 decimals
        deadline: goal.deadline,
        is_completed: goal.is_completed
      };
    });
  } catch (error) {
    console.error('Goals progress calculation failed:', error);
    throw error;
  }
}

// Helper function to calculate zakat status
async function calculateZakatStatus(userId: number, currentWeightGrams: number): Promise<{
  is_eligible: boolean;
  current_weight_grams: number;
  threshold_grams: number;
  days_held: number | null;
  required_days: number;
}> {
  try {
    // Check if user meets the nisab threshold
    const meetsThreshold = currentWeightGrams >= ZAKAT_NISAB_GRAMS;

    let daysHeld: number | null = null;

    if (meetsThreshold) {
      // Get the earliest transaction date where holdings first exceeded nisab
      // For simplicity, we'll use the date of the first buy transaction
      const firstTransaction = await db
        .select({
          transaction_date: goldTransactionsTable.transaction_date
        })
        .from(goldTransactionsTable)
        .where(eq(goldTransactionsTable.user_id, userId))
        .orderBy(goldTransactionsTable.transaction_date)
        .limit(1)
        .execute();

      if (firstTransaction.length > 0) {
        const holdingStartDate = firstTransaction[0].transaction_date;
        const currentDate = new Date();
        const timeDiff = currentDate.getTime() - holdingStartDate.getTime();
        daysHeld = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      }
    }

    const isEligible = meetsThreshold && daysHeld !== null && daysHeld >= ZAKAT_REQUIRED_DAYS;

    return {
      is_eligible: isEligible,
      current_weight_grams: currentWeightGrams,
      threshold_grams: ZAKAT_NISAB_GRAMS,
      days_held: daysHeld,
      required_days: ZAKAT_REQUIRED_DAYS
    };
  } catch (error) {
    console.error('Zakat status calculation failed:', error);
    throw error;
  }
}