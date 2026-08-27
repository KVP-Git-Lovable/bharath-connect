import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import CreativeActivityForm from "@/components/activities/CreativeActivityForm";
import { useActivities } from "@/hooks/useActivities";
import { useActivityTypeOptions } from "@/hooks/useLeadActivities";
import { useCurrentUser } from "@/hooks/useCurrentUser";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string;
  editActivity?: any | null;
}

/**
 * Lead activity composer — reuses the exact same creative composer
 * used by the calendar Activities module, with the lead pre-selected.
 */
export function LeadActivityComposer({ open, onOpenChange, leadId, editActivity }: Props) {
  const qc = useQueryClient();
  const { users, sites, fetchDropdowns, createActivity, updateActivity, deleteActivity } = useActivities();
  const { data: activityTypes = [] } = useActivityTypeOptions();
  const { userId } = useCurrentUser();

  useEffect(() => {
    if (open) fetchDropdowns();
  }, [open, fetchDropdowns]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["lead-activities", leadId] });
  };

  return (
    <CreativeActivityForm
      open={open}
      onOpenChange={onOpenChange}
      projects={sites.filter((s) => s.is_active).map((s) => ({ id: s.id, name: s.site_name }))}
      users={users}
      activityTypes={activityTypes}
      currentUserId={userId || ""}
      createActivity={createActivity}
      updateActivity={updateActivity}
      editActivity={editActivity || null}
      defaultLeadId={leadId}
      onCreated={refresh}
      onDelete={async (id: string) => {
        await deleteActivity(id);
        refresh();
        onOpenChange(false);
      }}
    />
  );
}

export default LeadActivityComposer;
