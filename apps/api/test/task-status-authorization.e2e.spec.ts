import type { INestApplication } from '@nestjs/common';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { OrganizationRole, TaskStatus } from '@projectflow/shared';
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
 * Regression coverage for BUG_REPORT.md: `PATCH /tasks/:taskId/status`
 * performed no project-access check at all, so any authenticated user could
 * change the status of any task, including tasks in projects they have no
 * membership in and no elevated organization role for.
 */
describe('Task status update authorization (bug regression)', () => {
  let app: INestApplication;
  let connection: Connection;

  let owner: TestUser;
  let outsider: TestUser;
  let projectId: string;
  let taskId: string;

  beforeAll(async () => {
    ({ app, connection } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(connection);

    owner = await registerUser(app, 'Ammar Yaser', 'ammar@example.com');
    outsider = await registerUser(app, 'Outside User', 'outside@example.com');

    const organizationId = await createOrganization(
      connection,
      'Acme Software',
      'acme-software',
      owner.id,
    );
    await addOrganizationMember(connection, organizationId, owner.id, OrganizationRole.OWNER);
    // `outsider` deliberately has no organization membership and no project
    // membership -- this is the exact scenario support reported.

    projectId = await createProject(
      connection,
      organizationId,
      'Internal Platform',
      'ENG',
      owner.id,
    );

    const taskResponse = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(owner))
      .send({ title: 'Confidential rollout plan' })
      .expect(201);
    taskId = taskResponse.body.id;
  });

  it('refuses a status change from a user with no access to the project', async () => {
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/status`)
      .set('Authorization', authHeader(outsider))
      .send({ status: TaskStatus.DONE })
      .expect(403);

    const task = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set('Authorization', authHeader(owner))
      .expect(200);

    expect(task.body.status).toBe(TaskStatus.TODO);
  });

  it('refuses a status change from an unauthenticated request', async () => {
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/status`)
      .send({ status: TaskStatus.DONE })
      .expect(401);
  });

  it('still lets a user with project access change the status', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/status`)
      .set('Authorization', authHeader(owner))
      .send({ status: TaskStatus.IN_PROGRESS })
      .expect(200);

    expect(response.body.status).toBe(TaskStatus.IN_PROGRESS);
  });
});
