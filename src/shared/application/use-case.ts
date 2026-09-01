/**
 * A use case is a single application operation. Input/Output are plain DTOs.
 * Use cases receive ports (interfaces) by constructor — never a concrete
 * infrastructure service.
 */
export interface UseCase<Input, Output> {
  execute(input: Input): Promise<Output>;
}

/** Identity of the authenticated actor, as resolved by the interface layer. */
export interface ActorContext {
  userId: string;
  roles: string[];
  permissions: string[];
}
