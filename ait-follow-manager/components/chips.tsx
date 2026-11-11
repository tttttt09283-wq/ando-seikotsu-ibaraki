/** 少ないタップで選べるラジオボタン（チップ表示） */
export function ChipGroup({
  name,
  legend,
  options,
  defaultValue,
  required,
}: {
  name: string;
  legend: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1 text-sm font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={defaultValue === o.value}
              required={required}
              className="peer sr-only"
            />
            <span className="inline-flex h-10 items-center rounded-full border border-input bg-card px-4 text-sm font-semibold peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-ring">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
