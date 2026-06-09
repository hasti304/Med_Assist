import { useState } from 'react';

/** Coerce profile/API values into a string array for tag lists. */
export function normalizeTagList(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return [];
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return normalizeTagList(parsed);
      } catch {
        /* fall through */
      }
    }
    return s.split(',').map((t) => t.trim()).filter(Boolean);
  }
  return [];
}

const inputClass =
  'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400';

export default function TagInput({ value, onChange, placeholder }) {
  const [input, setInput] = useState('');
  const tags = normalizeTagList(value);

  function add(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const trimmed = input.trim();
    if (!trimmed) return;
    const exists = tags.some((t) => t.toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      onChange([...tags, trimmed]);
    }
    setInput('');
  }

  function remove(tag) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div>
      <div className="flex gap-2 items-stretch">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(e);
            }
          }}
          placeholder={placeholder}
          className={inputClass}
        />
        <button
          type="button"
          onClick={add}
          aria-label="Add item"
          className="shrink-0 min-w-[44px] px-3 py-2.5 bg-teal-600 text-white rounded-xl text-lg font-bold leading-none hover:bg-teal-700 active:scale-95 transition-all"
        >
          +
        </button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {tags.map((tag, i) => (
            <span
              key={`${tag}-${i}`}
              className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-200/60"
            >
              {tag}
              <button
                type="button"
                onClick={() => remove(tag)}
                className="text-teal-400 hover:text-red-500 ml-0.5"
                aria-label={`Remove ${tag}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
