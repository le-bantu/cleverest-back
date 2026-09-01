import { ArgumentsHost, HttpException, NotFoundException as NestNotFound } from '@nestjs/common';
import { ConflictException, NotFoundException } from '@shared/kernel';
import { AllExceptionsFilter } from './all-exceptions.filter';

const hostFor = () => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: '/api/x', method: 'POST' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
};

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('maps a DomainException to its httpStatus + code envelope', () => {
    const { host, status, json } = hostFor();
    filter.catch(new ConflictException('DUP', 'duplicate', { field: 'email' }), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        error: 'DUP',
        message: 'duplicate',
        details: { field: 'email' },
        path: '/api/x',
      }),
    );
  });

  it('maps a domain NotFoundException to 404', () => {
    const { host, status } = hostFor();
    filter.catch(new NotFoundException('NF', 'gone'), host);
    expect(status).toHaveBeenCalledWith(404);
  });

  it('passes a Nest HttpException status through', () => {
    const { host, status } = hostFor();
    filter.catch(new NestNotFound('nope'), host);
    expect(status).toHaveBeenCalledWith(404);
  });

  it('wraps unknown errors as 500', () => {
    const { host, status, json } = hostFor();
    filter.catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, error: 'InternalServerError' }),
    );
  });

  it('keeps HttpException validation message arrays', () => {
    const { host, json } = hostFor();
    filter.catch(new HttpException({ message: ['a', 'b'], error: 'Bad Request' }, 400), host);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'a, b' }),
    );
  });
});
