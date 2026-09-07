"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

const navItems = [
  { href: "/", label: "Today" },
  { href: "/onboarding", label: "Weekly rhythm" },
  { href: "/onboarding/schedule", label: "Schedule" },
  { href: "/goals", label: "Goals" },
  { href: "/goals/completed", label: "Completed" },
  { href: "/courses", label: "Courses" },
  { href: "/calendar/local", label: "Local calendar" },
  { href: "/calendar", label: "Calendar" },
  { href: "/tracking/meals", label: "Meals" },
  { href: "/tracking/meals/saved", label: "Saved meals" },
  { href: "/tracking/workouts", label: "Workouts" },
  { href: "/tracking/workouts/plan", label: "Workout plan" },
  { href: "/tracking/insights", label: "Insights" },
];

type ThemeChoice = "system" | "light" | "dark";

const THEME_KEY = "atlas.theme";

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

// Read the persisted choice as an external store so the toggle stays in sync
// without a setState-in-effect (and without a hydration mismatch: the server
// snapshot is always "system", matching the pre-hydration markup).
function subscribeTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getThemeSnapshot(): ThemeChoice {
  const stored = window.localStorage.getItem(THEME_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function ThemeToggle() {
  const choice = useSyncExternalStore<ThemeChoice>(subscribeTheme, getThemeSnapshot, () => "system");

  function choose(next: ThemeChoice) {
    window.localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
    // storage events don't fire in the tab that made the change, so nudge our
    // own subscriber to re-read the snapshot.
    window.dispatchEvent(new Event("storage"));
  }

  const options: Array<{ value: ThemeChoice; label: string }> = [
    { value: "system", label: "Auto" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];

  return (
    <div className="flex gap-1 rounded-full border border-line bg-surface2 p-1" role="group" aria-label="Theme">
      {options.map((option) => (
        <button
          aria-pressed={choice === option.value}
          className={`flex-1 rounded-full px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] transition ${
            choice === option.value ? "bg-teal text-on-teal" : "text-ink-muted hover:text-ink"
          }`}
          key={option.value}
          onClick={() => choose(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

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
        className="fixed left-4 top-4 z-50 inline-flex h-11 w-11 items-center justify-center rounded-[11px] border border-line bg-surface text-ink shadow-[var(--shadow-sm)] transition hover:bg-surface2"
        onClick={() => setIsMenuOpen((current) => !current)}
        type="button"
      >
        <span className="sr-only">{isMenuOpen ? "Close menu" : "Open menu"}</span>
        <span aria-hidden="true" className="flex flex-col gap-1">
          <span className={`block h-0.5 w-5 rounded-full bg-current transition ${isMenuOpen ? "translate-y-1.5 rotate-45" : ""}`} />
          <span className={`block h-0.5 w-5 rounded-full bg-current transition ${isMenuOpen ? "opacity-0" : ""}`} />
          <span className={`block h-0.5 w-5 rounded-full bg-current transition ${isMenuOpen ? "-translate-y-1.5 -rotate-45" : ""}`} />
        </span>
      </button>

      <div
        className={`fixed inset-0 z-30 bg-ink/40 transition-opacity ${isMenuOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => setIsMenuOpen(false)}
      />

      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen w-72 max-w-[82vw] flex-col border-r border-line bg-surface px-5 py-6 shadow-[var(--shadow-md)] transition-transform duration-200 ${
          isMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        id="app-sidebar"
      >
        <div className="pl-14">
          <Link className="block" href="/" onClick={() => setIsMenuOpen(false)}>
            <span className="block font-display text-lg font-bold tracking-tight text-ink">Atlas</span>
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-teal">
              <span className="inline-block h-px w-4 bg-teal" aria-hidden="true" />
              Your day, charted
            </span>
          </Link>
        </div>

        <nav aria-label="Primary navigation" className="mt-8 flex flex-1 flex-col gap-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              item.href === "/" ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                className={`rounded-[11px] px-3 py-2 text-sm font-medium transition ${
                  isActive ? "bg-teal text-on-teal" : "text-ink-muted hover:bg-surface2 hover:text-ink"
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

        <div className="mt-6 flex flex-col gap-4 border-t border-line pt-5">
          <ThemeToggle />
          {isSignedIn ? (
            <form action="/logout" method="post">
              <button
                className="w-full rounded-[11px] border border-line px-3 py-2 text-center text-sm font-medium text-ink transition hover:bg-surface2"
                onClick={() => setIsMenuOpen(false)}
                type="submit"
              >
                Sign out
              </button>
            </form>
          ) : (
            <Link
              className="block rounded-[11px] border border-line px-3 py-2 text-center text-sm font-medium text-ink transition hover:bg-surface2"
              href="/auth"
              onClick={() => setIsMenuOpen(false)}
            >
              Sign in
            </Link>
          )}
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col pt-10">
        <div className="flex-1">{children}</div>
        <footer className="border-t border-line px-6 py-5">
          <nav
            aria-label="Legal and support links"
            className="mx-auto flex w-full max-w-4xl flex-wrap gap-x-5 gap-y-2 text-sm text-ink-muted"
          >
            <Link className="transition hover:text-ink" href="/privacy">
              Privacy
            </Link>
            <Link className="transition hover:text-ink" href="/terms">
              Terms
            </Link>
            <Link className="transition hover:text-ink" href="/support">
              Support
            </Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
