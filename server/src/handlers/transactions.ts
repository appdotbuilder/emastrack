import { db } from '../db';
import { goldTransactionsTable, usersTable } from '../db/schema';
import { type CreateTransactionInput, type UpdateTransactionInput, type GoldTransaction } from '../schema';
import { eq, and, desc } from 'drizzle-orm';

// Handler for creating a new gold transaction
export async function createTransaction(input: CreateTransactionInput): Promise<GoldTransaction> {
  try {

    // Calculate total price with proper precision handling
    const totalPrice = Math.round((input.weight_grams * input.price_per_gram) * 100) / 100;

    // Insert new transaction
    const result = await db.insert(goldTransactionsTable)
      .values({
        user_id: input.user_id,
        type: input.type,
        weight_grams: input.weight_grams.toString(),
        price_per_gram: input.price_per_gram.toString(),
        total_price: totalPrice.toString(),
        transaction_date: input.transaction_date,
        description: input.description || null
      })
      .returning()
      .execute();

    const transaction = result[0];

    // Convert numeric fields back to numbers
    return {
      ...transaction,
      weight_grams: parseFloat(transaction.weight_grams),
      price_per_gram: parseFloat(transaction.price_per_gram),
      total_price: parseFloat(transaction.total_price)
    };
  } catch (error) {
    console.error('Transaction creation failed:', error);
    throw error;
  }
}

// Handler for updating an existing gold transaction
export async function updateTransaction(input: UpdateTransactionInput): Promise<GoldTransaction> {
  try {
    // First, get the existing transaction
    const existingTransactions = await db.select()
      .from(goldTransactionsTable)
      .where(eq(goldTransactionsTable.id, input.id))
      .execute();

    if (existingTransactions.length === 0) {
      throw new Error('Transaction not found');
    }

    const existingTransaction = existingTransactions[0];

    // Prepare update values
    const updateValues: any = {
      updated_at: new Date()
    };

    // Only include fields that are provided
    if (input.type !== undefined) {
      updateValues.type = input.type;
    }
    if (input.weight_grams !== undefined) {
      updateValues.weight_grams = input.weight_grams.toString();
    }
    if (input.price_per_gram !== undefined) {
      updateValues.price_per_gram = input.price_per_gram.toString();
    }
    if (input.transaction_date !== undefined) {
      updateValues.transaction_date = input.transaction_date;
    }
    if (input.description !== undefined) {
      updateValues.description = input.description;
    }

    // Recalculate total_price if weight or price changed
    const finalWeightGrams = input.weight_grams !== undefined ? input.weight_grams : parseFloat(existingTransaction.weight_grams);
    const finalPricePerGram = input.price_per_gram !== undefined ? input.price_per_gram : parseFloat(existingTransaction.price_per_gram);
    
    if (input.weight_grams !== undefined || input.price_per_gram !== undefined) {
      const recalculatedTotal = Math.round((finalWeightGrams * finalPricePerGram) * 100) / 100;
      updateValues.total_price = recalculatedTotal.toString();
    }

    // Update the transaction
    const result = await db.update(goldTransactionsTable)
      .set(updateValues)
      .where(eq(goldTransactionsTable.id, input.id))
      .returning()
      .execute();

    const updatedTransaction = result[0];

    // Convert numeric fields back to numbers
    return {
      ...updatedTransaction,
      weight_grams: parseFloat(updatedTransaction.weight_grams),
      price_per_gram: parseFloat(updatedTransaction.price_per_gram),
      total_price: parseFloat(updatedTransaction.total_price)
    };
  } catch (error) {
    console.error('Transaction update failed:', error);
    throw error;
  }
}

// Handler for deleting a gold transaction
export async function deleteTransaction(transactionId: number, userId: number): Promise<boolean> {
  try {
    // Delete the transaction, ensuring it belongs to the user
    const result = await db.delete(goldTransactionsTable)
      .where(and(
        eq(goldTransactionsTable.id, transactionId),
        eq(goldTransactionsTable.user_id, userId)
      ))
      .returning()
      .execute();

    return result.length > 0;
  } catch (error) {
    console.error('Transaction deletion failed:', error);
    throw error;
  }
}

// Handler for getting user's gold transactions
export async function getUserTransactions(userId: number): Promise<GoldTransaction[]> {
  try {
    // Fetch all transactions for the user, ordered by transaction_date descending
    const transactions = await db.select()
      .from(goldTransactionsTable)
      .where(eq(goldTransactionsTable.user_id, userId))
      .orderBy(desc(goldTransactionsTable.transaction_date))
      .execute();

    // Convert numeric fields back to numbers
    return transactions.map(transaction => ({
      ...transaction,
      weight_grams: parseFloat(transaction.weight_grams),
      price_per_gram: parseFloat(transaction.price_per_gram),
      total_price: parseFloat(transaction.total_price)
    }));
  } catch (error) {
    console.error('Failed to get user transactions:', error);
    throw error;
  }
}

// Handler for getting a specific transaction by ID
export async function getTransactionById(transactionId: number, userId: number): Promise<GoldTransaction | null> {
  try {
    // Find the transaction by ID and verify it belongs to the user
    const transactions = await db.select()
      .from(goldTransactionsTable)
      .where(and(
        eq(goldTransactionsTable.id, transactionId),
        eq(goldTransactionsTable.user_id, userId)
      ))
      .execute();

    if (transactions.length === 0) {
      return null;
    }

    const transaction = transactions[0];

    // Convert numeric fields back to numbers
    return {
      ...transaction,
      weight_grams: parseFloat(transaction.weight_grams),
      price_per_gram: parseFloat(transaction.price_per_gram),
      total_price: parseFloat(transaction.total_price)
    };
  } catch (error) {
    console.error('Failed to get transaction by ID:', error);
    throw error;
  }
}