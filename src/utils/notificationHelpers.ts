import { supabase } from "@/integrations/supabase/client";

/**
 * Get all admin user IDs from user_roles table.
 */
export async function getAdminUserIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_roles" as any)
    .select("user_id")
    .eq("role", "admin");

  if (error) {
    console.error("Failed to fetch admin user IDs:", error);
    return [];
  }
  return (data || []).map((r: any) => r.user_id as string);
}

/**
 * Get notification recipients (manager + admins, deduped) for a given user.
 * Falls back to admins only if no manager is assigned.
 */
export async function getNotificationRecipients(
  userId: string
): Promise<string[]> {
  const { data: userData } = await supabase
    .from("users")
    .select("reporting_manager_id, full_name")
    .eq("id", userId)
    .single();

  const managerId = userData?.reporting_manager_id || null;
  const adminIds = await getAdminUserIds();

  const recipientSet = new Set<string>();
  if (managerId) recipientSet.add(managerId);
  adminIds.forEach((id) => recipientSet.add(id));
  recipientSet.delete(userId);

  return Array.from(recipientSet);
}

/**
 * Get ALL active user IDs (excluding the given user). Used for broadcast-style
 * notifications (e.g. attendance check-in/check-out) where every team member
 * should be informed regardless of hierarchy or role.
 */
export async function getAllActiveUserIds(
  excludeUserId?: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("is_active", true);

  if (error) {
    console.error("Failed to fetch active user IDs:", error);
    return [];
  }
  return (data || [])
    .map((u: any) => u.id as string)
    .filter((id) => id !== excludeUserId);
}



/**
 * Send in-app notification (bell icon) + native push notification via a single
 * backend call. This replaces the old client-side insert + fire-and-forget
 * approach which was unreliable in mobile WebViews.
 */
export async function sendNotificationWithPush(
  recipientIds: string[],
  notification: {
    title: string;
    message: string;
    type?: string;
    related_table?: string;
    related_id?: string;
  }
): Promise<void> {
  if (recipientIds.length === 0) return;

  try {
    const { data, error } = await supabase.functions.invoke(
      "dispatch-notification",
      {
        body: {
          recipient_ids: recipientIds,
          title: notification.title,
          message: notification.message,
          type: notification.type || "info",
          related_table: notification.related_table || null,
          related_id: notification.related_id || null,
        },
      }
    );

    if (error) {
      console.error("Notification dispatch failed:", error);
    } else {
      console.log("Notification dispatch result:", data);
    }
  } catch (e) {
    console.error("Notification dispatch error:", e);
  }
}

/**
 * Broadcast a notification to every active user except the actor. Recipient
 * selection happens in the backend so attendance alerts do not depend on the
 * check-in user's app version, permissions, or client-side query result.
 */
export async function broadcastNotificationToActiveUsers(
  excludeUserId: string | undefined,
  notification: {
    title: string;
    message: string;
    type?: string;
    related_table?: string;
    related_id?: string;
  }
): Promise<void> {
  if (!excludeUserId) return;

  try {
    const { data, error } = await supabase.functions.invoke(
      "dispatch-notification",
      {
        body: {
          broadcast_all_active: true,
          exclude_user_id: excludeUserId,
          title: notification.title,
          message: notification.message,
          type: notification.type || "info",
          related_table: notification.related_table || null,
          related_id: notification.related_id || null,
        },
      }
    );

    if (error) {
      console.error("Broadcast notification dispatch failed:", error);
    } else {
      console.log("Broadcast notification dispatch result:", data);
    }
  } catch (e) {
    console.error("Broadcast notification dispatch error:", e);
  }
}

/**
 * Notify an actor's reporting manager + all admins for approval-style events
 * (leave requests, regularization requests). Recipient resolution happens
 * server-side so admins are never dropped by the submitter's RLS scope. Sends
 * in-app + FCM (APK) + Web Push (PWA) in one call.
 */
export async function notifyManagersAndAdmins(
  actorUserId: string,
  notification: {
    title: string;
    message: string;
    type?: string;
    related_table?: string;
    related_id?: string;
  }
): Promise<void> {
  if (!actorUserId) return;

  try {
    const { data, error } = await supabase.functions.invoke(
      "dispatch-notification",
      {
        body: {
          notify_actor_chain: true,
          actor_user_id: actorUserId,
          title: notification.title,
          message: notification.message,
          type: notification.type || "info",
          related_table: notification.related_table || null,
          related_id: notification.related_id || null,
        },
      }
    );

    if (error) {
      console.error("Actor-chain notification dispatch failed:", error);
    } else {
      console.log("Actor-chain notification dispatch result:", data);
    }
  } catch (e) {
    console.error("Actor-chain notification dispatch error:", e);
  }
}

/**
 * @deprecated Use sendNotificationWithPush instead
 */
export const sendNotificationToMany = sendNotificationWithPush;
