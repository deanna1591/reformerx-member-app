import BottomNav from "@/components/BottomNav";

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-md pb-32">
      {children}
      <BottomNav />
    </div>
  );
}
