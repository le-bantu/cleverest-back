export const CONSULTANT_WORKLOAD = Symbol('CONSULTANT_WORKLOAD');

/**
 * PORT: current workload per consultant (open quotes today; missions join in
 * Lot 3). Consultants without any load may be absent from the returned map.
 */
export abstract class ConsultantWorkloadPort {
  abstract currentLoad(consultantIds: readonly string[]): Promise<Map<string, number>>;
}
