import { redirect } from "next/navigation";
import { currentMember } from "@/lib/auth";
import Scanner from "@/components/Scanner";
import QRDisplay from "@/components/QRDisplay";

export const dynamic = "force-dynamic";

export default function CheckinPage() {
  const member = currentMember();
  if (!member) redirect("/login");
  return (
    <main className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <p className="text-[13px] font-medium uppercase tracking-[0.18em] text-smoke">Studio entrance</p>
      <h1 className="font-display text-[34px]">Check in</h1>
      <p className="mt-1 text-[14px] text-smoke">
        Scan the QR at the entrance. Works 30 min before class until 30 min after — and only for classes you booked.
      </p>
      <div className="mt-5">
        <Scanner />
      </div>
      <section className="mt-6 rounded-xl2 bg-card p-5 text-center shadow-card">
        <p className="text-[12px] font-semibold uppercase tracking-[0.15em] text-smoke">Or show your member QR at reception</p>
        <div className="mt-3 flex justify-center">
          <QRDisplay value={member.qrCode} size={190} />
        </div>
        <p className="mt-2 font-mono text-[13px] text-smoke">{member.qrCode}</p>
      </section>
    </main>
  );
}
