interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

export function ChoiceGroup<T extends string>({
  legend,
  name,
  type,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  type: 'radio' | 'checkbox';
  options: Array<ChoiceOption<T>>;
  value: T | T[];
  onChange: (next: T) => void;
}) {
  const isChecked = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);

  return (
    <fieldset className="choice-fieldset">
      <legend className="choice-legend">{legend}</legend>
      <div className="choice-list">
        {options.map((opt) => (
          <label key={opt.value} className="choice-pill">
            <input
              type={type}
              name={name}
              value={opt.value}
              checked={isChecked(opt.value)}
              onChange={() => onChange(opt.value)}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
