import React from "react";

/**
 * Label + control + hint, with the label tied to the control by id.
 *
 * `required` renders a visible marker rather than relying on the HTML
 * attribute alone, because a required field that looks optional is only
 * discovered when submitting fails.
 */
export const Field = ({ id, label, required = false, hint = null, children }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-gray-700">
      {label}
      {required && (
        <span className="ml-0.5 text-red-600" aria-hidden="true">
          *
        </span>
      )}
    </label>
    <div className="mt-1">{children}</div>
    {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
  </div>
);

const CONTROL =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500";

export const TextInput = ({ id, ...props }) => (
  <input id={id} name={id} className={CONTROL} {...props} />
);

export const TextArea = ({ id, rows = 4, ...props }) => (
  <textarea id={id} name={id} rows={rows} className={CONTROL} {...props} />
);

export const Select = ({ id, options, placeholder, ...props }) => (
  <select id={id} name={id} className={CONTROL} {...props}>
    {placeholder !== undefined && <option value="">{placeholder}</option>}
    {options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

export default Field;
