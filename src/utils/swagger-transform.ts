// Recursively converts anyOf[{type,enum:[X]},{type,enum:[Y]},...] → {type,enum:[X,Y,...]}
// so that Schemathesis constrains its generated values to the valid set instead of
// treating the field as an unconstrained string.  Only affects OpenAPI export output;
// AJV still validates against the original TypeBox schemas at runtime.
function flattenSingleValueAnyOf(node: unknown): unknown {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(flattenSingleValueAnyOf);
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj.anyOf)) {
    const branches = obj.anyOf as Record<string, unknown>[];
    const isSingle = (b: Record<string, unknown>) =>
      Array.isArray(b.enum) && (b.enum as unknown[]).length === 1;
    if (branches.length > 0 && branches.every(isSingle)) {
      const firstType = branches[0]!.type;
      const sameType = firstType !== undefined && branches.every(b => b.type === firstType);
      return {
        ...(sameType ? { type: firstType } : {}),
        enum: branches.map(b => (b.enum as unknown[])[0]),
      };
    }
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) result[k] = flattenSingleValueAnyOf(v);
  return result;
}

export function swaggerTransform<T>({ schema, url }: { schema: T; url: string }): { schema: T; url: string } {
  return { schema: flattenSingleValueAnyOf(schema) as T, url };
}
