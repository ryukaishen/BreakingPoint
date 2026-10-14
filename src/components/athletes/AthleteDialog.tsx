import { useRef, type FormEvent } from 'react';
import { SystemNotification } from '../system/SystemNotification';
import { AthleteNameField, useAthleteName } from './AthleteNameField';

interface Props {
  mode: 'create' | 'rename';
  initialName?: string;
  /** Shown above the field, e.g. why a profile is needed right now. */
  intro?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

/** Add or rename an athlete from anywhere in the app, in Make's notification window. */
export function AthleteDialog({ mode, initialName = '', intro, onSubmit, onCancel }: Props) {
  const state = useAthleteName(initialName);
  const inputRef = useRef<HTMLInputElement>(null);
  const create = mode === 'create';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = state.submit();
    if (name) onSubmit(name);
    else inputRef.current?.focus();
  };

  return (
    <SystemNotification
      tone="ready"
      bar="Athlete record"
      code={create ? 'Athlete record / create' : 'Athlete record / rename'}
      titleId="athlete-dialog-title"
      title={create ? 'Add an athlete' : `Rename ${initialName}`}
      bodyId={intro ? 'athlete-dialog-intro' : undefined}
      onClose={onCancel}
      initialFocus={inputRef}
      onSubmit={submit}
      className="athlete-dialog"
      actions={
        <>
          <button type="button" className="threshold-action notification-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="threshold-action notification-btn is-primary">
            {create ? 'Add athlete' : 'Save name'}
          </button>
        </>
      }
    >
      {intro && <p>{intro}</p>}
      <AthleteNameField state={state} inputRef={inputRef} />
    </SystemNotification>
  );
}
