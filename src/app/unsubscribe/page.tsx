import { ensureDB, getDB, saveDBAsync } from "@/lib/store";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { setEmailOptOut } from "@/app/actions";

export const dynamic = "force-dynamic";

/**
 * Reached from an email, so there is no session — the signed token identifies
 * the member. Deliberately outside the member auth gate in middleware: asking
 * someone to log in before they can unsubscribe is exactly the pattern that
 * gets a sender marked as spam.
 *
 * The link only shows a confirmation; the actual opt-out is a POST. A GET that
 * unsubscribes would fire whenever a mail client or scanner prefetches the URL.
 */
export default async function Unsubscribe({
  searchParams,
}: {
  searchParams: { t?: string; done?: string; resub?: string };
}) {
  await ensureDB();
  const db = getDB();
  const memberId = verifyUnsubscribeToken(searchParams.t);
  const member = memberId ? db.members.find((m) => m.id === memberId) : undefined;

  const shell = (title: string, body: string, action?: React.ReactNode) => (
    <main className="mx-auto max-w-[420px] px-6 py-16">
      <div className="rounded-xl2 bg-card p-7 text-center shadow-card">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-smoke">ReformerX</p>
        <h1 className="mt-3 font-display text-[24px] leading-tight">{title}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-smoke">{body}</p>
        {action}
      </div>
    </main>
  );

  if (!member) {
    return shell(
      "Link not recognised",
      "This unsubscribe link is not valid. If you keep receiving emails you would rather not, reply to any of them and we will take you off the list."
    );
  }

  if (searchParams.done === "1") {
    return shell(
      "You're unsubscribed",
      `${member.email} will no longer receive studio emails. You will still get sign-in codes when you log in, since those are needed to use the app.`,
      <form action={setEmailOptOut} className="mt-5">
        <input type="hidden" name="token" value={searchParams.t ?? ""} />
        <input type="hidden" name="optOut" value="0" />
        <button className="text-[13px] font-semibold text-ink underline">
          Actually, keep me subscribed
        </button>
      </form>
    );
  }

  if (searchParams.resub === "1") {
    return shell("You're back on the list", `${member.email} will receive studio emails again.`);
  }

  if (member.emailOptOut) {
    return shell(
      "Already unsubscribed",
      `${member.email} is not receiving studio emails.`,
      <form action={setEmailOptOut} className="mt-5">
        <input type="hidden" name="token" value={searchParams.t ?? ""} />
        <input type="hidden" name="optOut" value="0" />
        <button className="text-[13px] font-semibold text-ink underline">Resubscribe</button>
      </form>
    );
  }

  return shell(
    "Unsubscribe from studio emails?",
    `${member.email} will stop receiving news and offers from ReformerX. Sign-in codes will still arrive, because they are needed to log in.`,
    <form action={setEmailOptOut} className="mt-5">
      <input type="hidden" name="token" value={searchParams.t ?? ""} />
      <input type="hidden" name="optOut" value="1" />
      <button className="w-full rounded-xl2 bg-ink py-3 text-[14px] font-semibold text-white">
        Unsubscribe
      </button>
    </form>
  );
}
