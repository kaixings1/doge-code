// Standalone layout: no sidebar, no chrome. The onboarding flow is the entire screen.
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background p-6">{children}</div>;
}
