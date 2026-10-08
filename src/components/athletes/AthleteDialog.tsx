import { useState, type FormEvent } from 'react';
import { NAME_MAX } from '../../data/repository';
import { useDialog } from '../../utils/hooks';

interface Props {
  mode: 'create' | 'rename';
  initialName?: string;
  /** Shown above the field, e.g. why a profile is needed right now. */
  intro?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export function AthleteDialog({ mode, initialName = '', intro, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initialName);
  const [touched, setTouched] = useState(false);
  const inputRef = useDialog<HTMLInputElement>(onCancel);
  const clean = name.replace(/\s+/g, ' ').trim();
  const error = touched && !clean ? 'Enter a name for this athlete.' : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (clean) onSubmit(clean);
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="confirm sys-window" role="dialog" aria-modal="true" aria-labelledby="athlete-dialog-title" onClick={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <h2 id="athlete-dialog-title">{mode === 'create' ? 'Add an athlete' : 'Rename athlete'}</h2>
        {intro && <p className="confirm-body">{intro}</p>}
        <label className="field">
          <span className="field-label">Name</span>
          <input
            ref={inputRef}
            className="field-input"
            value={name}
            maxLength={NAME_MAX}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={!!error}
            aria-describedby="athlete-name-help"
          />
          <span id="athlete-name-help" className={`field-help ${error ? 'error' : ''}`}>
            {error ?? 'Baselines, sets and records are kept separately for each athlete on this device.'}
          </span>
        </label>
        <div className="confirm-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {mode === 'create' ? 'Add athlete' : 'Save name'}
          </button>
        </div>
      </form>
    </div>
  );
}
