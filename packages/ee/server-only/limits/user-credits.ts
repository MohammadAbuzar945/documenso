import { prisma } from '@documenso/prisma';
import { UserCredits } from '@prisma/client';
const INITIAL_USER_CREDITS = 10;

/**
 * Ensures a user has a UserCredits record, creating one if it doesn't exist.
 * Returns the user's credits record.
 */
export const ensureUserCredits = async (userId: number) => {
  let userCredits = await prisma.userCredits.findUnique({
    where: {
      userId,
    },
  });

  if (!userCredits) {
    // Initialize with initial credits (10)
    userCredits = await prisma.userCredits.create({
      data: {
        userId,
        credits: INITIAL_USER_CREDITS,
        isActive: true,
      },
    });
  }

  // Check if credits have expired
  if (userCredits.expiresAt && userCredits.expiresAt < new Date()) {
    // Reset credits if expired
    userCredits = await prisma.userCredits.update({
      where: {
        id: userCredits.id,
      },
      data: {
        credits: INITIAL_USER_CREDITS,
        expiresAt: null,
        isActive: true,
      },
    });
  }

  return userCredits;
};

/**
 * Deducts credits from a user's account.
 * Returns the updated credits record.
 */
export const deductUserCredits = async (userId: number, amount: number = 1) => {
  const userCredits = await ensureUserCredits(userId);

  const updatedCredits = await prisma.userCredits.update({
    where: {
      id: userCredits.id,
    },
    data: {
      credits: Math.max(userCredits.credits - amount, 0),
    },
  });

  return updatedCredits;
};

/**
 * Gets the current credits for a user.
 */
export const getUserCredits = async (userId: number) => {
  try {
    const userCredits = await ensureUserCredits(userId);
    return userCredits.credits;
  } catch (err) {
    console.error('Error in getUserCredits:', err);
    // If table doesn't exist or other Prisma error, return default
    if (err instanceof Error && err.message.includes('does not exist')) {
      throw new Error('UserCredits table does not exist. Please run migrations.');
    }
    throw err;
  }
};
