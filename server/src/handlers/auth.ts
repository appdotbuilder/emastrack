import { db } from '../db';
import { usersTable } from '../db/schema';
import { type SignUpInput, type SignInInput, type GoogleAuthInput, type User } from '../schema';
import { eq } from 'drizzle-orm';


// Handler for user registration with email/password
export async function signUp(input: SignUpInput): Promise<User> {
  try {
    // Check if user already exists
    const existingUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .execute();

    if (existingUser.length > 0) {
      throw new Error('User with this email already exists');
    }

    // Hash the password using Bun's built-in password hashing
    const passwordHash = await Bun.password.hash(input.password);

    // Create new user
    const result = await db.insert(usersTable)
      .values({
        email: input.email,
        password_hash: passwordHash,
        name: input.name,
        google_id: null
      })
      .returning()
      .execute();

    const user = result[0];
    return {
      id: user.id,
      email: user.email,
      password_hash: user.password_hash,
      name: user.name,
      google_id: user.google_id,
      created_at: user.created_at,
      updated_at: user.updated_at
    };
  } catch (error) {
    console.error('Sign up failed:', error);
    throw error;
  }
}

// Handler for user login with email/password
export async function signIn(input: SignInInput): Promise<User | null> {
  try {
    // Find user by email
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .execute();

    if (users.length === 0) {
      return null; // User not found
    }

    const user = users[0];

    // Verify password using Bun's built-in password verification
    const isValidPassword = await Bun.password.verify(input.password, user.password_hash);
    if (!isValidPassword) {
      return null; // Invalid password
    }

    return {
      id: user.id,
      email: user.email,
      password_hash: user.password_hash,
      name: user.name,
      google_id: user.google_id,
      created_at: user.created_at,
      updated_at: user.updated_at
    };
  } catch (error) {
    console.error('Sign in failed:', error);
    throw error;
  }
}

// Handler for Google OAuth authentication
export async function googleAuth(input: GoogleAuthInput): Promise<User> {
  try {
    // Check if user with google_id already exists
    const existingUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.google_id, input.google_id))
      .execute();

    if (existingUser.length > 0) {
      // Return existing user
      const user = existingUser[0];
      return {
        id: user.id,
        email: user.email,
        password_hash: user.password_hash,
        name: user.name,
        google_id: user.google_id,
        created_at: user.created_at,
        updated_at: user.updated_at
      };
    }

    // Check if user with same email already exists (but without Google ID)
    const emailUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .execute();

    if (emailUser.length > 0) {
      // Update existing user with Google ID
      const result = await db.update(usersTable)
        .set({
          google_id: input.google_id,
          updated_at: new Date()
        })
        .where(eq(usersTable.email, input.email))
        .returning()
        .execute();

      const user = result[0];
      return {
        id: user.id,
        email: user.email,
        password_hash: user.password_hash,
        name: user.name,
        google_id: user.google_id,
        created_at: user.created_at,
        updated_at: user.updated_at
      };
    }

    // Create new user with Google credentials
    const result = await db.insert(usersTable)
      .values({
        email: input.email,
        password_hash: 'google_oauth_user', // Placeholder for Google OAuth users
        name: input.name,
        google_id: input.google_id
      })
      .returning()
      .execute();

    const user = result[0];
    return {
      id: user.id,
      email: user.email,
      password_hash: user.password_hash,
      name: user.name,
      google_id: user.google_id,
      created_at: user.created_at,
      updated_at: user.updated_at
    };
  } catch (error) {
    console.error('Google auth failed:', error);
    throw error;
  }
}