import { ActorKind, ActorRef, resolveActor } from '@shared/application/actor';
import { ActorContext } from '@shared/application/use-case';
import { Mission, missionNotFound, MissionRepository } from '../../domain';
import {
  ClientMissionView,
  MissionView,
  toClientMissionView,
  toMissionView,
} from '../mission.views';

export const MISSION_PERMISSIONS = {
  MANAGE: 'manage-quotes',
  ASSIGN: 'assign-consultants',
} as const;

export const canSee = (by: ActorRef, mission: Mission): boolean => {
  switch (by.kind) {
    case 'ADMIN':
      return true;
    case 'CONSULTANT':
      return mission.isAssigned(by.userId);
    default:
      return mission.isOwnedBy(by.userId);
  }
};

/**
 * Loads a mission the actor may see (admin: all, consultant: assigned,
 * client: owner) among the allowed audiences; anyone else gets a 404.
 */
export const loadVisibleMission = async (
  missions: MissionRepository,
  actor: ActorContext,
  missionId: string,
  allowed: readonly ActorKind[] = ['ADMIN', 'CONSULTANT', 'CLIENT'],
): Promise<{ by: ActorRef; mission: Mission }> => {
  const by = resolveActor(actor, allowed);
  const mission = await missions.findById(missionId);
  if (!mission || !canSee(by, mission)) throw missionNotFound(missionId);
  return { by, mission };
};

export const loadMission = async (
  missions: MissionRepository,
  missionId: string,
): Promise<Mission> => {
  const mission = await missions.findById(missionId);
  if (!mission) throw missionNotFound(missionId);
  return mission;
};

/** The projection matching the audience. */
export const viewFor = (by: ActorRef, m: Mission): MissionView | ClientMissionView => {
  if (by.kind === 'CLIENT') return toClientMissionView(m);
  return toMissionView(m, by.kind === 'CONSULTANT' ? by.userId : undefined);
};
