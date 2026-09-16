import { ProjectMembersService } from '../project-members/project-members.service';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type FilterQuery, Model, Types } from 'mongoose';
import type { Paginated, TaskDetail, TaskSummary } from '@projectflow/shared';
import { toUserSummary } from '../common/utils/serialize';
import { Comment, type CommentDocument } from '../comments/schemas/comment.schema';
import { canManage, ProjectAccessService } from '../projects/project-access.service';
import { Project, type ProjectDocument } from '../projects/schemas/project.schema';
import { UsersService } from '../users/users.service';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { ListTasksQueryDto } from './dto/list-tasks.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';
import type { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { Task, type TaskDocument } from './schemas/task.schema';
import { AssignTaskDto } from './dto/assign-task.dto';
import { TaskActivity, TaskActivityDocument } from './schemas/task-activity.schema';
import{ TaskActivityType} from '@projectflow/shared'
import type { TaskActivityEntry } from '@projectflow/shared';
import type { PaginationQueryDto } from '../common/dto/pagination.dto';@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    @InjectModel(Project.name) private readonly projectModel: Model<ProjectDocument>,
    @InjectModel(Comment.name) private readonly commentModel: Model<CommentDocument>,
    @InjectModel(TaskActivity.name) private readonly taskActivityModel: Model<TaskActivityDocument>,
    private readonly projectMembersService: ProjectMembersService,
    private readonly projectAccessService: ProjectAccessService,
    private readonly usersService: UsersService,
  ) {}

  async findByProject(
    projectId: Types.ObjectId,
    userId: Types.ObjectId,
    query: ListTasksQueryDto,
  ): Promise<Paginated<TaskSummary>> {
    await this.projectAccessService.assertCanView(projectId, userId);

    const filter: FilterQuery<TaskDocument> = { projectId };
    if (query.status) {
      filter.status = query.status;
    }
    if (query.priority) {
      filter.priority = query.priority;
    }

    const [tasks, total] = await Promise.all([
      this.taskModel.find(filter).sort({ number: 1 }).skip(query.skip).limit(query.pageSize).exec(),
      this.taskModel.countDocuments(filter),
    ]);

    return {
      items: await this.toSummaries(tasks),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async create(
    projectId: Types.ObjectId,
    userId: Types.ObjectId,
    dto: CreateTaskDto,
  ): Promise<TaskDetail> {
    const { project } = await this.projectAccessService.assertCanView(projectId, userId);

    const updatedProject = await this.projectModel
    .findByIdAndUpdate(projectId, { $inc: { taskCounter: 1 } }, { new: true })
    .exec();
    if(!updatedProject){
      throw new NotFoundException(`This project doesn't exist`);

    }
    const number = updatedProject.taskCounter;

    

    const task = await this.taskModel.create({
      projectId,
      number,
      key: `${project.key}-${number}`,
      title: dto.title,
      description: dto.description ?? null,
      status: dto.status,
      priority: dto.priority,
      createdBy: userId,
    });

    return this.toDetail(task, project);
  }

  async findOne(taskId: Types.ObjectId, userId: Types.ObjectId): Promise<TaskDetail> {
    const task = await this.findTaskOrFail(taskId);
    const { project } = await this.projectAccessService.assertCanView(task.projectId, userId);

    return this.toDetail(task, project);
  }

  async update(
    taskId: Types.ObjectId,
    userId: Types.ObjectId,
    dto: UpdateTaskDto,
  ): Promise<TaskDetail> {
    const task = await this.findTaskOrFail(taskId);
    const access = await this.projectAccessService.assertCanView(task.projectId, userId);

    const isCreator = task.createdBy.equals(userId);
    if (!canManage(access) && !isCreator) {
      throw new ForbiddenException('You do not have permission to edit this task');
    }

    if (dto.title !== undefined) {
      task.title = dto.title;
    }
    if (dto.description !== undefined) {
      task.description = dto.description;
    }
    if (dto.status !== undefined) {
      task.status = dto.status;
    }
    if (dto.priority !== undefined) {
      task.priority = dto.priority;
    }

    await task.save();

    return this.toDetail(task, access.project);
  }

  async updateStatus(taskId: Types.ObjectId, userId: Types.ObjectId, dto: UpdateTaskStatusDto): Promise<TaskDetail> {
    const task = await this.findTaskOrFail(taskId);
    const access = await this.projectAccessService.assertCanView(task.projectId, userId);

    task.status = dto.status;
    await task.save();

    return this.toDetail(task, access.project);
  }

  async assign(
      taskId: Types.ObjectId, 
      userId: Types.ObjectId, 
      dto:  AssignTaskDto,
  ):Promise<TaskDetail>{
     const task = await this.findTaskOrFail(taskId);
     const access = await this.projectAccessService.assertCanView(task.projectId, userId);
     const newAssigneeId = dto.assigneeId? new  Types.ObjectId(dto.assigneeId): null;
    
     if (newAssigneeId){
      const role = await this.projectMembersService.findRole(task.projectId,newAssigneeId);
      if(!role){
        throw new BadRequestException('Assignee must be a member of this project');
      }
     }

     const previousAssigneeId = task.assigneeId;
     // A regular member may always target themselves: assign the task to
     // themselves, or remove their own existing assignment. Any other
     // change (assigning/unassigning someone else) requires canManage.
     const isSelfTarget = newAssigneeId
       ? newAssigneeId.equals(userId)
       : Boolean(previousAssigneeId?.equals(userId));
     const canAssign = canManage(access) || isSelfTarget;
    if (!canAssign){
      throw new ForbiddenException('You do not have permission to assign this task');
    }
    const changed =
    (previousAssigneeId === null) !== (newAssigneeId === null) ||
    (previousAssigneeId !== null && newAssigneeId !== null && !previousAssigneeId.equals(newAssigneeId));

    task.assigneeId = newAssigneeId;
    await task.save();

    if (changed) {
      await this.taskActivityModel.create({
        taskId: task._id,
        actorId: userId,
        type: TaskActivityType.TASK_ASSIGNEE_CHANGED,
        metadata: { from: previousAssigneeId, to: newAssigneeId },
      });
}

return this.toDetail(task, access.project);
    }

    async getActivity(
  taskId: Types.ObjectId,
  userId: Types.ObjectId,
  query: PaginationQueryDto,
): Promise<Paginated<TaskActivityEntry>> {
  const task = await this.findTaskOrFail(taskId);
  await this.projectAccessService.assertCanView(task.projectId, userId);

  const [rows, total] = await Promise.all([
    this.taskActivityModel
      .find({ taskId })
      .sort({ createdAt: -1 })
      .skip(query.skip)
      .limit(query.pageSize)
      .exec(),
    this.taskActivityModel.countDocuments({ taskId }),
  ]);

  const userIds = new Set<string>();
  for (const row of rows) {
    userIds.add(row.actorId.toString());
    if (row.metadata.from) userIds.add(row.metadata.from.toString());
    if (row.metadata.to) userIds.add(row.metadata.to.toString());
  }
  const users = await this.usersService.findManyByIds(
    Array.from(userIds, (id) => new Types.ObjectId(id)),
  );
  const usersById = new Map(users.map((user) => [user._id.toString(), toUserSummary(user)]));
  const resolve = (id: Types.ObjectId | null) =>
    id ? usersById.get(id.toString()) ?? DELETED_USER : null;

  return {
    items: rows.map((row) => ({
      id: row._id.toString(),
      taskId: row.taskId.toString(),
      type: row.type,
      actor: resolve(row.actorId) ?? DELETED_USER,
      metadata: { from: resolve(row.metadata.from), to: resolve(row.metadata.to) },
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

  async remove(taskId: Types.ObjectId, userId: Types.ObjectId): Promise<void> {
    const task = await this.findTaskOrFail(taskId);
    await this.projectAccessService.assertCanManage(task.projectId, userId);

    await Promise.all([this.commentModel.deleteMany({ taskId: task._id }), task.deleteOne()]);
  }

  async findTaskOrFail(taskId: Types.ObjectId): Promise<TaskDocument> {
    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  private async toSummaries(tasks: TaskDocument[]): Promise<TaskSummary[]> {
    if (tasks.length === 0) {
      return [];
    }
     const assigneeIds = tasks
    .map((task) => task.assigneeId)
    .filter((id): id is Types.ObjectId => id !== null);
    const [creators, commentRows] = await Promise.all([
      this.usersService.findManyByIds([...tasks.map((task) => task.createdBy), ...assigneeIds]),
      this.commentModel
        .aggregate<{
          _id: Types.ObjectId;
          count: number;
        }>([
          { $match: { taskId: { $in: tasks.map((task) => task._id) } } },
          { $group: { _id: '$taskId', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);

    const creatorsById = new Map(creators.map((user) => [user._id.toString(), user]));
    const commentCounts = new Map(commentRows.map((row) => [row._id.toString(), row.count]));

    return tasks.map((task) => ({
      id: task._id.toString(),
      projectId: task.projectId.toString(),
      number: task.number,
      key: task.key,
      title: task.title,
      status: task.status,
      priority: task.priority,
      commentCount: commentCounts.get(task._id.toString()) ?? 0,
      createdBy: toCreatorSummary(creatorsById.get(task.createdBy.toString())),
      assignee: task.assigneeId? toUserSummary(creatorsById.get(task.assigneeId.toString())!) : null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    }));
  }

  private async toDetail(task: TaskDocument, project?: ProjectDocument): Promise<TaskDetail> {
    const [summary] = await this.toSummaries([task]);
    const resolvedProject = project ?? (await this.projectModel.findById(task.projectId).exec());

    if (!resolvedProject) {
      throw new NotFoundException('Project not found');
    }

    return {
      ...summary!,
      description: task.description ?? null,
      project: {
        id: resolvedProject._id.toString(),
        name: resolvedProject.name,
        key: resolvedProject.key,
      },
    };
  }
}

const DELETED_USER = {
  id: '',
  name: 'Unknown user',
  email: '',
  avatarUrl: null,
};

function toCreatorSummary(user: Parameters<typeof toUserSummary>[0] | undefined) {
  return user ? toUserSummary(user) : DELETED_USER;
}
