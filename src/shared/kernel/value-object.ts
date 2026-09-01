/**
 * Base class for value objects: immutable, compared by structural equality.
 */
export abstract class AbstractValueObject<Props extends object> {
  protected readonly props: Readonly<Props>;

  protected constructor(props: Props) {
    this.props = Object.freeze({ ...props });
  }

  equals(other?: AbstractValueObject<Props>): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    if (!(other instanceof AbstractValueObject)) {
      return false;
    }
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}
