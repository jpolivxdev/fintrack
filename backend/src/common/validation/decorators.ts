import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsISO8601,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Rejects C0 control characters (NUL, BEL, ESC...) and DEL.
 * PostgreSQL refuses NUL in text columns (it used to surface as a 500), and
 * the others have no place in user-facing text. Multiline text keeps
 * tab, LF and CR.
 */
/* oxlint-disable no-control-regex -- matching control characters is the point */
const NO_CONTROL_CHARS_MULTILINE =
  /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/;
const NO_CONTROL_CHARS = /^[^\u0000-\u001F\u007F]*$/;
/* oxlint-enable no-control-regex */

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Free text from the user. Stored verbatim — HTML escaping is the
 * presentation layer's job (React escapes by default); see SECURITY.md.
 */
export function IsSafeText(options: {
  maxLength: number;
  multiline?: boolean;
  optional?: boolean;
}) {
  const decorators = [
    Transform(trim),
    IsString(),
    MaxLength(options.maxLength),
    Matches(options.multiline ? NO_CONTROL_CHARS_MULTILINE : NO_CONTROL_CHARS, {
      message: ({ property }) =>
        `${property} contains invalid control characters`,
    }),
  ];
  if (!options.optional) decorators.push(IsNotEmpty());
  return applyDecorators(...decorators);
}

/**
 * An instant in ISO 8601 with an explicit offset ("2026-10-02T22:00:00-03:00"
 * or "...Z"). A bare "22:00" is ambiguous across time zones, so it is refused.
 */
export function IsInstant() {
  return applyDecorators(
    IsString(),
    Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/, {
      message: ({ property }) => `${property} must be an ISO 8601 date-time with time zone, e.g. 2026-10-02T22:00:00-03:00`,
    }),
    IsISO8601({ strict: true }),
  );
}

/**
 * A calendar date, exactly "YYYY-MM-DD", between 2000-01-01 and 2100-12-31.
 * Full timestamps are rejected on purpose: "2026-10-01T23:00-03:00" is a
 * different day in UTC, and guessing would silently file it under the wrong one.
 */
export function IsDateOnly() {
  return applyDecorators(
    IsString(),
    Matches(/^(20\d{2}|2100)-\d{2}-\d{2}$/, {
      message: ({ property }) =>
        `${property} must be a date in YYYY-MM-DD format between 2000 and 2100`,
    }),
    // Rejects impossible dates such as 2026-02-30.
    IsDateString({ strict: true }),
  );
}
