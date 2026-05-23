import bcrypt from 'bcrypt';

export type UserRole = 'admin' | 'viewer';

interface StoredUser {
  passwordHash: string;
  role: UserRole;
}

export const USER_STORE = new Map<string, StoredUser>();

let _seeded = false;

export async function seedUsers(saltRounds = 10): Promise<void> {
  if (_seeded) return;
  _seeded = true;
  USER_STORE.set('alice', {
    passwordHash: await bcrypt.hash('alice-password', saltRounds),
    role: 'admin',
  });
  USER_STORE.set('bob', {
    passwordHash: await bcrypt.hash('bob-password', saltRounds),
    role: 'viewer',
  });
}

export async function verifyUser(
  userId: string,
  password: string
): Promise<UserRole | null> {
  const user = USER_STORE.get(userId);
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? user.role : null;
}
