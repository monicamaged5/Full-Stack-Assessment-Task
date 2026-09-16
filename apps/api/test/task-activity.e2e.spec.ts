import type { INestApplication } from '@nestjs/common';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { OrganizationRole, ProjectRole } from '@projectflow/shared';
import { createTestApp, resetDatabase } from './utils/test-app';
import {
  addOrganizationMember,
  addProjectMember,
  authHeader,
  createOrganization,
  createProject,
  registerUser,
  type TestUser,
} from './utils/fixtures';

describe('Task activity', () => {
  let app: INestApplication;
  let connection: Connection;

  let owner: TestUser;
  let memberA: TestUser;
  let memberB: TestUser;
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
    memberA = await registerUser(app, 'Magd Ali', 'magd@example.com');
    memberB = await registerUser(app, 'Sarah Ahmed', 'sarah@example.com');
    outsider = await registerUser(app, 'Outside User', 'outside@example.com');

    const organizationId = await createOrganization(
      connection,
      'Acme Software',
      'acme-software',
      owner.id,
    );
    await addOrganizationMember(connection, organizationId, owner.id, OrganizationRole.OWNER);
    await addOrganizationMember(connection, organizationId, memberA.id, OrganizationRole.MEMBER);
    await addOrganizationMember(connection, organizationId, memberB.id, OrganizationRole.MEMBER);

    projectId = await createProject(
      connection,
      organizationId,
      'Internal Platform',
      'ENG',
      owner.id,
    );
    await addProjectMember(connection, projectId, memberA.id, ProjectRole.MEMBER);
    await addProjectMember(connection, projectId, memberB.id, ProjectRole.MEMBER);

    const taskResponse = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(owner))
      .send({ title: 'Ship the activity timeline' })
      .expect(201);
    taskId = taskResponse.body.id;
  });

  it('records an activity entry when a task moves from unassigned to assigned', async () => {
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(owner))
      .send({ assigneeId: memberA.id })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/tasks/${taskId}/activity`)
      .set('Authorization', authHeader(owner))
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items[0]).toMatchObject({
      type: 'TASK_ASSIGNEE_CHANGED',
      actor: { id: owner.id },
      metadata: { to: { id: memberA.id } },
    });
    expect(response.body.items[0].metadata.from).toBeNull();
  });

  it('records the previous and new assignee when reassigning to a different user', async () => {
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(owner))
      .send({ assigneeId: memberA.id })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(owner))
      .send({ assigneeId: memberB.id })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/tasks/${taskId}/activity`)
      .set('Authorization', authHeader(owner))
      .expect(200);

    expect(response.body.total).toBe(2);
    // Newest first.
    expect(response.body.items[0]).toMatchObject({
      metadata: { from: { id: memberA.id }, to: { id: memberB.id } },
    });
    expect(response.body.items[1]).toMatchObject({
      metadata: { from: null, to: { id: memberA.id } },
    });
  });

  it('records an activity entry when a task is unassigned', async () => {
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(owner))
      .send({ assigneeId: memberA.id })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(owner))
      .send({ assigneeId: null })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/tasks/${taskId}/activity`)
      .set('Authorization', authHeader(owner))
      .expect(200);

    expect(response.body.items[0]).toMatchObject({
      metadata: { from: { id: memberA.id }, to: null },
    });
  });

  it('paginates activity, newest first', async () => {
    for (const target of [memberA, memberB, memberA, memberB]) {
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assignee`)
        .set('Authorization', authHeader(owner))
        .send({ assigneeId: target.id })
        .expect(200);
    }

    const firstPage = await request(app.getHttpServer())
      .get(`/tasks/${taskId}/activity`)
      .query({ page: 1, pageSize: 2 })
      .set('Authorization', authHeader(owner))
      .expect(200);

    expect(firstPage.body.total).toBe(4);
    expect(firstPage.body.items).toHaveLength(2);
    // Most recent reassignment landed the assignee on memberB.
    expect(firstPage.body.items[0].metadata.to).toMatchObject({ id: memberB.id });
  });

  it('refuses activity access to users outside the project', async () => {
    await request(app.getHttpServer())
      .get(`/tasks/${taskId}/activity`)
      .set('Authorization', authHeader(outsider))
      .expect(403);
  });
});
