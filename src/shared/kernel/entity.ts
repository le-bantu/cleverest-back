/**
 * Base class for entities: identity-based equality.
 */
export abstract class AbstractEntity<Id> {
  protected readonly _id: Id;

  protected constructor(id: Id) {
    this._id = id;
  }

  get id(): Id {
    return this._id;
  }

  equals(other?: AbstractEntity<Id>): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    if (this === other) {
      return true;
    }
    if (!(other instanceof AbstractEntity)) {
      return false;
    }
    return JSON.stringify(this._id) === JSON.stringify(other._id);
  }
}
