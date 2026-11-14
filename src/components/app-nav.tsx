import { pendingApprovalCount } from "@/lib/approvals/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { unreadNotificationCount } from "@/lib/queries";
import { Sidebar } from "./nav-links";

/** Signed-out pages (login, password reset) get no navigation. */
export async function AppNav() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [unread, pendingApprovals] = await Promise.all([unreadNotificationCount(), pendingApprovalCount()]);
  return <Sidebar unread={unread} pendingApprovals={user.role === "admin" ? pendingApprovals : 0} user={{ name: user.name, email: user.email, role: user.role }} />;
}
