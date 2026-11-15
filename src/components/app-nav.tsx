import { unreadNotificationCount } from "@/lib/queries";
import { pendingApprovalCount } from "@/lib/approvals/service";
import { can, ROLE_LABEL } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { Sidebar } from "./nav-links";

export async function AppNav() {
  const user = await getCurrentUser();
  // Signed-out pages (sign-in, password reset) show no app navigation.
  if (!user) return null;
  const [unread, pending] = await Promise.all([unreadNotificationCount(), pendingApprovalCount()]);
  return (
    <Sidebar
      unread={unread}
      pendingApprovals={pending}
      user={{ name: user.name, email: user.email, roleLabel: user.role ? ROLE_LABEL[user.role] : "No role", canManageUsers: can(user.rawRole, "users:manage") }}
    />
  );
}
