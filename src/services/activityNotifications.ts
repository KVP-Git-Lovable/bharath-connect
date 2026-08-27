import { supabase } from "@/integrations/supabase/client";

interface CheckInData {
  userId: string;
  activityId: string;
  activityName: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  timestamp: string;
  userFullName: string;
}

/**
 * Creates a check-in notification when user checks into an activity
 * Sends notification to: user, manager, and all admins
 */
export async function createActivityCheckInNotification(data: CheckInData) {
  try {
    // Get user's manager
    const { data: userData } = await supabase
      .from("users")
      .select("reporting_manager_id")
      .eq("id", data.userId)
      .single();

    // Get all admins (users with admin role)
    const { data: adminData } = await supabase
      .from("security_profiles")
      .select("id")
      .eq("name", "Admin");

    const adminId = adminData?.[0]?.id;

    // Get all users with admin role
    let adminUserIds: string[] = [];
    if (adminId) {
      const { data: adminUsers } = await supabase
        .from("user_security_profiles")
        .select("user_id")
        .eq("profile_id", adminId);
      adminUserIds = (adminUsers || []).map((u: any) => u.user_id);
    }

    // Build notification message with location
    const locationText = data.address ? ` at ${data.address}` : "";
    const title = "Activity Check-in";
    const message = `${data.userFullName} checked into ${data.activityName}${locationText}`;

    // Recipients: user, manager, and all admins
    const recipientIds = [
      data.userId,
      ...(userData?.reporting_manager_id ? [userData.reporting_manager_id] : []),
      ...adminUserIds,
    ];

    // Remove duplicates
    const uniqueRecipients = [...new Set(recipientIds)];

    // Create notifications in database (shows in bell icon)
    const notifications = uniqueRecipients.map((userId) => ({
      user_id: userId,
      title,
      message,
      type: "activity_check_in",
      is_read: false,
      related_table: "activity_events",
      related_id: data.activityId,
      created_at: new Date().toISOString(),
    }));

    if (notifications.length > 0) {
      await supabase.from("notifications").insert(notifications);
    }

    // Send push notifications (APK + PWA)
    // This will be handled by a Cloud Function or edge function
    await sendPushNotifications({
      recipientIds: uniqueRecipients,
      title,
      message,
      data: {
        activityId: data.activityId,
        type: "activity_check_in",
        lat: data.latitude?.toString() || "",
        lng: data.longitude?.toString() || "",
      },
    });

    return { success: true, notificationCount: notifications.length };
  } catch (error) {
    console.error("Error creating activity check-in notification:", error);
    throw error;
  }
}

/**
 * Sends push notifications to FCM (APK) and Web Push (PWA)
 * This function should be called from your backend/edge function
 */
async function sendPushNotifications(options: {
  recipientIds: string[];
  title: string;
  message: string;
  data: Record<string, string>;
}) {
  try {
    // Get push tokens for all recipients
    const { data: tokens } = await supabase
      .from("push_tokens")
      .select("token, platform, user_id")
      .in("user_id", options.recipientIds);

    if (!tokens || tokens.length === 0) {
      console.log("No push tokens found for recipients");
      return;
    }

    // Separate by platform
    const androidTokens = tokens
      .filter((t: any) => t.platform === "android")
      .map((t: any) => t.token);

    const webTokens = tokens
      .filter((t: any) => t.platform === "web")
      .map((t: any) => t.token);

    // Send to APK (Android via FCM)
    if (androidTokens.length > 0) {
      await sendFCMNotifications(androidTokens, options);
    }

    // Send to PWA (Web Push)
    if (webTokens.length > 0) {
      await sendWebPushNotifications(webTokens, options);
    }
  } catch (error) {
    console.error("Error sending push notifications:", error);
    // Don't throw - in-app notifications already created
  }
}

/**
 * Send via Firebase Cloud Messaging (for APK)
 * This should call your backend FCM service
 */
async function sendFCMNotifications(
  tokens: string[],
  options: {
    recipientIds: string[];
    title: string;
    message: string;
    data: Record<string, string>;
  }
) {
  // Call your backend API endpoint that sends FCM messages
  // Example: POST /api/notifications/fcm
  try {
    const response = await fetch("/api/notifications/fcm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokens,
        title: options.title,
        body: options.message,
        data: options.data,
      }),
    });

    if (!response.ok) {
      console.error("FCM notification error:", await response.text());
    }
  } catch (error) {
    console.error("Error calling FCM API:", error);
  }
}

/**
 * Send via Web Push API (for PWA)
 * This should call your backend Web Push service
 */
async function sendWebPushNotifications(
  tokens: string[],
  options: {
    recipientIds: string[];
    title: string;
    message: string;
    data: Record<string, string>;
  }
) {
  // Call your backend API endpoint that sends Web Push messages
  // Example: POST /api/notifications/web-push
  try {
    const response = await fetch("/api/notifications/web-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscriptions: tokens,
        title: options.title,
        body: options.message,
        data: options.data,
      }),
    });

    if (!response.ok) {
      console.error("Web Push notification error:", await response.text());
    }
  } catch (error) {
    console.error("Error calling Web Push API:", error);
  }
}
