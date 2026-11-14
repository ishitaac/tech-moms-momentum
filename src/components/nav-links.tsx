"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BellIcon, BookmarkIcon, CloseIcon, DashboardIcon, FundersIcon, MenuIcon, PipelineIcon, SettingsIcon } from "./icons";

const GROUPS = [
  { title: "Discover", links: [{ href: "/", label: "Funders", Icon: FundersIcon }] },
  {
    title: "Manage",
    links: [
      { href: "/pipeline", label: "Pipeline", Icon: PipelineIcon },
      { href: "/saved", label: "Saved for Later", Icon: BookmarkIcon },
      { href: "/dashboard", label: "Reports", Icon: DashboardIcon },
    ],
  },
  {
    title: "Support",
    links: [
      { href: "/notifications", label: "Notifications", Icon: BellIcon },
      { href: "/settings", label: "Settings", Icon: SettingsIcon },
    ],
  },
];

/** Left sidebar on desktop; on phones a top bar with a menu button that opens the same list. */
export function Sidebar({ unread }: { unread: number }) {
  const path = usePathname();
  // Menu is "open for this path": navigating to another page closes it without an effect.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === path;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenFor(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Phone top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-card px-4 py-2 lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/tech-moms-logo.png" alt="Tech-Moms" width={72} height={42} priority />
          <span className="text-base text-plum">Funder Finder</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpenFor(open ? null : path)}
          aria-expanded={open}
          aria-controls="main-nav"
          className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-2 text-sm font-medium text-plum hover:bg-plum-tint"
        >
          {open ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          Menu
          {!open && unread > 0 && <span className="rounded-full bg-rose px-1.5 text-xs font-semibold text-plum">{unread}</span>}
        </button>
      </div>

      {open && <button type="button" aria-label="Close menu" className="fixed inset-0 z-30 bg-plum/30 lg:hidden" onClick={() => setOpenFor(null)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-line bg-card px-4 py-6 lg:sticky lg:top-0 lg:z-auto lg:flex lg:h-screen lg:shrink-0 ${open ? "flex" : "hidden"}`}
      >
        <Link href="/" className="mb-8 hidden items-center gap-3 px-4 lg:flex">
          <Image src="/tech-moms-logo.png" alt="Tech-Moms" width={88} height={52} priority />
        </Link>
        <nav id="main-nav" aria-label="Main" className="flex flex-col gap-6">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <p className="mb-2 px-4 text-xs font-medium tracking-wider text-muted">{g.title.toUpperCase()}</p>
              <div className="flex flex-col gap-1">
                {g.links.map(({ href, label, Icon }) => {
                  const active = href === "/" ? path === "/" || path === "/excluded" : path.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-full px-4 py-2.5 text-[15px] font-medium transition-colors ${
                        active ? "bg-plum text-white" : "text-plum hover:bg-plum-tint"
                      }`}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="flex-1">{label}</span>
                      {href === "/notifications" && unread > 0 && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${active ? "bg-white text-plum" : "bg-rose text-plum"}`}
                          aria-label={`${unread} unread`}
                        >
                          {unread}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <p className="mt-auto px-4 text-xs leading-relaxed text-muted">Built from public information. You make every decision.</p>
      </aside>
    </>
  );
}
