import { NavTabs } from "@/components/ui/Tabs";

const TABS = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/privacy", label: "Privacy" },
  { href: "/settings/data", label: "Your data" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
        Settings
      </p>
      <h1 className="mt-2 text-[28px] md:text-[38px] leading-[1.05] tracking-tight font-medium">
        Your account.
      </h1>

      <div className="mt-8 mb-10">
        <NavTabs items={TABS} />
      </div>

      {children}
    </div>
  );
}
