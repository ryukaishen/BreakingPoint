import { useId, useState, type RefObject } from 'react';
import { NAME_MAX } from '../../data/repository';

export const NAME_HELP = 'Baselines, sets and records are kept separately for each athlete on this device.';
export const NAME_REQUIRED = 'Enter a name for this athlete.';

/** Name entry shared by the athlete dialog and the Athletes page editor. */
export function useAthleteName(initial = '') {
  const [name, setName] = useState(initial);
  const [touched, setTouched] = useState(false);
  const clean = name.replace(/\s+/g, ' ').trim();
  const error = touched && !clean ? NAME_REQUIRED : null;
  /** Marks the field as visited and returns the cleaned name, or null when it is empty. */
  const submit = () => {
    setTouched(true);
    return clean || null;
  };
  return { name, setName, setTouched, error, submit };
}

export function AthleteNameField({ state, inputRef }: { state: ReturnType<typeof useAthleteName>; inputRef?: RefObject<HTMLInputElement> }) {
  const help = useId();
  return (
    <label className={`field athlete-name-field ${state.error ? 'has-error' : ''}`}>
      <span className="field-label">Name</span>
      <input
        ref={inputRef}
        className="field-input"
        value={state.name}
        maxLength={NAME_MAX}
        autoComplete="off"
        onChange={(e) => state.setName(e.target.value)}
        onBlur={() => state.setTouched(true)}
        aria-invalid={!!state.error}
        aria-describedby={help}
      />
      <span id={help} className={`field-help ${state.error ? 'error' : ''}`}>
        {state.error ?? NAME_HELP}
      </span>
    </label>
  );
}
