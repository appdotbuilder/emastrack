import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, goldTransactionsTable } from '../db/schema';
import { type CreateTransactionInput, type UpdateTransactionInput } from '../schema';
import { 
  createTransaction, 
  updateTransaction, 
  deleteTransaction, 
  getUserTransactions, 
  getTransactionById 
} from '../handlers/transactions';
import { eq } from 'drizzle-orm';

// Test data
const testUser = {
  email: 'testuser@example.com',
  password_hash: 'hashed_password',
  name: 'Test User'
};

const testTransactionInput: CreateTransactionInput = {
  user_id: 1,
  type: 'buy' as const,
  weight_grams: 10.5,
  price_per_gram: 65.75,
  transaction_date: new Date('2024-01-15T10:00:00Z'),
  description: 'First gold purchase'
};

describe('Transaction Handlers', () => {
  let userId: number;

  beforeEach(async () => {
    await createDB();
    
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    
    userId = userResult[0].id;
  });

  afterEach(resetDB);

  describe('createTransaction', () => {
    it('should create a new transaction', async () => {
      const input = { ...testTransactionInput, user_id: userId };
      const result = await createTransaction(input);

      expect(result.user_id).toBe(userId);
      expect(result.type).toBe('buy');
      expect(result.weight_grams).toBe(10.5);
      expect(result.price_per_gram).toBe(65.75);
      expect(result.total_price).toBe(690.38);
      expect(result.transaction_date).toEqual(input.transaction_date);
      expect(result.description).toBe('First gold purchase');
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should calculate total_price correctly', async () => {
      const input = { ...testTransactionInput, user_id: userId, weight_grams: 25.0, price_per_gram: 70.0 };
      const result = await createTransaction(input);

      expect(result.total_price).toBe(1750.0);
      expect(typeof result.total_price).toBe('number');
    });

    it('should handle sell transactions', async () => {
      const input = { ...testTransactionInput, user_id: userId, type: 'sell' as const };
      const result = await createTransaction(input);

      expect(result.type).toBe('sell');
    });

    it('should handle null description', async () => {
      const input = { ...testTransactionInput, user_id: userId, description: undefined };
      const result = await createTransaction(input);

      expect(result.description).toBe(null);
    });

    it('should save transaction to database', async () => {
      const input = { ...testTransactionInput, user_id: userId };
      const result = await createTransaction(input);

      const savedTransactions = await db.select()
        .from(goldTransactionsTable)
        .where(eq(goldTransactionsTable.id, result.id))
        .execute();

      expect(savedTransactions).toHaveLength(1);
      expect(savedTransactions[0].user_id).toBe(userId);
      expect(parseFloat(savedTransactions[0].weight_grams)).toBe(10.5);
      expect(parseFloat(savedTransactions[0].price_per_gram)).toBe(65.75);
    });

    it('should handle transaction for non-existent user', async () => {
      const input = { ...testTransactionInput, user_id: 999 };
      
      // Should throw due to foreign key constraint violation, not manual validation
      await expect(createTransaction(input)).rejects.toThrow();
    });
  });

  describe('updateTransaction', () => {
    let transactionId: number;

    beforeEach(async () => {
      // Create a transaction to update
      const input = { ...testTransactionInput, user_id: userId };
      const transaction = await createTransaction(input);
      transactionId = transaction.id;
    });

    it('should update transaction fields', async () => {
      const updateInput: UpdateTransactionInput = {
        id: transactionId,
        weight_grams: 15.0,
        price_per_gram: 70.0,
        description: 'Updated description'
      };

      const result = await updateTransaction(updateInput);

      expect(result.weight_grams).toBe(15.0);
      expect(result.price_per_gram).toBe(70.0);
      expect(result.total_price).toBe(15.0 * 70.0);
      expect(result.description).toBe('Updated description');
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should recalculate total_price when weight changes', async () => {
      const updateInput: UpdateTransactionInput = {
        id: transactionId,
        weight_grams: 20.0
      };

      const result = await updateTransaction(updateInput);

      expect(result.weight_grams).toBe(20.0);
      expect(result.total_price).toBe(20.0 * 65.75); // Original price per gram
    });

    it('should recalculate total_price when price changes', async () => {
      const updateInput: UpdateTransactionInput = {
        id: transactionId,
        price_per_gram: 80.0
      };

      const result = await updateTransaction(updateInput);

      expect(result.price_per_gram).toBe(80.0);
      expect(result.total_price).toBe(10.5 * 80.0); // Original weight
    });

    it('should update transaction type', async () => {
      const updateInput: UpdateTransactionInput = {
        id: transactionId,
        type: 'sell'
      };

      const result = await updateTransaction(updateInput);

      expect(result.type).toBe('sell');
    });

    it('should handle null description update', async () => {
      const updateInput: UpdateTransactionInput = {
        id: transactionId,
        description: null
      };

      const result = await updateTransaction(updateInput);

      expect(result.description).toBe(null);
    });

    it('should handle update for non-existent transaction', async () => {
      const updateInput: UpdateTransactionInput = {
        id: 999,
        weight_grams: 15.0
      };

      await expect(updateTransaction(updateInput)).rejects.toThrow();
    });
  });

  describe('deleteTransaction', () => {
    let transactionId: number;

    beforeEach(async () => {
      // Create a transaction to delete
      const input = { ...testTransactionInput, user_id: userId };
      const transaction = await createTransaction(input);
      transactionId = transaction.id;
    });

    it('should delete transaction successfully', async () => {
      const result = await deleteTransaction(transactionId, userId);

      expect(result).toBe(true);

      // Verify transaction is deleted
      const transactions = await db.select()
        .from(goldTransactionsTable)
        .where(eq(goldTransactionsTable.id, transactionId))
        .execute();

      expect(transactions).toHaveLength(0);
    });

    it('should return false for non-existent transaction', async () => {
      const result = await deleteTransaction(999, userId);

      expect(result).toBe(false);
    });

    it('should not delete transaction belonging to different user', async () => {
      // Create another user
      const anotherUser = await db.insert(usersTable)
        .values({ ...testUser, email: 'another@example.com' })
        .returning()
        .execute();

      const result = await deleteTransaction(transactionId, anotherUser[0].id);

      expect(result).toBe(false);

      // Verify original transaction still exists
      const transactions = await db.select()
        .from(goldTransactionsTable)
        .where(eq(goldTransactionsTable.id, transactionId))
        .execute();

      expect(transactions).toHaveLength(1);
    });
  });

  describe('getUserTransactions', () => {
    it('should return empty array for user with no transactions', async () => {
      const result = await getUserTransactions(userId);

      expect(result).toEqual([]);
    });

    it('should return user transactions in descending order by date', async () => {
      // Create multiple transactions with different dates
      const transaction1 = await createTransaction({
        ...testTransactionInput,
        user_id: userId,
        transaction_date: new Date('2024-01-10T10:00:00Z'),
        description: 'First transaction'
      });

      const transaction2 = await createTransaction({
        ...testTransactionInput,
        user_id: userId,
        transaction_date: new Date('2024-01-20T10:00:00Z'),
        description: 'Second transaction'
      });

      const transaction3 = await createTransaction({
        ...testTransactionInput,
        user_id: userId,
        transaction_date: new Date('2024-01-15T10:00:00Z'),
        description: 'Third transaction'
      });

      const result = await getUserTransactions(userId);

      expect(result).toHaveLength(3);
      // Should be ordered by transaction_date descending (newest first)
      expect(result[0].description).toBe('Second transaction'); // 2024-01-20
      expect(result[1].description).toBe('Third transaction');  // 2024-01-15
      expect(result[2].description).toBe('First transaction');  // 2024-01-10
    });

    it('should convert numeric fields to numbers', async () => {
      await createTransaction({ ...testTransactionInput, user_id: userId });

      const result = await getUserTransactions(userId);

      expect(result).toHaveLength(1);
      expect(typeof result[0].weight_grams).toBe('number');
      expect(typeof result[0].price_per_gram).toBe('number');
      expect(typeof result[0].total_price).toBe('number');
    });

    it('should only return transactions for specified user', async () => {
      // Create another user with transactions
      const anotherUser = await db.insert(usersTable)
        .values({ ...testUser, email: 'another@example.com' })
        .returning()
        .execute();

      await createTransaction({ ...testTransactionInput, user_id: userId });
      await createTransaction({ ...testTransactionInput, user_id: anotherUser[0].id });

      const result = await getUserTransactions(userId);

      expect(result).toHaveLength(1);
      expect(result[0].user_id).toBe(userId);
    });

    it('should return empty array for non-existent user', async () => {
      const result = await getUserTransactions(999);
      expect(result).toEqual([]);
    });
  });

  describe('getTransactionById', () => {
    let transactionId: number;

    beforeEach(async () => {
      // Create a transaction to retrieve
      const input = { ...testTransactionInput, user_id: userId };
      const transaction = await createTransaction(input);
      transactionId = transaction.id;
    });

    it('should return transaction by ID', async () => {
      const result = await getTransactionById(transactionId, userId);

      expect(result).toBeDefined();
      expect(result!.id).toBe(transactionId);
      expect(result!.user_id).toBe(userId);
      expect(result!.weight_grams).toBe(10.5);
      expect(result!.price_per_gram).toBe(65.75);
      expect(typeof result!.weight_grams).toBe('number');
      expect(typeof result!.price_per_gram).toBe('number');
      expect(typeof result!.total_price).toBe('number');
    });

    it('should return null for non-existent transaction', async () => {
      const result = await getTransactionById(999, userId);

      expect(result).toBe(null);
    });

    it('should return null for transaction belonging to different user', async () => {
      // Create another user
      const anotherUser = await db.insert(usersTable)
        .values({ ...testUser, email: 'another@example.com' })
        .returning()
        .execute();

      const result = await getTransactionById(transactionId, anotherUser[0].id);

      expect(result).toBe(null);
    });
  });
});