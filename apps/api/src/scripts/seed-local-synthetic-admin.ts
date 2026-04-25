import 'reflect-metadata';
import path from 'path';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';

import { AdminUser } from '../admin-users/admin-user.entity';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';
import { AccountType } from '../users/account-type.enum';
import { User } from '../users/user.entity';

dotenv.config({
  path: path.resolve(__dirname, '../../.env.development.local'),
});

const SEED_EMAIL = 'michaeltalbert@hotmail.com';
const SEED_PASSWORD = 'FounderTTR2026!';

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined,
  entities: [path.resolve(__dirname, '../**/*.entity.{ts,js}')],
  migrations: [path.resolve(__dirname, '../migrations/*.{ts,js}')],
  synchronize: false,
});

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  await dataSource.initialize();

  try {
    const users = dataSource.getRepository(User);
    const adminUsers = dataSource.getRepository(AdminUser);

    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

    let user = await users.findOne({ where: { email: SEED_EMAIL } });
    if (user) {
      user = users.merge(user, {
        passwordHash,
        betaAccessApproved: true,
        role: 'admin',
        emailConfirmed: true,
      });
      user = await users.save(user);
      console.log(`Updated synthetic admin user id=${user.id} email=${user.email}`);
    } else {
      user = users.create({
        email: SEED_EMAIL,
        passwordHash,
        firstName: 'Local',
        lastName: 'Synthetic Admin',
        emailConfirmed: true,
        betaAccessApproved: true,
        role: 'admin',
        subscriptionTier: SubscriptionTier.FREE,
        accountType: AccountType.FREE,
      });
      user = await users.save(user);
      console.log(`Created synthetic admin user id=${user.id} email=${user.email}`);
    }

    const existingAdmin = await adminUsers.findOne({ where: { userId: user.id } });
    if (existingAdmin) {
      const updated = adminUsers.merge(existingAdmin, { role: 'admin' });
      await adminUsers.save(updated);
      console.log(`Admin capability already present (admin_users) userId=${user.id}`);
    } else {
      await adminUsers.save(adminUsers.create({ userId: user.id, role: 'admin' }));
      console.log(`Granted admin capability (admin_users) userId=${user.id}`);
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

