import { Type, Static } from '@sinclair/typebox';

export const TokenRequestSchema = Type.Object(
  {
    userId: Type.String({ minLength: 1 }),
    password: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false }
);
export type TokenRequest = Static<typeof TokenRequestSchema>;

export const TokenResponseSchema = Type.Object({
  token: Type.String(),
});
export type TokenResponse = Static<typeof TokenResponseSchema>;
