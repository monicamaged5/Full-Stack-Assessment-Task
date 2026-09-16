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

describe('Task assignment', () => {
  let app: INestApplication;
  let connection: Connection;

  let owner: TestUser;
  let manager: TestUser;
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
    manager = await registerUser(app, 'Ahmed Hassan', 'ahmed@example.com');
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
    await addOrganizationMember(connection, organizationId, manager.id, OrganizationRole.MEMBER);
    await addOrganizationMember(connection, organizationId, memberA.id, OrganizationRole.MEMBER);
    await addOrganizationMember(connection, organizationId, memberB.id, OrganizationRole.MEMBER);

    projectId = await createProject(
      connection,
      organizationId,
      'Internal Platform',
      'ENG',
      owner.id,
    );
    await addProjectMember(connection, projectId, manager.id, ProjectRole.PROJECT_MANAGER);
    await addProjectMember(connection, projectId, memberA.id, ProjectRole.MEMBER);
    await addProjectMember(connection, projectId, memberB.id, ProjectRole.MEMBER);

    const taskResponse = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(owner))
      .send({ title: 'Wire up the assignee selector' })
      .expect(201);
    taskId = taskResponse.body.id;
  });

  it('lets a project member assign a task to themselves', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(memberA))
      .send({ assigneeId: memberA.id })
      .expect(200);

    expect(response.body.assignee).toMatchObject({ id: memberA.id });
  });

  it('lets the organization owner assign a task to another member', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(owner))
      .send({ assigneeId: memberB.id })
      .expect(200);

    expect(response.body.assignee).toMatchObject({ id: memberB.id });
  });

  it('lets the project manager assign a task to another member', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(manager))
      .send({ assigneeId: memberA.id })
      .expect(200);

    expect(response.body.assignee).toMatchObject({ id: memberA.id });
  });

  it('refuses a regular member assigning the task to someone else', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(memberA))
      .send({ assigneeId: memberB.id })
      .expect(403);

    expect(response.body.message).toMatch(/assign/i);
  });

  it('refuses assigning a task to a user outside the project', async () => {
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(manager))
      .send({ assigneeId: outsider.id })
      .expect(400);
  });

  it('refuses an outsider assigning the task at all', async () => {
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(outsider))
      .send({ assigneeId: outsider.id })
      .expect(403);
  });

  it('lets an authorized user remove the current assignee', async () => {
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(manager))
      .send({ assigneeId: memberA.id })
      .expect(200);

    const response = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(manager))
      .send({ assigneeId: null })
      .expect(200);

    expect(response.body.assignee).toBeNull();
  });

  it('lets a member remove their own assignment', async () => {
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(memberA))
      .send({ assigneeId: memberA.id })
      .expect(200);

    const response = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(memberA))
      .send({ assigneeId: null })
      .expect(200);

    expect(response.body.assignee).toBeNull();
  });

  it("refuses a regular member removing someone else's assignment", async () => {
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(memberA))
      .send({ assigneeId: memberA.id })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(memberB))
      .send({ assigneeId: null })
      .expect(403);
  });

  it('does not record activity when the assignee is unchanged', async () => {
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(memberA))
      .send({ assigneeId: memberA.id })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(memberA))
      .send({ assigneeId: memberA.id })
      .expect(200);

    const activity = await request(app.getHttpServer())
      .get(`/tasks/${taskId}/activity`)
      .set('Authorization', authHeader(memberA))
      .expect(200);

    expect(activity.body.total).toBe(1);
  });
});
