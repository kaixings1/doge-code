import { z } from 'zod/v4'

/**
 * Boolean that also accepts the string literals "true"/"false".
 *
 * Tool inputs arrive as model-generated JSON. The model occasionally quotes
 * booleans â€?`"replace_all":"false"` instead of `"replace_all":false` â€?and
 * z.boolean() rejects that with a type error. z.coerce.boolean() is the wrong
 * fix: it uses JS truthiness, so "false" â†?true.
 *
 * z.preprocess emits {"type":"boolean"} to the API schema, so the model is
 * still told this is a boolean â€?the string tolerance is invisible client-side
 * coercion, not an advertised input shape.
 *
 * .optional()/.default() go INSIDE (on the inner schema), not chained after:
 * chaining them onto ZodPipe widens z.output<> to unknown in Zod v4.
 *
 *   semanticBoolean()                              â†?boolean
 *   semanticBoolean(z.boolean().optional())        â†?boolean | undefined
 *   semanticBoolean(z.boolean().default(false))    â†?boolean
 */
export function semanticBoolean<T extends z.ZodType>(
  inner: T = z.boolean() as unknown as T,
) {
  return z.preprocess(
    (v: unknown) => (v === 'true' ? true : v === 'false' ? false : v),
    inner,
  )
}
