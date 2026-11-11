import { ValidationException } from '@shared/kernel';

/** DB values keep the legacy accents (CDC §7.5). */
export enum MissionStatus {
  EN_ATTENTE = 'EN_ATTENTE',
  EN_COURS = 'EN_COURS',
  EN_VALIDATION = 'EN_VALIDATION',
  TERMINEE = 'TERMINÉE',
  REJETEE = 'REJETÉE',
}

export const ALL_MISSION_STATUSES = Object.values(MissionStatus);

/**
 * Lifecycle:
 * - EN_ATTENTE → EN_COURS | REJETÉE   (lead consultant accepts / refuses)
 * - EN_COURS ↔ EN_VALIDATION, both → TERMINÉE   (assigned consultant)
 * - REJETÉE → EN_ATTENTE   (an admin re-assigns a team)
 * - TERMINÉE is terminal.
 */
export const MISSION_TRANSITIONS: Readonly<Record<MissionStatus, readonly MissionStatus[]>> = {
  [MissionStatus.EN_ATTENTE]: [MissionStatus.EN_COURS, MissionStatus.REJETEE],
  [MissionStatus.EN_COURS]: [MissionStatus.EN_VALIDATION, MissionStatus.TERMINEE],
  [MissionStatus.EN_VALIDATION]: [MissionStatus.EN_COURS, MissionStatus.TERMINEE],
  [MissionStatus.REJETEE]: [MissionStatus.EN_ATTENTE],
  [MissionStatus.TERMINEE]: [],
};

/** Statuses a consultant may set through the progress endpoint. */
export const CONSULTANT_PROGRESS_STATUSES = [
  MissionStatus.EN_COURS,
  MissionStatus.EN_VALIDATION,
  MissionStatus.TERMINEE,
] as const;

/** The mission is being worked on (deliverables may be uploaded). */
export const ACTIVE_MISSION_STATUSES: readonly MissionStatus[] = [
  MissionStatus.EN_COURS,
  MissionStatus.EN_VALIDATION,
];

export const parseMissionStatus = (value: string): MissionStatus => {
  if (!(ALL_MISSION_STATUSES as string[]).includes(value)) {
    throw new ValidationException('INVALID_MISSION_STATUS', `Unknown mission status "${value}"`);
  }
  return value as MissionStatus;
};

export enum MissionTaskStatus {
  A_FAIRE = 'A_FAIRE',
  EN_COURS = 'EN_COURS',
  FAITE = 'FAITE',
}

export const ALL_TASK_STATUSES = Object.values(MissionTaskStatus);

export const parseTaskStatus = (value: string): MissionTaskStatus => {
  if (!(ALL_TASK_STATUSES as string[]).includes(value)) {
    throw new ValidationException('INVALID_TASK_STATUS', `Unknown task status "${value}"`);
  }
  return value as MissionTaskStatus;
};
