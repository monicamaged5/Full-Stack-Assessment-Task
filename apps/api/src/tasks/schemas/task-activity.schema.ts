import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';
import { TASK_ACTIVITY_TYPES, TaskActivityType } from '@projectflow/shared';

@Schema({ _id: false })
class TaskActivityMetadata {
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  from: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  to: Types.ObjectId | null;
}
const TaskActivityMetadataSchema = SchemaFactory.createForClass(TaskActivityMetadata);

export type TaskActivityDocument = HydratedDocument<TaskActivity>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'task_activities' })
export class TaskActivity {
  @Prop({ type: Types.ObjectId, ref: 'Task', required: true })
  taskId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  actorId: Types.ObjectId;

  @Prop({ type: String, enum: TASK_ACTIVITY_TYPES, required: true })
  type: TaskActivityType;

  @Prop({ type: TaskActivityMetadataSchema, required: true })
  metadata: TaskActivityMetadata;

  createdAt: Date;
}

export const TaskActivitySchema = SchemaFactory.createForClass(TaskActivity);
TaskActivitySchema.index({ taskId: 1, createdAt: -1 });