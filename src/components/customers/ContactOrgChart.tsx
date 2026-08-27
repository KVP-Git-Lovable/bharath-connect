import { useMemo } from "react";
import { Contact } from "@/hooks/useCustomers";

interface Node extends Contact { children: Node[] }

function buildTree(contacts: Contact[]): Node[] {
  const map = new Map<string, Node>();
  contacts.forEach((c) => map.set(c.id, { ...c, children: [] }));
  const roots: Node[] = [];
  map.forEach((n) => {
    if (n.reports_to_id && map.has(n.reports_to_id)) {
      map.get(n.reports_to_id)!.children.push(n);
    } else {
      roots.push(n);
    }
  });
  return roots;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
}

function NodeCard({ node }: { node: Node }) {
  return (
    <div className="flex flex-col items-center">
      <div className="min-w-[220px] rounded-2xl border bg-card shadow-sm px-4 py-3 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
          {initials(node.name)}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{node.name}</div>
          <div className="text-xs text-muted-foreground truncate">{node.title || "—"}</div>
        </div>
      </div>

      {node.children.length > 0 && (
        <>
          <div className="w-px h-6 bg-border" />
          <div className="relative flex gap-8">
            {node.children.length > 1 && (
              <div className="absolute top-0 left-4 right-4 h-px bg-border" />
            )}
            {node.children.map((c) => (
              <div key={c.id} className="flex flex-col items-center pt-6 relative">
                <div className="absolute top-0 left-1/2 w-px h-6 bg-border -translate-x-1/2" />
                <NodeCard node={c} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ContactOrgChart({ contacts }: { contacts: Contact[] }) {
  const tree = useMemo(() => buildTree(contacts), [contacts]);

  if (tree.length === 0) {
    return <div className="text-center py-10 text-sm text-muted-foreground">No contacts yet.</div>;
  }

  return (
    <div className="w-full overflow-x-auto pb-4">
      <div className="inline-flex gap-10 min-w-full justify-center px-6 py-4">
        {tree.map((root) => <NodeCard key={root.id} node={root} />)}
      </div>
    </div>
  );
}
