import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, goldTransactionsTable, zakatRemindersTable } from '../db/schema';
import { 
  updateZakatStatus, 
  getZakatStatus, 
  calculateZakatAmount, 
  getUsersForZakatReminder, 
  updateNextReminderDate 
} from '../handlers/zakat';
import { eq } from 'drizzle-orm';

// Test constants
const NISAB_GRAMS = 85;
const LUNAR_YEAR_DAYS = 354;
const ZAKAT_RATE = 0.025;

// Helper function to create test user
const createTestUser = async () => {
  const result = await db.insert(usersTable)
    .values({
      email: 'test@example.com',
      password_hash: 'hashed_password',
      name: 'Test User'
    })
    .returning()
    .execute();
  
  return result[0];
};

// Helper function to create test transaction
const createTestTransaction = async (userId: number, type: 'buy' | 'sell', weightGrams: number, daysAgo: number = 0) => {
  const transactionDate = new Date();
  transactionDate.setDate(transactionDate.getDate() - daysAgo);
  
  const result = await db.insert(goldTransactionsTable)
    .values({
      user_id: userId,
      type,
      weight_grams: weightGrams.toString(),
      price_per_gram: '50.00',
      total_price: (weightGrams * 50).toString(),
      transaction_date: transactionDate,
      description: `Test ${type} transaction`
    })
    .returning()
    .execute();
  
  return result[0];
};

