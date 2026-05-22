import { Type, Static } from '@sinclair/typebox';

export const TokenRequestSchema = Type.Object(
  {
    userId: Type.String({ minLength: 1 }),
    role: Type.Union([Type.Literal('admin'), Type.Literal('viewer')]),
  },
  { additionalProperties: false }
);
export type TokenRequest = Static<typeof TokenRequestSchema>;

export const TokenResponseSchema = Type.Object({
  token: Type.String(),
});
export type TokenResponse = Static<typeof TokenResponseSchema>;
