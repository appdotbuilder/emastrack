import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type SignUpInput, type SignInInput, type GoogleAuthInput } from '../schema';
import { signUp, signIn, googleAuth } from '../handlers/auth';
import { eq } from 'drizzle-orm';


describe('Auth Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('signUp', () => {
    const testSignUpInput: SignUpInput = {
      email: 'test@example.com',
      password: 'testpassword123',
      name: 'Test User'
    };

    it('should create a new user with hashed password', async () => {
      const result = await signUp(testSignUpInput);

      expect(result.email).toEqual('test@example.com');
      expect(result.name).toEqual('Test User');
      expect(result.google_id).toBeNull();
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);

      // Verify password is hashed (not the original password)
      expect(result.password_hash).not.toEqual('testpassword123');
      expect(result.password_hash.length).toBeGreaterThan(10);

      // Verify password hash is valid using Bun's password verification
      const isValidHash = await Bun.password.verify('testpassword123', result.password_hash);
      expect(isValidHash).toBe(true);
    });

    it('should save user to database', async () => {
      const result = await signUp(testSignUpInput);

      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, result.id))
        .execute();

      expect(users).toHaveLength(1);
      expect(users[0].email).toEqual('test@example.com');
      expect(users[0].name).toEqual('Test User');
      expect(users[0].google_id).toBeNull();
    });

    it('should throw error when email already exists', async () => {
      // Create first user
      await signUp(testSignUpInput);

      // Try to create user with same email
      const duplicateInput: SignUpInput = {
        email: 'test@example.com',
        password: 'differentpassword',
        name: 'Different User'
      };

      await expect(signUp(duplicateInput)).rejects.toThrow(/already exists/i);
    });
  });

  describe('signIn', () => {
    const testUser: SignUpInput = {
      email: 'signin@example.com',
      password: 'mypassword123',
      name: 'Sign In User'
    };

    beforeEach(async () => {
      // Create a user for sign in tests
      await signUp(testUser);
    });

    it('should return user with valid credentials', async () => {
      const signInInput: SignInInput = {
        email: 'signin@example.com',
        password: 'mypassword123'
      };

      const result = await signIn(signInInput);

      expect(result).not.toBeNull();
      expect(result!.email).toEqual('signin@example.com');
      expect(result!.name).toEqual('Sign In User');
      expect(result!.google_id).toBeNull();
      expect(result!.id).toBeDefined();
    });

    it('should return null with invalid email', async () => {
      const signInInput: SignInInput = {
        email: 'nonexistent@example.com',
        password: 'mypassword123'
      };

      const result = await signIn(signInInput);

      expect(result).toBeNull();
    });

    it('should return null with invalid password', async () => {
      const signInInput: SignInInput = {
        email: 'signin@example.com',
        password: 'wrongpassword'
      };

      const result = await signIn(signInInput);

      expect(result).toBeNull();
    });

    it('should return null with correct email but wrong password', async () => {
      const signInInput: SignInInput = {
        email: 'signin@example.com',
        password: 'almostcorrect123'
      };

      const result = await signIn(signInInput);

      expect(result).toBeNull();
    });
  });

  describe('googleAuth', () => {
    const googleInput: GoogleAuthInput = {
      google_id: 'google_12345',
      email: 'google@example.com',
      name: 'Google User'
    };

    it('should create new user with Google credentials', async () => {
      const result = await googleAuth(googleInput);

      expect(result.email).toEqual('google@example.com');
      expect(result.name).toEqual('Google User');
      expect(result.google_id).toEqual('google_12345');
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
      expect(result.password_hash).toEqual('google_oauth_user');
    });

    it('should return existing user with same Google ID', async () => {
      // Create user first
      const firstResult = await googleAuth(googleInput);

      // Try to authenticate again with same Google ID
      const secondResult = await googleAuth(googleInput);

      expect(secondResult.id).toEqual(firstResult.id);
      expect(secondResult.email).toEqual('google@example.com');
      expect(secondResult.google_id).toEqual('google_12345');
    });

    it('should update existing email user with Google ID', async () => {
      // Create regular user first
      const signUpInput: SignUpInput = {
        email: 'existing@example.com',
        password: 'password123',
        name: 'Existing User'
      };
      const existingUser = await signUp(signUpInput);

      // Try Google auth with same email
      const googleInput: GoogleAuthInput = {
        google_id: 'google_67890',
        email: 'existing@example.com',
        name: 'Updated Google User'
      };

      const result = await googleAuth(googleInput);

      expect(result.id).toEqual(existingUser.id);
      expect(result.email).toEqual('existing@example.com');
      expect(result.google_id).toEqual('google_67890');
      expect(result.updated_at).not.toEqual(existingUser.updated_at);
    });

    it('should save Google user to database', async () => {
      const result = await googleAuth(googleInput);

      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, result.id))
        .execute();

      expect(users).toHaveLength(1);
      expect(users[0].email).toEqual('google@example.com');
      expect(users[0].name).toEqual('Google User');
      expect(users[0].google_id).toEqual('google_12345');
    });

    it('should handle multiple Google users with different IDs', async () => {
      const user1Input: GoogleAuthInput = {
        google_id: 'google_111',
        email: 'user1@gmail.com',
        name: 'Google User 1'
      };

      const user2Input: GoogleAuthInput = {
        google_id: 'google_222',
        email: 'user2@gmail.com',
        name: 'Google User 2'
      };

      const result1 = await googleAuth(user1Input);
      const result2 = await googleAuth(user2Input);

      expect(result1.id).not.toEqual(result2.id);
      expect(result1.google_id).toEqual('google_111');
      expect(result2.google_id).toEqual('google_222');

      // Verify both users are in database
      const allUsers = await db.select().from(usersTable).execute();
      expect(allUsers).toHaveLength(2);
    });
  });
});