import { unreadNotificationCount } from "@/lib/queries";
import { Sidebar } from "./nav-links";

export async function AppNav() {
  const unread = await unreadNotificationCount();
  return <Sidebar unread={unread} />;
}
