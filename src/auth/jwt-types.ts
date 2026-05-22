import '@fastify/jwt';

export interface JwtPayload {
  sub: string;
  role: 'admin' | 'viewer';
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}
