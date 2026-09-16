import type { INestApplication } from '@nestjs/common';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { OrganizationRole } from '@projectflow/shared';
import { createTestApp, resetDatabase } from './utils/test-app';
import {
  addOrganizationMember,
  authHeader,
  createOrganization,
  createProject,
  registerUser,
  type TestUser,
} from './utils/fixtures';

/**
 * Regression coverage for the concurrent task-numbering bug described in
 * the brief: `const count = await Task.countDocuments(...); number = count
 * + 1;` reads and writes in two separate steps, so two requests racing for
 * the same project can both read the same count and both compute the same
 * "next" number. TasksService now draws numbers from an atomic per-project
 * counter (see TaskCounter), backed by a unique `{ projectId, number }`
 * index as a hard guarantee.
 */
describe('Concurrent task creation', () => {
  let app: INestApplication;
  let connection: Connection;

  let owner: TestUser;
  let projectId: string;

  beforeAll(async () => {
    ({ app, connection } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(connection);

    owner = await registerUser(app, 'Ammar Yaser', 'ammar@example.com');

    const organizationId = await createOrganization(
      connection,
      'Acme Software',
      'acme-software',
      owner.id,
    );
    await addOrganizationMember(connection, organizationId, owner.id, OrganizationRole.OWNER);

    projectId = await createProject(
      connection,
      organizationId,
      'Internal Platform',
      'ENG',
      owner.id,
    );
  });

  it('never hands out the same task number twice under concurrent creation', async () => {
    const CONCURRENT_REQUESTS = 25;

    const responses = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, (_, index) =>
        request(app.getHttpServer())
          .post(`/projects/${projectId}/tasks`)
          .set('Authorization', authHeader(owner))
          .send({ title: `Concurrent task ${index}` }),
      ),
    );

    for (const response of responses) {
      expect(response.status).toBe(201);
    }

    const numbers = responses.map((response) => response.body.number as number);
    const uniqueNumbers = new Set(numbers);

    expect(uniqueNumbers.size).toBe(CONCURRENT_REQUESTS);
    expect([...uniqueNumbers].sort((a, b) => a - b)).toEqual(
      Array.from({ length: CONCURRENT_REQUESTS }, (_, index) => index + 1),
    );

    const keys = responses.map((response) => response.body.key as string);
    expect(new Set(keys).size).toBe(CONCURRENT_REQUESTS);
  });
});
