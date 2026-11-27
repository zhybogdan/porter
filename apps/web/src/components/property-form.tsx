'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, type UseFormSetError } from 'react-hook-form';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ApiProblem } from '@/lib/problem';
import {
  PROPERTY_FIELDS,
  propertyFormSchema,
  type PropertyFormFields,
  type PropertyFormInput,
  type PropertyFormValues,
} from '@/lib/properties';
import { useTimeZones } from '@/lib/time-zones';

interface PropertyFormProps {
  /** The values the form starts from; empty strings for a new building. */
  initial: PropertyFormValues;
  submitLabel: string;
  /**
   * Saves the values. `changed` names the fields the user touched, so an edit
   * sends only those: a PATCH that repeats every field would quietly put back
   * a field somebody else changed in the meantime, if the version check
   * were ever loosened.
   */
  onSubmit: (values: PropertyFormValues, changed: Partial<PropertyFormValues>) => Promise<void>;
  /** Shown above the buttons when the save was refused for a reason no field explains. */
  renderProblem?: (problem: ApiProblem) => ReactNode;
  /** Whether a form with no changes may be sent. A new building may; an edit may not. */
  allowUnchanged?: boolean;
  cancel: ReactNode;
}

function isField(name: string): name is PropertyFormFields {
  return (PROPERTY_FIELDS as readonly string[]).includes(name);
}

/**
 * Puts the API's 422 next to the fields it names. The form checks the same
 * rules before sending, so this shows only when the two copies of the rules
 * disagree -- and then the user still reads which field and why, instead of
 * a generic failure.
 */
function showFieldErrors(problem: ApiProblem, setError: UseFormSetError<PropertyFormValues>): boolean {
  let shown = false;
  for (const error of problem.fieldErrors) {
    if (!isField(error.field)) continue;
    // Shows on the first field that failed; the API's messages read as
    // "must be …", so the field's name is put in front.
    setError(error.field, { type: 'server', message: `This ${error.field} ${error.message}.` }, {
      shouldFocus: !shown,
    });
    shown = true;
  }
  return shown;
}

export function PropertyForm({
  initial,
  submitLabel,
  onSubmit,
  renderProblem,
  allowUnchanged = false,
  cancel,
}: PropertyFormProps) {
  const timeZones = useTimeZones();
  const form = useForm<PropertyFormInput, unknown, PropertyFormValues>({
    resolver: zodResolver(propertyFormSchema),
    defaultValues: initial,
    // Checked on leaving a field, then on every keystroke once it has failed:
    // the user is not told the name is empty before they have typed it.
    mode: 'onTouched',
  });

  // A refusal no single field explains (a conflict, a lost connection).
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const { isSubmitting, dirtyFields } = form.formState;
  const hasChanges = Object.keys(dirtyFields).length > 0;

  async function submit(values: PropertyFormValues): Promise<void> {
    const changed: Partial<PropertyFormValues> = {};
    for (const name of PROPERTY_FIELDS) {
      if (dirtyFields[name]) changed[name] = values[name];
    }
    setProblem(null);
    try {
      await onSubmit(values, changed);
    } catch (error) {
      if (!(error instanceof ApiProblem)) throw error;
      if (error.status === 422 && showFieldErrors(error, form.setError)) return;
      setProblem(error);
    }
  }

  // The zone a building was saved with may be missing from an older browser's
  // list; it stays selectable rather than silently turning into another.
  const zoneOptions =
    timeZones && !timeZones.zones.includes(initial.timezone) && initial.timezone
      ? [initial.timezone, ...timeZones.zones]
      : (timeZones?.zones ?? []);

  return (
    <form noValidate onSubmit={(event) => void form.handleSubmit(submit)(event)} className="grid gap-6">
      <FieldGroup>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="property-name">Name</FieldLabel>
              <Input
                {...field}
                id="property-name"
                autoComplete="off"
                aria-invalid={fieldState.invalid}
                aria-describedby="property-name-hint"
              />
              <FieldDescription id="property-name-hint">
                What your team calls it, for example “Riverside 12”.
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="address"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="property-address">Address</FieldLabel>
              <Input
                {...field}
                id="property-address"
                autoComplete="street-address"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="timezone"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="property-timezone">Time zone</FieldLabel>
              {timeZones ? (
                <NativeSelect
                  {...field}
                  id="property-timezone"
                  className="w-full sm:w-80"
                  aria-invalid={fieldState.invalid}
                  aria-describedby="property-timezone-hint"
                >
                  <NativeSelectOption value="" disabled>
                    Choose a time zone
                  </NativeSelectOption>
                  {zoneOptions.map((zone) => (
                    <NativeSelectOption key={zone} value={zone}>
                      {zone.replaceAll('_', ' ')}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              ) : (
                <p className="text-sm text-muted-foreground">Loading time zones…</p>
              )}
              <FieldDescription id="property-timezone-hint">
                Where the building is. Due dates and bookings are shown in this zone.
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>

      {problem && (
        <div role="alert" className="rounded-md border border-destructive/50 p-4 text-sm text-destructive">
          {renderProblem?.(problem) ?? problem.message}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={isSubmitting || (!allowUnchanged && !hasChanges)}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
        {cancel}
      </div>
    </form>
  );
}
