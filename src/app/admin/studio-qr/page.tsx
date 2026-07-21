import { getDB } from "@/lib/store";
import QRDisplay from "@/components/QRDisplay";

export const dynamic = "force-dynamic";

export default function StudioQR() {
  const db = getDB();
  return (
    <div>
      <h1 className="font-display text-[32px]">Studio QR</h1>
      <p className="mt-1 max-w-lg text-[13px] text-smoke">
        Print this and place it at the entrance. Members scan it in the app to check in. Check-in only succeeds
        for members with an active membership, a booked class, inside the ±30 minute window, once per class.
      </p>
      <div className="mt-6 inline-block rounded-xl2 bg-white p-10 text-center shadow-card">
        <p className="font-display text-[22px] tracking-[0.25em]">REFORMER X</p>
        <p className="mt-1 text-[13px] text-smoke">Scan to check in</p>
        <div className="mt-5 flex justify-center">
          <QRDisplay value={db.settings.studioCode} size={280} />
        </div>
        <p className="mt-4 font-mono text-[13px] text-smoke">{db.settings.studioCode}</p>
      </div>
    </div>
  );
}
