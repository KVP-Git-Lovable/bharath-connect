import { useEffect, useRef } from "react";

/**
 * Mobile-friendly tables: copies each column header onto its cells as a
 * `data-label` attribute so the table can collapse into stacked
 * label/value cards on small screens (see `.responsive-table` in index.css).
 */
export function useStackedTable<T extends HTMLTableElement = HTMLTableElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const table = ref.current;
    if (!table) return;

    const sync = () => {
      const headers = Array.from(table.querySelectorAll("thead th")).map(
        (th) => (th.textContent || "").trim(),
      );
      if (!headers.length) return;
      table.querySelectorAll("tbody tr").forEach((tr) => {
        Array.from(tr.children).forEach((cell, i) => {
          const el = cell as HTMLElement;
          if (el.getAttribute("colspan")) {
            el.removeAttribute("data-label");
            return;
          }
          el.setAttribute("data-label", headers[i] ?? "");
        });
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(table, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return ref;
}
