import { db } from '../db';
import { goldTransactionsTable, zakatRemindersTable, usersTable } from '../db/schema';
import { type ZakatReminder } from '../schema';
import { eq, sum, lte, desc, and, gte } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

const NISAB_GRAMS = 85; // Minimum threshold for zakat eligibility
const LUNAR_YEAR_DAYS = 354; // One lunar year in days
const ZAKAT_RATE = 0.025; // 2.5% zakat rate

// Handler for calculating and updating zakat eligibility for a user
export async function updateZakatStatus(userId: number): Promise<ZakatReminder | null> {
  try {
    // 1. Calculate user's current gold holdings from transactions
    const currentHoldings = await calculateUserGoldHoldings(userId);
    
    // 2. Check if holdings exceed nisab (85 grams)
    const exceedsNisab = currentHoldings >= NISAB_GRAMS;
    
    let holdingStartDate = new Date();
    let isEligible = false;
    let nextReminderDate: Date | null = null;
    
    // Get existing zakat reminder if any
    const existingReminder = await db.select()
      .from(zakatRemindersTable)
      .where(eq(zakatRemindersTable.user_id, userId))
      .orderBy(desc(zakatRemindersTable.created_at))
      .limit(1)
      .execute();
    
    if (exceedsNisab) {
      // 3. Determine holding start date
      if (existingReminder.length > 0) {
        // Use existing holding start date if user previously exceeded nisab
        holdingStartDate = existingReminder[0].holding_start_date;
      } else {
        // Find the first transaction date when user exceeded nisab
        const firstExceedDate = await findFirstNisabExceedDate(userId);
        holdingStartDate = firstExceedDate || new Date();
      }
      
      // 4. Check if holdings have been maintained for one lunar year
      const daysSinceStart = Math.floor((Date.now() - holdingStartDate.getTime()) / (1000 * 60 * 60 * 24));
      isEligible = daysSinceStart >= LUNAR_YEAR_DAYS;
      
      // 6. Set next reminder date if eligible
      if (isEligible) {
        // Set reminder for next lunar year
        nextReminderDate = new Date(holdingStartDate.getTime() + (LUNAR_YEAR_DAYS * 2 * 24 * 60 * 60 * 1000));
      }
    }
    
    // 5. Update or create zakat reminder record
    if (existingReminder.length > 0) {
      // Update existing record
      const result = await db.update(zakatRemindersTable)
        .set({
          gold_weight_grams: currentHoldings.toString(),
          holding_start_date: holdingStartDate,
          is_eligible: isEligible,
          next_reminder_date: nextReminderDate,
          updated_at: new Date()
        })
        .where(eq(zakatRemindersTable.id, existingReminder[0].id))
        .returning()
        .execute();
      
      const updated = result[0];
      return {
        ...updated,
        gold_weight_grams: parseFloat(updated.gold_weight_grams)
      };
    } else {
      // Create new record
      const result = await db.insert(zakatRemindersTable)
        .values({
          user_id: userId,
          gold_weight_grams: currentHoldings.toString(),
          holding_start_date: holdingStartDate,
          is_eligible: isEligible,
          next_reminder_date: nextReminderDate
        })
        .returning()
        .execute();
      
      const created = result[0];
      return {
        ...created,
        gold_weight_grams: parseFloat(created.gold_weight_grams)
      };
    }
  } catch (error) {
    console.error('Zakat status update failed:', error);
    throw error;
  }
}

// Handler for getting user's current zakat status
export async function getZakatStatus(userId: number): Promise<ZakatReminder | null> {
  try {
    // Fetch the latest zakat reminder record for the user
    const result = await db.select()
      .from(zakatRemindersTable)
      .where(eq(zakatRemindersTable.user_id, userId))
      .orderBy(desc(zakatRemindersTable.created_at))
      .limit(1)
      .execute();
    
    if (result.length === 0) {
      return null;
    }
    
    const reminder = result[0];
    return {
      ...reminder,
      gold_weight_grams: parseFloat(reminder.gold_weight_grams)
    };
  } catch (error) {
    console.error('Get zakat status failed:', error);
    throw error;
  }
}

