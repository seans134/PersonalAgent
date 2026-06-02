"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/onboarding", label: "Weekly rhythm" },
  { href: "/onboarding/schedule", label: "Schedule" },
  { href: "/goals", label: "Goals" },
  { href: "/goals/completed", label: "Completed" },
  { href: "/calendar", label: "Calendar" },
  { href: "/tracking/meals", label: "Meals" },
  { href: "/tracking/meals/saved", label: "Saved meals" },
  { href: "/tracking/workouts", label: "Workouts" },
  { href: "/tracking/workouts/plan", label: "Workout plan" },
];

export function AppShell({
  children,
  isSignedIn,
}: {
  children: React.ReactNode;
  isSignedIn: boolean;
}) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <button
        aria-controls="app-sidebar"
        aria-expanded={isMenuOpen}
        aria-label={isMenuOpen ? "Close menu" : "Open menu"}
        className="fixed left-4 top-4 z-50 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-900 shadow-sm transition hover:bg-zinc-100"
        onClick={() => setIsMenuOpen((current) => !current)}
        type="button"
      >
        <span className="sr-only">{isMenuOpen ? "Close menu" : "Open menu"}</span>
        <span aria-hidden="true" className="flex flex-col gap-1">
          <span
            className={`block h-0.5 w-5 rounded-full bg-current transition ${
              isMenuOpen ? "translate-y-1.5 rotate-45" : ""
            }`}
          />
          <span
            className={`block h-0.5 w-5 rounded-full bg-current transition ${
              isMenuOpen ? "opacity-0" : ""
            }`}
          />
          <span
            className={`block h-0.5 w-5 rounded-full bg-current transition ${
              isMenuOpen ? "-translate-y-1.5 -rotate-45" : ""
            }`}
          />
        </span>
      </button>

      <div
        className={`fixed inset-0 z-30 bg-zinc-950/35 transition-opacity ${
          isMenuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setIsMenuOpen(false)}
      />

      <aside
        className={`fixed left-0 top-0 z-40 h-screen w-72 max-w-[82vw] border-r border-zinc-200 bg-white px-5 py-6 shadow-xl transition-transform duration-200 ${
          isMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        id="app-sidebar"
      >
        <div className="pl-14">
          <Link className="block" href="/" onClick={() => setIsMenuOpen(false)}>
            <span className="block text-lg font-semibold tracking-tight text-zinc-950">Atlas</span>
            <span className="block text-xs uppercase tracking-wide text-zinc-500">Personal agent</span>
          </Link>
        </div>

        <nav aria-label="Primary navigation" className="mt-8 flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/" ? pathname === item.href : pathname.startsWith(item.href);

            return (
              <Link
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
                }`}
                href={item.href}
                key={item.href}
                onClick={() => setIsMenuOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-8 border-t border-zinc-200 pt-5">
          {isSignedIn ? (
            <form action="/logout" method="post">
              <button
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-center text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
                onClick={() => setIsMenuOpen(false)}
                type="submit"
              >
                Sign out
              </button>
            </form>
          ) : (
            <Link
              className="block rounded-lg border border-zinc-300 px-3 py-2 text-center text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
              href="/auth"
              onClick={() => setIsMenuOpen(false)}
            >
              Sign in
            </Link>
          )}
        </div>
      </aside>

      <div className="min-w-0 pt-10">{children}</div>
    </div>
  );
}
