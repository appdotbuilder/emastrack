import { db } from '../db';
import { goldGoalsTable, usersTable } from '../db/schema';
import { type CreateGoalInput, type UpdateGoalInput, type GoldGoal } from '../schema';
import { eq, and, asc } from 'drizzle-orm';

// Handler for creating a new gold purchase goal
export async function createGoal(input: CreateGoalInput): Promise<GoldGoal> {
  try {
    // Verify user exists first
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .execute();

    if (user.length === 0) {
      throw new Error(`User with id ${input.user_id} not found`);
    }

    // Insert goal record
    const result = await db.insert(goldGoalsTable)
      .values({
        user_id: input.user_id,
        target_weight_grams: input.target_weight_grams.toString(),
        deadline: input.deadline,
        title: input.title,
        description: input.description || null,
        is_completed: false
      })
      .returning()
      .execute();

    // Convert numeric fields back to numbers before returning
    const goal = result[0];
    return {
      ...goal,
      target_weight_grams: parseFloat(goal.target_weight_grams)
    };
  } catch (error) {
    console.error('Goal creation failed:', error);
    throw error;
  }
}

// Handler for updating an existing gold purchase goal
export async function updateGoal(input: UpdateGoalInput): Promise<GoldGoal> {
  try {
    // First check if goal exists
    const existingGoal = await db.select()
      .from(goldGoalsTable)
      .where(eq(goldGoalsTable.id, input.id))
      .execute();

    if (existingGoal.length === 0) {
      throw new Error(`Goal with id ${input.id} not found`);
    }

    // Build update object with only provided fields
    const updateData: any = {
      updated_at: new Date()
    };

    if (input.target_weight_grams !== undefined) {
      updateData.target_weight_grams = input.target_weight_grams.toString();
    }
    if (input.deadline !== undefined) {
      updateData.deadline = input.deadline;
    }
    if (input.title !== undefined) {
      updateData.title = input.title;
    }
    if (input.description !== undefined) {
      updateData.description = input.description;
    }
    if (input.is_completed !== undefined) {
      updateData.is_completed = input.is_completed;
    }

    // Update the goal
    const result = await db.update(goldGoalsTable)
      .set(updateData)
      .where(eq(goldGoalsTable.id, input.id))
      .returning()
      .execute();

    // Convert numeric fields back to numbers before returning
    const goal = result[0];
    return {
      ...goal,
      target_weight_grams: parseFloat(goal.target_weight_grams)
    };
  } catch (error) {
    console.error('Goal update failed:', error);
    throw error;
  }
}

// Handler for deleting a gold purchase goal
export async function deleteGoal(goalId: number, userId: number): Promise<boolean> {
  try {
    // Delete the goal with both ID and user_id conditions for security
    const result = await db.delete(goldGoalsTable)
      .where(and(
        eq(goldGoalsTable.id, goalId),
        eq(goldGoalsTable.user_id, userId)
      ))
      .returning()
      .execute();

    // Return true if a goal was deleted, false if no matching goal found
    return result.length > 0;
  } catch (error) {
    console.error('Goal deletion failed:', error);
    throw error;
  }
}

// Handler for getting user's gold purchase goals
export async function getUserGoals(userId: number): Promise<GoldGoal[]> {
  try {
    // Fetch all goals for the user ordered by deadline ascending
    const results = await db.select()
      .from(goldGoalsTable)
      .where(eq(goldGoalsTable.user_id, userId))
      .orderBy(asc(goldGoalsTable.deadline))
      .execute();

    // Convert numeric fields back to numbers before returning
    return results.map(goal => ({
      ...goal,
      target_weight_grams: parseFloat(goal.target_weight_grams)
    }));
  } catch (error) {
    console.error('Get user goals failed:', error);
    throw error;
  }
}

// Handler for getting a specific goal by ID
export async function getGoalById(goalId: number, userId: number): Promise<GoldGoal | null> {
  try {
    // Find goal by ID and verify it belongs to the user
    const results = await db.select()
      .from(goldGoalsTable)
      .where(and(
        eq(goldGoalsTable.id, goalId),
        eq(goldGoalsTable.user_id, userId)
      ))
      .execute();

    if (results.length === 0) {
      return null;
    }

    // Convert numeric fields back to numbers before returning
    const goal = results[0];
    return {
      ...goal,
      target_weight_grams: parseFloat(goal.target_weight_grams)
    };
  } catch (error) {
    console.error('Get goal by ID failed:', error);
    throw error;
  }
}

// Handler for marking a goal as completed
export async function markGoalCompleted(goalId: number, userId: number): Promise<GoldGoal | null> {
  try {
    // Update the goal to completed with user verification
    const result = await db.update(goldGoalsTable)
      .set({
        is_completed: true,
        updated_at: new Date()
      })
      .where(and(
        eq(goldGoalsTable.id, goalId),
        eq(goldGoalsTable.user_id, userId)
      ))
      .returning()
      .execute();

    if (result.length === 0) {
      return null;
    }

    // Convert numeric fields back to numbers before returning
    const goal = result[0];
    return {
      ...goal,
      target_weight_grams: parseFloat(goal.target_weight_grams)
    };
  } catch (error) {
    console.error('Mark goal completed failed:', error);
    throw error;
  }
}