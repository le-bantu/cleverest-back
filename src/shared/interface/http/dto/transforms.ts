type TransformArgs = { value: unknown; obj?: Record<string, unknown>; key?: string };

/** Raw input value (implicit conversion would already have turned "false" into true). */
const raw = ({ value, obj, key }: TransformArgs): unknown =>
  obj && key && key in obj ? obj[key] : value;

/** Query-string booleans: "true"/"1" → true, "false"/"0" → false. */
export const toBool = (args: TransformArgs): unknown => {
  const value = raw(args);
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (['true', '1'].includes(String(value).toLowerCase())) return true;
  if (['false', '0'].includes(String(value).toLowerCase())) return false;
  return value;
};

/** Multipart arrays: repeated field, JSON array or comma-separated list. */
export const toArray = (args: TransformArgs): unknown => {
  const value = raw(args);
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  const text = String(value).trim();
  if (text.startsWith('[')) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return value;
    }
  }
  return text
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
};
