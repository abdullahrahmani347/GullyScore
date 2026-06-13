export default function LiveLayout({ children }: { children: React.ReactNode }) {
  // The spectator page manages its own full-height layout without bottom nav
  // Override the root layout's pb-20 with pb-0
  return (
    <div className="-m-[0] -mb-20">
      {children}
    </div>
  );
}
