import { formatDistanceToNow } from "date-fns";
import { desc } from "drizzle-orm";
import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { db, schema } from "@/db";
import { BellIcon, CalendarIcon, DoorIcon, SparkleIcon } from "@/components/icons";
import { MarkAllRead } from "@/components/notifications/mark-all-read";
import { BTN, CARD, PageHeader, Pill } from "@/components/ui";

const LIMIT = 100;

/** Icon, chip color and action wording for each kind of update (stored kinds are unchanged). */
const KIND = {
  new_match: { Icon: SparkleIcon, chip: "bg-teal-tint", action: "View funder" },
  open_call: { Icon: DoorIcon, chip: "bg-teal-tint", action: "See the opportunity" },
  deadline: { Icon: CalendarIcon, chip: "bg-rose-tint", action: "View details" },
} as const;

async function List() {
  await connection();
  const rows = await db.select().from(schema.notifications).orderBy(desc(schema.notifications.createdAt)).limit(LIMIT);
  const unread = rows.filter((r) => !r.readAt).length;

  if (rows.length === 0) {
    return (
      <div className={`${CARD} flex flex-col items-center px-6 py-14 text-center`}>
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-tint text-plum">
          <BellIcon className="h-7 w-7" />
        </span>
        <h2 className="mt-5 text-section font-semibold text-plum">You’re all caught up.</h2>
        <p className="mt-2 max-w-sm text-body text-muted">New funder matches, deadlines, and reminders will appear here.</p>
        <Link href="/" className={`${BTN.primary} mt-6`}>
          Explore funders
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 text-body text-muted">
        <span>{unread > 0 ? `${unread} new ${unread === 1 ? "update" : "updates"}` : "No new updates"}</span>
        {unread > 0 && <MarkAllRead />}
      </div>
      <ul className="space-y-3">
        {rows.map((n) => {
          const { Icon, chip, action } = KIND[n.kind];
          const external = n.link?.startsWith("http");
          return (
            <li key={n.id} className={`${CARD} flex items-start gap-4 p-5 ${n.readAt ? "" : "border-l-4 border-l-teal-strong"}`}>
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-plum ${chip}`}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[16px] font-semibold leading-snug text-plum">
                  {!n.readAt && (
                    <Pill tone="teal" className="mr-2 align-middle">
                      New<span className="sr-only">:</span>
                    </Pill>
                  )}
                  {n.title}
                </h3>
                {n.body && <p className="mt-1 line-clamp-2 text-body text-muted">{n.body}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="text-sm text-muted">{formatDistanceToNow(n.createdAt, { addSuffix: true })}</span>
                  {n.link && (
                    <a href={n.link} className={BTN.link} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                      {action}
                      {external ? " ↗" : ""}
                    </a>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <>
      <PageHeader title="Notifications" subtitle="Funding updates that need your attention." />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-[16px] bg-card" />}>
        <List />
      </Suspense>
    </>
  );
}