describe('zakat handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('updateZakatStatus', () => {
    it('should create zakat reminder when user exceeds nisab', async () => {
      const user = await createTestUser();
      
      // Create transaction that exceeds nisab
      await createTestTransaction(user.id, 'buy', 100);
      
      const result = await updateZakatStatus(user.id);
      
      expect(result).toBeDefined();
      expect(result!.user_id).toEqual(user.id);
      expect(result!.gold_weight_grams).toEqual(100);
      expect(result!.is_eligible).toBe(false); // Not held long enough
      expect(result!.next_reminder_date).toBeNull();
      expect(result!.holding_start_date).toBeInstanceOf(Date);
    });

    it('should mark user as eligible when held for lunar year', async () => {
      const user = await createTestUser();
      
      // Create transaction from over a lunar year ago
      await createTestTransaction(user.id, 'buy', 100, LUNAR_YEAR_DAYS + 1);
      
      const result = await updateZakatStatus(user.id);
      
      expect(result).toBeDefined();
      expect(result!.is_eligible).toBe(true);
      expect(result!.next_reminder_date).toBeInstanceOf(Date);
    });

    it('should update existing zakat reminder', async () => {
      const user = await createTestUser();
      
      // First update - create initial reminder
      await createTestTransaction(user.id, 'buy', 100);
      const firstResult = await updateZakatStatus(user.id);
      
      // Add more gold
      await createTestTransaction(user.id, 'buy', 50);
      const secondResult = await updateZakatStatus(user.id);
      
      expect(secondResult!.id).toEqual(firstResult!.id); // Same record updated
      expect(secondResult!.gold_weight_grams).toEqual(150);
    });

    it('should handle user with no transactions', async () => {
      const user = await createTestUser();
      
      const result = await updateZakatStatus(user.id);
      
      expect(result).toBeDefined();
      expect(result!.gold_weight_grams).toEqual(0);
      expect(result!.is_eligible).toBe(false);
    });

    it('should handle buy and sell transactions correctly', async () => {
      const user = await createTestUser();
      
      // Buy 100g, then sell 20g = 80g total (below nisab)
      await createTestTransaction(user.id, 'buy', 100);
      await createTestTransaction(user.id, 'sell', 20);
      
      const result = await updateZakatStatus(user.id);
      
      expect(result!.gold_weight_grams).toEqual(80);
      expect(result!.is_eligible).toBe(false);
    });

    it('should ensure holdings never go negative', async () => {
      const user = await createTestUser();
      
      // Sell more than owned (unusual scenario)
      await createTestTransaction(user.id, 'buy', 50);
      await createTestTransaction(user.id, 'sell', 100);
      
      const result = await updateZakatStatus(user.id);
      
      expect(result!.gold_weight_grams).toEqual(0);
    });
  });

  describe('getZakatStatus', () => {
    it('should return null when no zakat reminder exists', async () => {
      const user = await createTestUser();
      
      const result = await getZakatStatus(user.id);
      
      expect(result).toBeNull();
    });

    it('should return latest zakat reminder', async () => {
      const user = await createTestUser();
      
      // Create initial reminder
      await createTestTransaction(user.id, 'buy', 100);
      await updateZakatStatus(user.id);
      
      const result = await getZakatStatus(user.id);
      
      expect(result).toBeDefined();
      expect(result!.user_id).toEqual(user.id);
      expect(result!.gold_weight_grams).toEqual(100);
      expect(typeof result!.gold_weight_grams).toBe('number');
    });

    it('should return most recent reminder when multiple exist', async () => {
      const user = await createTestUser();
      
      // Create multiple reminders over time
      await createTestTransaction(user.id, 'buy', 100);
      await updateZakatStatus(user.id);
      
      // Add more gold and update again
      await createTestTransaction(user.id, 'buy', 50);
      await updateZakatStatus(user.id);
      
      const result = await getZakatStatus(user.id);
      
      expect(result!.gold_weight_grams).toEqual(150); // Latest amount
    });
  });

  describe('calculateZakatAmount', () => {
    it('should return 0 when user is not eligible', async () => {
      const user = await createTestUser();
      
      // Create reminder but not eligible
      await createTestTransaction(user.id, 'buy', 100);
      await updateZakatStatus(user.id);
      
      const result = await calculateZakatAmount(user.id, 60);
      
      expect(result).toEqual(0);
    });

    it('should calculate correct zakat amount for eligible user', async () => {
      const user = await createTestUser();
      
      // Create eligible user (held for over lunar year)
      await createTestTransaction(user.id, 'buy', 100, LUNAR_YEAR_DAYS + 1);
      await updateZakatStatus(user.id);
      
      const goldPricePerGram = 60;
      const result = await calculateZakatAmount(user.id, goldPricePerGram);
      
      // Expected: 100g * $60/g * 2.5% = $150
      expect(result).toEqual(150);
    });

    it('should return 0 when no zakat reminder exists', async () => {
      const user = await createTestUser();
      
      const result = await calculateZakatAmount(user.id, 60);
      
      expect(result).toEqual(0);
    });

    it('should round result to 2 decimal places', async () => {
      const user = await createTestUser();
      
      // Create eligible user with amount that creates decimal zakat
      await createTestTransaction(user.id, 'buy', 87.5, LUNAR_YEAR_DAYS + 1);
      await updateZakatStatus(user.id);
      
      const result = await calculateZakatAmount(user.id, 57.33);
      
      // Expected: 87.5g * $57.33/g * 2.5% = $125.096875, rounded to $125.10
      // Actual calculation: 87.5 * 57.33 * 0.025 = 125.409375, rounded to $125.41
      expect(result).toEqual(125.41);
    });
  });

  describe('getUsersForZakatReminder', () => {
    it('should return empty array when no eligible users', async () => {
      const result = await getUsersForZakatReminder();
      
      expect(result).toEqual([]);
    });

    it('should return users who need reminders', async () => {
      const user = await createTestUser();
      
      // Create eligible user with reminder date in past
      await createTestTransaction(user.id, 'buy', 100, LUNAR_YEAR_DAYS + 10);
      await updateZakatStatus(user.id);
      
      // Manually update reminder date to yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      await db.update(zakatRemindersTable)
        .set({ next_reminder_date: yesterday })
        .where(eq(zakatRemindersTable.user_id, user.id))
        .execute();
      
      const result = await getUsersForZakatReminder();
      
      expect(result).toHaveLength(1);
      expect(result[0].user_id).toEqual(user.id);
      expect(typeof result[0].gold_weight_grams).toBe('number');
    });

    it('should not return users with future reminder dates', async () => {
      const user = await createTestUser();
      
      // Create eligible user with future reminder date
      await createTestTransaction(user.id, 'buy', 100, LUNAR_YEAR_DAYS + 1);
      await updateZakatStatus(user.id);
      
      const result = await getUsersForZakatReminder();
      
      expect(result).toHaveLength(0);
    });

    it('should not return ineligible users', async () => {
      const user = await createTestUser();
      
      // Create ineligible user (not held long enough)
      await createTestTransaction(user.id, 'buy', 100);
      await updateZakatStatus(user.id);
      
      const result = await getUsersForZakatReminder();
      
      expect(result).toHaveLength(0);
    });
  });

  describe('updateNextReminderDate', () => {
    it('should update reminder date successfully', async () => {
      const user = await createTestUser();
      
      // Create zakat reminder
      await createTestTransaction(user.id, 'buy', 100);
      const zakatStatus = await updateZakatStatus(user.id);
      
      const newDate = new Date();
      newDate.setDate(newDate.getDate() + 30);
      
      const result = await updateNextReminderDate(zakatStatus!.id, newDate);
      
      expect(result).toBe(true);
      
      // Verify the date was updated
      const updated = await getZakatStatus(user.id);
      expect(updated!.next_reminder_date).toEqual(newDate);
    });

    it('should return false for non-existent reminder', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      
      const result = await updateNextReminderDate(99999, futureDate);
      
      expect(result).toBe(false);
    });

    it('should update updated_at timestamp', async () => {
      const user = await createTestUser();
      
      // Create zakat reminder
      await createTestTransaction(user.id, 'buy', 100);
      const originalStatus = await updateZakatStatus(user.id);
      
      // Wait a moment to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const newDate = new Date();
      newDate.setDate(newDate.getDate() + 30);
      
      await updateNextReminderDate(originalStatus!.id, newDate);
      
      // Verify updated_at changed
      const updated = await getZakatStatus(user.id);
      expect(updated!.updated_at.getTime()).toBeGreaterThan(originalStatus!.updated_at.getTime());
    });
  });

  describe('edge cases and integration', () => {
    it('should handle first nisab exceed date correctly', async () => {
      const user = await createTestUser();
      
      // Create transactions over time to exceed nisab gradually
      const oldDate = LUNAR_YEAR_DAYS + 10;
      
      await createTestTransaction(user.id, 'buy', 50, oldDate);
      await createTestTransaction(user.id, 'buy', 40, oldDate - 5); // Total: 90g (exceeds nisab)
      
      const result = await updateZakatStatus(user.id);
      
      expect(result!.is_eligible).toBe(true);
      expect(result!.holding_start_date).toBeInstanceOf(Date);
    });

    it('should maintain holding start date across updates', async () => {
      const user = await createTestUser();
      
      // Initial transaction
      await createTestTransaction(user.id, 'buy', 100);
      const first = await updateZakatStatus(user.id);
      
      // Add more gold later
      await createTestTransaction(user.id, 'buy', 50);
      const second = await updateZakatStatus(user.id);
      
      expect(second!.holding_start_date).toEqual(first!.holding_start_date);
    });

    it('should handle complex transaction history', async () => {
      const user = await createTestUser();
      
      // Complex sequence: buy, sell, buy more
      await createTestTransaction(user.id, 'buy', 120, 400); // Long ago
      await createTestTransaction(user.id, 'sell', 50, 300);   // Net: 70g
      await createTestTransaction(user.id, 'buy', 30, 200);    // Net: 100g (exceeds nisab)
      await createTestTransaction(user.id, 'sell', 10, 100);   // Net: 90g
      
      const result = await updateZakatStatus(user.id);
      
      expect(result!.gold_weight_grams).toEqual(90);
      expect(result!.is_eligible).toBe(true); // Held above nisab for lunar year
    });
  });
});