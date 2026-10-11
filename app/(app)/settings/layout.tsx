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
      <p className="eyebrow">
        Settings
      </p>
      <h1 className="mt-2 font-display text-[30px] md:text-[40px] leading-[1.08] font-medium">
        Your account.
      </h1>

      <div className="mt-8 mb-10">
        <NavTabs items={TABS} />
      </div>

      {children}
    </div>
  );
}
