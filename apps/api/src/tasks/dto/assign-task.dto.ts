import{IsMongoId, ValidateIf} from 'class-validator';

export class AssignTaskDto{
    @ValidateIf ((dto:AssignTaskDto) => dto.assigneeId !== null)
    @IsMongoId()
    assigneeId?: string | null;
}