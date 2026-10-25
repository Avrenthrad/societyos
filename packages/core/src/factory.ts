import type { BaseEntity, EntityOf, EntityType, ID } from "./entities.js";

export function newId(): ID {
  return globalThis.crypto.randomUUID();
}

type NewFields<T extends EntityType> = Omit<
  EntityOf<T>,
  keyof BaseEntity
> & { ownerId: ID; sourceApp: string };

/** Build a new entity with id and timestamps filled in. */
export function createEntity<T extends EntityType>(
  type: T,
  fields: NewFields<T>,
  now: Date = new Date(),
): EntityOf<T> {
  const ts = now.toISOString();
  return {
    ...fields,
    id: newId(),
    type,
    createdAt: ts,
    updatedAt: ts,
  } as unknown as EntityOf<T>;
}
