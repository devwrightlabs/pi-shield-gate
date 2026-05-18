import React, { type InputHTMLAttributes } from 'react';

export interface HoneypotField {
  name: string;
  autoComplete: string;
}

export interface HoneypotSubmissionContext {
  userUid: string;
  formValues: FormData | Record<string, string | undefined>;
}

export interface HoneypotHandlerOptions {
  fields?: readonly HoneypotField[];
  banUid: (uid: string, reason: string) => Promise<void>;
}

const DEFAULT_FIELDS: readonly HoneypotField[] = [
  { name: 'secondary_email', autoComplete: 'email' },
  { name: 'company_website', autoComplete: 'url' }
];

/**
 * Returns hidden input props that can be spread into React forms.
 */
export function buildHoneypotInputProps(field: HoneypotField): InputHTMLAttributes<HTMLInputElement> {
  return {
    name: field.name,
    autoComplete: field.autoComplete,
    tabIndex: -1,
    'aria-hidden': true,
    style: {
      position: 'absolute',
      left: '-10000px',
      width: '1px',
      height: '1px',
      opacity: 0,
      pointerEvents: 'none'
    }
  };
}

/**
 * Renders invisible honeypot inputs for insertion in React form trees.
 */
export function renderHoneypotFields(fields: readonly HoneypotField[] = DEFAULT_FIELDS): React.ReactElement[] {
  return fields.map((field) => React.createElement('input', { key: field.name, ...buildHoneypotInputProps(field) }));
}

function readField(formValues: FormData | Record<string, string | undefined>, fieldName: string): string {
  if (formValues instanceof FormData) {
    const value = formValues.get(fieldName);
    return typeof value === 'string' ? value : '';
  }
  return formValues[fieldName] ?? '';
}

/**
 * Detects if automated actors filled hidden form fields.
 */
export function isHoneypotTriggered(
  formValues: FormData | Record<string, string | undefined>,
  fields: readonly HoneypotField[] = DEFAULT_FIELDS
): boolean {
  return fields.some((field) => readField(formValues, field.name).trim().length > 0);
}

/**
 * Applies firewall ban callback when honeypot activity is detected.
 */
export async function processHoneypotSubmission(
  context: HoneypotSubmissionContext,
  options: HoneypotHandlerOptions
): Promise<boolean> {
  const fields = options.fields ?? DEFAULT_FIELDS;
  const triggered = isHoneypotTriggered(context.formValues, fields);

  if (triggered) {
    await options.banUid(context.userUid, 'Honeypot fields were filled by client automation.');
  }

  return triggered;
}
