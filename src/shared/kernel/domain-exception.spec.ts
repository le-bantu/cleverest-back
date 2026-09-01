import {
  DomainException,
  ValidationException,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  ConflictException,
} from './domain-exception';

describe('DomainException', () => {
  it('maps kind to HTTP status', () => {
    expect(new ValidationException('X', 'x').httpStatus).toBe(422);
    expect(new NotFoundException('X', 'x').httpStatus).toBe(404);
    expect(new ForbiddenException('X', 'x').httpStatus).toBe(403);
    expect(new UnauthorizedException('X', 'x').httpStatus).toBe(401);
    expect(new ConflictException('X', 'x').httpStatus).toBe(409);
  });

  it('defaults to 422 UNPROCESSABLE', () => {
    expect(new DomainException('X', 'x').httpStatus).toBe(422);
  });

  it('keeps code, message and details', () => {
    const ex = new ConflictException('DUP', 'duplicate', { field: 'email' });
    expect(ex.code).toBe('DUP');
    expect(ex.message).toBe('duplicate');
    expect(ex.details).toEqual({ field: 'email' });
    expect(ex.name).toBe('DUP');
  });

  it('is an instanceof Error and DomainException', () => {
    const ex = new NotFoundException('NF', 'not found');
    expect(ex).toBeInstanceOf(Error);
    expect(ex).toBeInstanceOf(DomainException);
    expect(ex).toBeInstanceOf(NotFoundException);
  });
});