// Handler for calculating zakat amount due
export async function calculateZakatAmount(userId: number, currentGoldPricePerGram: number): Promise<number> {
  try {
    // 1. Get user's current zakat status
    const zakatStatus = await getZakatStatus(userId);
    
    if (!zakatStatus || !zakatStatus.is_eligible) {
      return 0; // Not eligible for zakat
    }
    
    // 2. Calculate 2.5% of total gold value as zakat amount
    const totalGoldValue = zakatStatus.gold_weight_grams * currentGoldPricePerGram;
    const zakatAmount = totalGoldValue * ZAKAT_RATE;
    
    return Math.round(zakatAmount * 100) / 100; // Round to 2 decimal places
  } catch (error) {
    console.error('Calculate zakat amount failed:', error);
    throw error;
  }
}

// Handler for getting users who need zakat reminders
export async function getUsersForZakatReminder(): Promise<ZakatReminder[]> {
  try {
    const today = new Date();
    
    // Find all zakat reminders where next_reminder_date is today or past
    // and users are eligible for zakat
    const result = await db.select()
      .from(zakatRemindersTable)
      .where(
        and(
          eq(zakatRemindersTable.is_eligible, true),
          lte(zakatRemindersTable.next_reminder_date, today)
        )
      )
      .execute();
    
    return result.map(reminder => ({
      ...reminder,
      gold_weight_grams: parseFloat(reminder.gold_weight_grams)
    }));
  } catch (error) {
    console.error('Get users for zakat reminder failed:', error);
    throw error;
  }
}

// Handler for updating next reminder date after sending reminder
export async function updateNextReminderDate(zakatReminderId: number, nextDate: Date): Promise<boolean> {
  try {
    const result = await db.update(zakatRemindersTable)
      .set({
        next_reminder_date: nextDate,
        updated_at: new Date()
      })
      .where(eq(zakatRemindersTable.id, zakatReminderId))
      .execute();
    
    return result.rowCount !== null && result.rowCount !== undefined && result.rowCount > 0;
  } catch (error) {
    console.error('Update next reminder date failed:', error);
    throw error;
  }
}

// Helper function to calculate user's current gold holdings
async function calculateUserGoldHoldings(userId: number): Promise<number> {
  // Get all transactions for the user
  const transactions = await db.select({
    type: goldTransactionsTable.type,
    weight_grams: goldTransactionsTable.weight_grams
  })
    .from(goldTransactionsTable)
    .where(eq(goldTransactionsTable.user_id, userId))
    .execute();
  
  let totalHoldings = 0;
  
  for (const transaction of transactions) {
    const weight = parseFloat(transaction.weight_grams);
    
    if (transaction.type === 'buy') {
      totalHoldings += weight;
    } else if (transaction.type === 'sell') {
      totalHoldings -= weight;
    }
  }
  
  return Math.max(0, totalHoldings); // Ensure non-negative holdings
}

// Helper function to find the first date when user exceeded nisab
async function findFirstNisabExceedDate(userId: number): Promise<Date | null> {
  // Get all transactions sorted by date
  const transactions = await db.select({
    type: goldTransactionsTable.type,
    weight_grams: goldTransactionsTable.weight_grams,
    transaction_date: goldTransactionsTable.transaction_date
  })
    .from(goldTransactionsTable)
    .where(eq(goldTransactionsTable.user_id, userId))
    .orderBy(goldTransactionsTable.transaction_date)
    .execute();
  
  let runningTotal = 0;
  
  for (const transaction of transactions) {
    const weight = parseFloat(transaction.weight_grams);
    
    if (transaction.type === 'buy') {
      runningTotal += weight;
    } else if (transaction.type === 'sell') {
      runningTotal -= weight;
    }
    
    // Check if this is the first time user exceeded nisab
    if (runningTotal >= NISAB_GRAMS) {
      return transaction.transaction_date;
    }
  }
  
  return null;
}