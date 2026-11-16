import { useEffect, useState } from "react";

/**
 * Delays a changing value until typing settles.
 *
 * Search boxes are wired to API requests, so without this every keystroke is
 * a round trip — and the responses can arrive out of order, leaving the list
 * showing results for a prefix of what was typed.
 */
export default function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
