import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../../src/app.module.js';
import type { AuthPrincipal } from '../../src/common/auth/auth-principal.js';
import {
  AccountStatus,
  AllowanceReferenceType,
  AllowanceTransactionType,
  EmployerMembershipRole,
  LedgerActorType,
  OrganizationStatus,
} from '../../src/generated/prisma/enums.js';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { AllowanceLedgerService } from '../../src/modules/allowances/allowance-ledger.service.js';
import { AllowanceQueriesService } from '../../src/modules/allowances/allowance-queries.service.js';
import { EmployerAllowancesService } from '../../src/modules/allowances/employer-allowances.service.js';
import { PasswordHasher } from '../../src/modules/auth/password-hasher.service.js';

describe('allowance persistence (integration)', () => {
  let module: TestingModule;
  let database: PrismaService;
  let allowances: EmployerAllowancesService;
  let ledger: AllowanceLedgerService;
  let allowanceQueries: AllowanceQueriesService;
  let principal: AuthPrincipal;
  const prefix = `p6int-${randomUUID().slice(0, 8)}`;
  let adminUserId: string;
  let employeeUserId: string;
  let otherAdminUserId: string;
  let employerId: string;
  let otherEmployerId: string;
  let employeeId: string;
  let accountId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    database = module.get(PrismaService);
    allowances = module.get(EmployerAllowancesService);
    ledger = module.get(AllowanceLedgerService);
    allowanceQueries = module.get(AllowanceQueriesService);
    const hasher = module.get(PasswordHasher);
    const passwordHash = await hasher.hash('correct horse battery staple');
    const users = await Promise.all(
      ['admin', 'employee', 'other-admin'].map((name) => {
        const email = `${prefix}-${name}@example.com`;
        return database.user.create({
          data: {
            email,
            normalizedEmail: email,
            passwordHash,
            status: AccountStatus.ACTIVE,
            emailVerifiedAt: new Date(),
          },
        });
      }),
    );
    const admin = users[0];
    const employeeUser = users[1];
    const otherAdmin = users[2];
    if (admin === undefined || employeeUser === undefined || otherAdmin === undefined) {
      throw new Error('Expected allowance integration users.');
    }
    adminUserId = admin.id;
    employeeUserId = employeeUser.id;
    otherAdminUserId = otherAdmin.id;

    const employer = await database.employer.create({
      data: {
        name: `${prefix} Employer`,
        slug: `${prefix}-employer`,
        normalizedSlug: `${prefix}-employer`,
        status: OrganizationStatus.ACTIVE,
        country: 'GB',
        timezone: 'Europe/London',
        defaultCurrency: 'GBP',
        memberships: {
          create: { userId: adminUserId, role: EmployerMembershipRole.ADMIN },
        },
        employees: {
          create: {
            userId: employeeUserId,
            email: employeeUser.email,
            normalizedEmail: employeeUser.normalizedEmail,
            firstName: 'Ada',
            lastName: 'Ledger',
          },
        },
      },
      include: { employees: true },
    });
    const employee = employer.employees[0];
    if (employee === undefined) throw new Error('Expected allowance integration employee.');
    employerId = employer.id;
    employeeId = employee.id;
    await database.employerMembership.create({
      data: {
        employerId,
        userId: employeeUserId,
        role: EmployerMembershipRole.EMPLOYEE,
      },
    });
    const otherEmployer = await database.employer.create({
      data: {
        name: `${prefix} Other Employer`,
        slug: `${prefix}-other-employer`,
        normalizedSlug: `${prefix}-other-employer`,
        status: OrganizationStatus.ACTIVE,
        country: 'EG',
        timezone: 'Africa/Cairo',
        defaultCurrency: 'EGP',
        memberships: {
          create: { userId: otherAdminUserId, role: EmployerMembershipRole.ADMIN },
        },
      },
    });
    otherEmployerId = otherEmployer.id;
    principal = { userId: adminUserId, sessionId: randomUUID(), platformRole: null };
  });

  afterAll(async () => {
    // Append-only tables intentionally reject row deletion. TRUNCATE is test-database teardown,
    // not an application capability, and is needed before deleting foreign-key parents.
    await database.$executeRaw`
      TRUNCATE TABLE "audit_logs", "allowance_transactions", "allowance_accounts" CASCADE
    `;
    await database.employee.deleteMany({
      where: { employerId: { in: [employerId, otherEmployerId] } },
    });
    await database.employerMembership.deleteMany({
      where: { employerId: { in: [employerId, otherEmployerId] } },
    });
    await database.employer.deleteMany({ where: { id: { in: [employerId, otherEmployerId] } } });
    await database.user.deleteMany({
      where: { id: { in: [adminUserId, employeeUserId, otherAdminUserId] } },
    });
    await module.close();
  });

  it('records every ledger type atomically and audits manual adjustments', async () => {
    const initial = await allowances.initialAllocation(
      principal,
      employerId,
      employeeId,
      { amountMinor: '10000', currency: 'GBP', referenceId: randomUUID() },
      'p6-initial',
    );
    accountId = initial.account.id;
    await allowances.topUp(
      principal,
      employerId,
      employeeId,
      { amountMinor: '2000', currency: 'GBP', referenceId: randomUUID() },
      'p6-topup',
    );
    const bookingId = randomUUID();
    await database.$transaction((transaction) =>
      ledger.recordBookingDebit(transaction, {
        accountId,
        amountMinor: 2500n,
        currency: 'GBP',
        bookingId,
        actorUserId: employeeUserId,
        correlationId: 'p6-booking-debit',
      }),
    );
    await database.$transaction((transaction) =>
      ledger.recordCancellationRefund(transaction, {
        accountId,
        amountMinor: 1000n,
        currency: 'GBP',
        bookingId,
        actorUserId: employeeUserId,
        correlationId: 'p6-cancellation-refund',
      }),
    );
    const manual = await allowances.manualAdjustment(
      principal,
      employerId,
      employeeId,
      {
        amountDeltaMinor: '-500',
        currency: 'GBP',
        referenceId: randomUUID(),
        reason: 'Correction approved for integration test',
      },
      'p6-manual',
    );
    await allowances.expire(
      principal,
      employerId,
      employeeId,
      {
        amountMinor: '1000',
        currency: 'GBP',
        referenceId: randomUUID(),
        reason: 'Annual expiration',
      },
      'p6-expiration',
    );

    const entries = await database.allowanceTransaction.findMany({
      where: { accountId },
      orderBy: { sequence: 'asc' },
    });
    expect(entries.map((entry) => entry.type)).toEqual([
      AllowanceTransactionType.INITIAL_ALLOCATION,
      AllowanceTransactionType.TOP_UP,
      AllowanceTransactionType.BOOKING_DEBIT,
      AllowanceTransactionType.CANCELLATION_REFUND,
      AllowanceTransactionType.MANUAL_ADJUSTMENT,
      AllowanceTransactionType.EXPIRATION,
    ]);
    expect(entries.map((entry) => entry.resultingBalanceMinor)).toEqual([
      10_000n,
      12_000n,
      9_500n,
      10_500n,
      10_000n,
      9_000n,
    ]);
    await expect(
      database.auditLog.findUniqueOrThrow({
        where: { allowanceTransactionId: manual.transaction.id },
      }),
    ).resolves.toMatchObject({
      action: 'ALLOWANCE_MANUAL_ADJUSTMENT',
      actorUserId: adminUserId,
      correlationId: 'p6-manual',
    });
  });

  it('rolls back a rejected debit without changing either balance or ledger', async () => {
    const before = await database.allowanceAccount.findUniqueOrThrow({ where: { id: accountId } });
    const countBefore = await database.allowanceTransaction.count({ where: { accountId } });
    await expect(
      database.$transaction((transaction) =>
        ledger.recordBookingDebit(transaction, {
          accountId,
          amountMinor: before.currentBalanceMinor + 1n,
          currency: 'GBP',
          bookingId: randomUUID(),
          actorUserId: employeeUserId,
          correlationId: 'p6-rejected-debit',
        }),
      ),
    ).rejects.toMatchObject({ response: { code: 'ALLOWANCE_INSUFFICIENT_BALANCE' } });
    await expect(database.allowanceTransaction.count({ where: { accountId } })).resolves.toBe(
      countBefore,
    );
    await expect(
      database.allowanceAccount.findUniqueOrThrow({ where: { id: accountId } }),
    ).resolves.toMatchObject({
      currentBalanceMinor: before.currentBalanceMinor,
      version: before.version,
    });
  });

  it('enforces immutable history and rejects balance changes without a ledger append', async () => {
    const entry = await database.allowanceTransaction.findFirstOrThrow({ where: { accountId } });
    await expect(
      database.allowanceTransaction.update({
        where: { id: entry.id },
        data: { amountDeltaMinor: 1n },
      }),
    ).rejects.toBeDefined();
    await expect(
      database.allowanceTransaction.delete({ where: { id: entry.id } }),
    ).rejects.toBeDefined();
    await expect(
      database.allowanceAccount.update({
        where: { id: accountId },
        data: { currentBalanceMinor: { increment: 1n } },
      }),
    ).rejects.toBeDefined();
    const audit = await database.auditLog.findFirstOrThrow({
      where: { allowanceTransaction: { accountId } },
    });
    await expect(
      database.auditLog.update({
        where: { id: audit.id },
        data: { correlationId: 'mutated-correlation' },
      }),
    ).rejects.toBeDefined();
  });

  it('rejects a bare ledger append and an account without initial allocation at commit', async () => {
    const account = await database.allowanceAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    const countBefore = await database.allowanceTransaction.count({ where: { accountId } });
    await expect(
      database.$transaction((transaction) =>
        transaction.allowanceTransaction.create({
          data: {
            accountId,
            sequence: account.version + 1,
            type: AllowanceTransactionType.TOP_UP,
            amountDeltaMinor: 100n,
            resultingBalanceMinor: account.currentBalanceMinor + 100n,
            currency: 'GBP',
            referenceType: AllowanceReferenceType.ALLOWANCE_GRANT,
            referenceId: randomUUID(),
            actorType: LedgerActorType.USER,
            actorUserId: adminUserId,
            correlationId: 'p6-bare-ledger',
          },
        }),
      ),
    ).rejects.toBeDefined();
    await expect(database.allowanceTransaction.count({ where: { accountId } })).resolves.toBe(
      countBefore,
    );

    const orphan = await database.employee.create({
      data: {
        employerId,
        email: `${prefix}-orphan@example.com`,
        normalizedEmail: `${prefix}-orphan@example.com`,
        firstName: 'No',
        lastName: 'Allocation',
      },
    });
    await expect(
      database.allowanceAccount.create({
        data: { employerId, employeeId: orphan.id, currency: 'GBP' },
      }),
    ).rejects.toBeDefined();
    await expect(
      database.allowanceAccount.count({ where: { employeeId: orphan.id } }),
    ).resolves.toBe(0);
  });

  it('rejects a manual adjustment when its audit is missing from the transaction', async () => {
    const account = await database.allowanceAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    const countBefore = await database.allowanceTransaction.count({ where: { accountId } });
    await expect(
      database.$transaction(async (transaction) => {
        await transaction.allowanceTransaction.create({
          data: {
            accountId,
            sequence: account.version + 1,
            type: AllowanceTransactionType.MANUAL_ADJUSTMENT,
            amountDeltaMinor: 100n,
            resultingBalanceMinor: account.currentBalanceMinor + 100n,
            currency: 'GBP',
            referenceType: AllowanceReferenceType.MANUAL_ADJUSTMENT,
            referenceId: randomUUID(),
            actorType: LedgerActorType.USER,
            actorUserId: adminUserId,
            correlationId: 'p6-missing-audit',
          },
        });
        await transaction.allowanceAccount.update({
          where: { id: accountId, version: account.version },
          data: {
            currentBalanceMinor: { increment: 100n },
            version: { increment: 1 },
          },
        });
      }),
    ).rejects.toBeDefined();
    await expect(database.allowanceTransaction.count({ where: { accountId } })).resolves.toBe(
      countBefore,
    );
    await expect(
      database.allowanceAccount.findUniqueOrThrow({ where: { id: accountId } }),
    ).resolves.toMatchObject({
      currentBalanceMinor: account.currentBalanceMinor,
      version: account.version,
    });
  });

  it('enforces currency and employer tenant boundaries', async () => {
    await expect(
      allowances.topUp(
        principal,
        employerId,
        employeeId,
        { amountMinor: '100', currency: 'EGP', referenceId: randomUUID() },
        'p6-wrong-currency',
      ),
    ).rejects.toMatchObject({ response: { code: 'ALLOWANCE_CURRENCY_MISMATCH' } });
    await expect(
      allowanceQueries.getEmployerAccount(
        { userId: otherAdminUserId, sessionId: randomUUID(), platformRole: null },
        employerId,
        employeeId,
      ),
    ).rejects.toMatchObject({ response: { code: 'AUTHORIZATION_DENIED' } });
  });
});
