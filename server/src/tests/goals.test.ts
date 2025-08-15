import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { goldGoalsTable, usersTable } from '../db/schema';
import { type CreateGoalInput, type UpdateGoalInput } from '../schema';
import { 
  createGoal, 
  updateGoal, 
  deleteGoal, 
  getUserGoals, 
  getGoalById, 
  markGoalCompleted 
} from '../handlers/goals';
import { eq } from 'drizzle-orm';

// Test data setup
let testUserId: number;

const createTestUser = async (): Promise<number> => {
  const result = await db.insert(usersTable)
    .values({
      email: 'testuser@example.com',
      password_hash: 'hashedpassword',
      name: 'Test User'
    })
    .returning()
    .execute();
  
  return result[0].id;
};

const testGoalInput: CreateGoalInput = {
  user_id: 0, // Will be set in beforeEach
  target_weight_grams: 100.5,
  deadline: new Date('2024-12-31'),
  title: 'Save 100g Gold',
  description: 'Goal to save 100 grams of gold by year end'
};

describe('Goals Handlers', () => {
  beforeEach(async () => {
    await createDB();
    testUserId = await createTestUser();
    testGoalInput.user_id = testUserId;
  });
  
  afterEach(resetDB);

  describe('createGoal', () => {
    it('should create a goal successfully', async () => {
      const result = await createGoal(testGoalInput);

      expect(result.id).toBeDefined();
      expect(result.user_id).toEqual(testUserId);
      expect(result.target_weight_grams).toEqual(100.5);
      expect(typeof result.target_weight_grams).toEqual('number');
      expect(result.deadline).toEqual(testGoalInput.deadline);
      expect(result.title).toEqual('Save 100g Gold');
      expect(result.description).toEqual('Goal to save 100 grams of gold by year end');
      expect(result.is_completed).toEqual(false);
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should create a goal with null description', async () => {
      const inputWithoutDescription = {
        ...testGoalInput,
        description: undefined
      };

      const result = await createGoal(inputWithoutDescription);

      expect(result.description).toBeNull();
      expect(result.title).toEqual('Save 100g Gold');
      expect(result.target_weight_grams).toEqual(100.5);
    });

    it('should save goal to database correctly', async () => {
      const result = await createGoal(testGoalInput);

      const goals = await db.select()
        .from(goldGoalsTable)
        .where(eq(goldGoalsTable.id, result.id))
        .execute();

      expect(goals).toHaveLength(1);
      expect(goals[0].user_id).toEqual(testUserId);
      expect(parseFloat(goals[0].target_weight_grams)).toEqual(100.5);
      expect(goals[0].title).toEqual('Save 100g Gold');
      expect(goals[0].is_completed).toEqual(false);
    });

    it('should throw error for non-existent user', async () => {
      const invalidInput = {
        ...testGoalInput,
        user_id: 999999
      };

      await expect(createGoal(invalidInput)).rejects.toThrow(/User with id 999999 not found/i);
    });
  });

  describe('updateGoal', () => {
    let goalId: number;

    beforeEach(async () => {
      const goal = await createGoal(testGoalInput);
      goalId = goal.id;
    });

    it('should update goal successfully', async () => {
      const updateInput: UpdateGoalInput = {
        id: goalId,
        target_weight_grams: 150.75,
        title: 'Updated Goal Title',
        description: 'Updated description',
        is_completed: true
      };

      const result = await updateGoal(updateInput);

      expect(result.id).toEqual(goalId);
      expect(result.target_weight_grams).toEqual(150.75);
      expect(typeof result.target_weight_grams).toEqual('number');
      expect(result.title).toEqual('Updated Goal Title');
      expect(result.description).toEqual('Updated description');
      expect(result.is_completed).toEqual(true);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should update only provided fields', async () => {
      const partialUpdate: UpdateGoalInput = {
        id: goalId,
        title: 'New Title Only'
      };

      const result = await updateGoal(partialUpdate);

      expect(result.title).toEqual('New Title Only');
      expect(result.target_weight_grams).toEqual(100.5); // Should remain unchanged
      expect(result.description).toEqual(testGoalInput.description || null); // Should remain unchanged
      expect(result.is_completed).toEqual(false); // Should remain unchanged
    });

    it('should set description to null when explicitly provided', async () => {
      const updateWithNullDescription: UpdateGoalInput = {
        id: goalId,
        description: null
      };

      const result = await updateGoal(updateWithNullDescription);

      expect(result.description).toBeNull();
      expect(result.title).toEqual(testGoalInput.title); // Should remain unchanged
    });

    it('should throw error for non-existent goal', async () => {
      const updateInput: UpdateGoalInput = {
        id: 999999,
        title: 'Non-existent goal'
      };

      await expect(updateGoal(updateInput)).rejects.toThrow(/Goal with id 999999 not found/i);
    });
  });

  describe('deleteGoal', () => {
    let goalId: number;
    let otherUserId: number;

    beforeEach(async () => {
      const goal = await createGoal(testGoalInput);
      goalId = goal.id;

      // Create another user for security testing
      const otherUser = await db.insert(usersTable)
        .values({
          email: 'otheruser@example.com',
          password_hash: 'hashedpassword',
          name: 'Other User'
        })
        .returning()
        .execute();
      otherUserId = otherUser[0].id;
    });

    it('should delete goal successfully', async () => {
      const result = await deleteGoal(goalId, testUserId);

      expect(result).toBe(true);

      // Verify goal is deleted from database
      const goals = await db.select()
        .from(goldGoalsTable)
        .where(eq(goldGoalsTable.id, goalId))
        .execute();

      expect(goals).toHaveLength(0);
    });

    it('should return false when goal does not exist', async () => {
      const result = await deleteGoal(999999, testUserId);

      expect(result).toBe(false);
    });

    it('should return false when user does not own the goal', async () => {
      const result = await deleteGoal(goalId, otherUserId);

      expect(result).toBe(false);

      // Verify goal still exists in database
      const goals = await db.select()
        .from(goldGoalsTable)
        .where(eq(goldGoalsTable.id, goalId))
        .execute();

      expect(goals).toHaveLength(1);
    });
  });

  describe('getUserGoals', () => {
    beforeEach(async () => {
      // Create multiple goals with different deadlines
      await createGoal({
        ...testGoalInput,
        title: 'Goal 1',
        deadline: new Date('2024-06-01')
      });

      await createGoal({
        ...testGoalInput,
        title: 'Goal 2',
        deadline: new Date('2024-03-01')
      });

      await createGoal({
        ...testGoalInput,
        title: 'Goal 3',
        deadline: new Date('2024-09-01')
      });

      // Create a goal for another user (should not be returned)
      const otherUser = await db.insert(usersTable)
        .values({
          email: 'otheruser@example.com',
          password_hash: 'hashedpassword',
          name: 'Other User'
        })
        .returning()
        .execute();

      await createGoal({
        ...testGoalInput,
        user_id: otherUser[0].id,
        title: 'Other User Goal'
      });
    });

    it('should return user goals ordered by deadline', async () => {
      const results = await getUserGoals(testUserId);

      expect(results).toHaveLength(3);
      expect(results[0].title).toEqual('Goal 2'); // March deadline (earliest)
      expect(results[1].title).toEqual('Goal 1'); // June deadline
      expect(results[2].title).toEqual('Goal 3'); // September deadline (latest)

      // Verify numeric conversion
      results.forEach(goal => {
        expect(typeof goal.target_weight_grams).toEqual('number');
        expect(goal.target_weight_grams).toEqual(100.5);
      });
    });

    it('should return empty array for user with no goals', async () => {
      const newUser = await db.insert(usersTable)
        .values({
          email: 'newuser@example.com',
          password_hash: 'hashedpassword',
          name: 'New User'
        })
        .returning()
        .execute();

      const results = await getUserGoals(newUser[0].id);

      expect(results).toHaveLength(0);
    });
  });

  describe('getGoalById', () => {
    let goalId: number;
    let otherUserId: number;

    beforeEach(async () => {
      const goal = await createGoal(testGoalInput);
      goalId = goal.id;

      // Create another user for security testing
      const otherUser = await db.insert(usersTable)
        .values({
          email: 'otheruser@example.com',
          password_hash: 'hashedpassword',
          name: 'Other User'
        })
        .returning()
        .execute();
      otherUserId = otherUser[0].id;
    });

    it('should return goal when user owns it', async () => {
      const result = await getGoalById(goalId, testUserId);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(goalId);
      expect(result!.user_id).toEqual(testUserId);
      expect(result!.title).toEqual('Save 100g Gold');
      expect(typeof result!.target_weight_grams).toEqual('number');
      expect(result!.target_weight_grams).toEqual(100.5);
    });

    it('should return null when goal does not exist', async () => {
      const result = await getGoalById(999999, testUserId);

      expect(result).toBeNull();
    });

    it('should return null when user does not own the goal', async () => {
      const result = await getGoalById(goalId, otherUserId);

      expect(result).toBeNull();
    });
  });

  describe('markGoalCompleted', () => {
    let goalId: number;
    let otherUserId: number;

    beforeEach(async () => {
      const goal = await createGoal(testGoalInput);
      goalId = goal.id;

      // Create another user for security testing
      const otherUser = await db.insert(usersTable)
        .values({
          email: 'otheruser@example.com',
          password_hash: 'hashedpassword',
          name: 'Other User'
        })
        .returning()
        .execute();
      otherUserId = otherUser[0].id;
    });

    it('should mark goal as completed successfully', async () => {
      const result = await markGoalCompleted(goalId, testUserId);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(goalId);
      expect(result!.is_completed).toBe(true);
      expect(result!.updated_at).toBeInstanceOf(Date);
      expect(typeof result!.target_weight_grams).toEqual('number');

      // Verify in database
      const goals = await db.select()
        .from(goldGoalsTable)
        .where(eq(goldGoalsTable.id, goalId))
        .execute();

      expect(goals[0].is_completed).toBe(true);
    });

    it('should return null when goal does not exist', async () => {
      const result = await markGoalCompleted(999999, testUserId);

      expect(result).toBeNull();
    });

    it('should return null when user does not own the goal', async () => {
      const result = await markGoalCompleted(goalId, otherUserId);

      expect(result).toBeNull();

      // Verify goal remains incomplete
      const goals = await db.select()
        .from(goldGoalsTable)
        .where(eq(goldGoalsTable.id, goalId))
        .execute();

      expect(goals[0].is_completed).toBe(false);
    });
  });
});