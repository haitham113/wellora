import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../../src/app.module.js';
import type { AuthPrincipal } from '../../src/common/auth/auth-principal.js';
import {
  AccountStatus,
  EmployerMembershipRole,
  OrganizationStatus,
} from '../../src/generated/prisma/enums.js';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { EmployerAllowancesService } from '../../src/modules/allowances/employer-allowances.service.js';
import { PasswordHasher } from '../../src/modules/auth/password-hasher.service.js';

describe('allowance financial invariants', () => {
  let module: TestingModule;
  let database: PrismaService;
  let allowances: EmployerAllowancesService;
  let principal: AuthPrincipal;
  const prefix = `p6fin-${randomUUID().slice(0, 8)}`;
  let userId: string;
  let employerId: string;
  let employeeId: string;
  let accountId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    database = module.get(PrismaService);
    allowances = module.get(EmployerAllowancesService);
    const email = `${prefix}@example.com`;
    const user = await database.user.create({
      data: {
        email,
        normalizedEmail: email,
        passwordHash: await module.get(PasswordHasher).hash('correct horse battery staple'),
        status: AccountStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });
    userId = user.id;
    const employer = await database.employer.create({
      data: {
        name: `${prefix} Employer`,
        slug: `${prefix}-employer`,
        normalizedSlug: `${prefix}-employer`,
        status: OrganizationStatus.ACTIVE,
        country: 'GB',
        timezone: 'Europe/London',
        defaultCurrency: 'GBP',
        memberships: { create: { userId, role: EmployerMembershipRole.ADMIN } },
        employees: {
          create: {
            email: `${prefix}-employee@example.com`,
            normalizedEmail: `${prefix}-employee@example.com`,
            firstName: 'Invariant',
            lastName: 'Employee',
          },
        },
      },
      include: { employees: true },
    });
    const employee = employer.employees[0];
    if (employee === undefined) throw new Error('Expected financial invariant employee.');
    employerId = employer.id;
    employeeId = employee.id;
    principal = { userId, sessionId: randomUUID(), platformRole: null };
    const initial = await allowances.initialAllocation(
      principal,
      employerId,
      employeeId,
      { amountMinor: '100000', currency: 'GBP', referenceId: randomUUID() },
      'financial-initial',
    );
    accountId = initial.account.id;
  });

  afterAll(async () => {
    await database.$executeRaw`
      TRUNCATE TABLE "audit_logs", "allowance_transactions", "allowance_accounts" CASCADE
    `;
    await database.employee.deleteMany({ where: { employerId } });
    await database.employerMembership.deleteMany({ where: { employerId } });
    await database.employer.delete({ where: { id: employerId } });
    await database.user.delete({ where: { id: userId } });
    await module.close();
  });

  it('serializes concurrent updates without lost balance or ledger sequence', async () => {
    const commands = Array.from({ length: 12 }, (_, index) => ({
      amountMinor: String(index + 1),
      currency: 'GBP',
      referenceId: randomUUID(),
    }));
    await Promise.all(
      commands.map((command, index) =>
        allowances.topUp(
          principal,
          employerId,
          employeeId,
          command,
          `financial-topup-${String(index)}`,
        ),
      ),
    );

    const account = await database.allowanceAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    const entries = await database.allowanceTransaction.findMany({
      where: { accountId },
      orderBy: { sequence: 'asc' },
    });
    const ledgerSum = entries.reduce((sum, entry) => sum + entry.amountDeltaMinor, 0n);
    expect(account.currentBalanceMinor).toBe(100_078n);
    expect(account.currentBalanceMinor).toBe(ledgerSum);
    expect(account.version).toBe(entries.length);
    expect(entries.map((entry) => entry.sequence)).toEqual(
      Array.from({ length: entries.length }, (_, index) => index + 1),
    );
    expect(entries.at(-1)?.resultingBalanceMinor).toBe(account.currentBalanceMinor);
    for (const [index, entry] of entries.entries()) {
      const priorBalance = index === 0 ? 0n : entries[index - 1]?.resultingBalanceMinor;
      if (priorBalance === undefined) throw new Error('Ledger sequence has a missing predecessor.');
      expect(entry.resultingBalanceMinor).toBe(priorBalance + entry.amountDeltaMinor);
      expect(entry.currency).toBe(account.currency);
    }
  });
});
