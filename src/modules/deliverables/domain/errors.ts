import { ConflictException, ForbiddenException, NotFoundException } from '@shared/kernel';

export const deliverableNotFound = (id: string): NotFoundException =>
  new NotFoundException('DELIVERABLE_NOT_FOUND', 'Deliverable not found', { id });

export const notAssignedToMission = (): ForbiddenException =>
  new ForbiddenException('MISSION_NOT_ASSIGNED', 'You are not assigned to this mission');

export const missionNotActive = (missionId: string, status: string): ConflictException =>
  new ConflictException(
    'MISSION_NOT_ACTIVE',
    'Deliverables are uploaded while the mission is in progress',
    { missionId, status },
  );
