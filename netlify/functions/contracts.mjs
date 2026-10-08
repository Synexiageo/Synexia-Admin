// ხელმოწერილი ხელშეკრულებები დრაივში.
//
// ყოველ 5 წუთში ამოწმებს, ხომ არ გაჩნდა ახალი ანკეტა, რომელსაც ხელშეკრულება
// აქვს მიბმული და დრაივში ჯერ არ ატვირთულა. ააწყობს დოკუმენტს შევსებული
// მონაცემებით, გაუგზავნის Apps Script-ს და ბმულს ანკეტას მიაწერს.
//
// ატვირთვა აქ ხდება და არა ანკეტაში, რომ დრაივის საიდუმლო ბრაუზერში არ მოხვდეს.

import { sbTable, say, OWNER } from "../lib/bot.mjs";

export const config = { schedule: "*/5 * * * *" };

const DRIVE_URL = process.env.DRIVE_URL || "";
const DRIVE_SECRET = process.env.DRIVE_SECRET || "";

const KIND = { individual: "ფიზიკური პირი", entrepreneur: "მცირე მეწარმე", legal: "შპს" };
const MONTHS = ["იანვარი","თებერვალი","მარტი","აპრილი","მაისი","ივნისი",
                "ივლისი","აგვისტო","სექტემბერი","ოქტომბერი","ნოემბერი","დეკემბერი"];

const esc = t => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ფაილის სახელში ეს სიმბოლოები პრობლემას ქმნის
const safe = t => String(t || "").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();

function buildDoc(reg, body) {
  const d = new Date(reg.agreed_at || reg.created_at || Date.now());
  const tb = new Date(d.getTime() + 4 * 3600e3);
  const vals = {
    "თარიღი": `${tb.getUTCDate()} ${MONTHS[tb.getUTCMonth()]} ${tb.getUTCFullYear()}წ`,
    "სახელი": [reg.first_name, reg.last_name].filter(Boolean).join(" ") || "—",
    "პირადი": reg.personal_id || "—",
    "კომპანია": reg.company_name || "—",
    "საიდენტიფიკაციო": reg.company_id || "—",
    "ანგარიში": reg.account_number || "—",
  };
  const filled = body.replace(/\{\{([^}]+)\}\}/g, (m, k) => esc(vals[k.trim()] ?? m));

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { margin: 2cm 2cm 2.2cm; }
  body { font-family: "Sylfaen", "Noto Sans Georgian", serif; font-size: 11pt;
         line-height: 1.62; color: #000; text-align: justify; margin: 0; }
  h1 { font-size: 12pt; font-weight: normal; letter-spacing: .18em;
       text-align: center; margin: 0 0 22pt; }
  p { margin: 0 0 7pt; }
  .ct-top { display: flex; justify-content: space-between; margin: 0 0 20pt; }
  .ct-n { display: inline-block; }
  .ct-l0 { padding-left: 2.2em; text-indent: -2.2em; margin-top: 10pt; }
  .ct-l0 .ct-n { min-width: 2.2em; }
  .ct-l1 { padding-left: 4.4em; text-indent: -2.9em; }
  .ct-l1 .ct-n { min-width: 2.9em; }
  .ct-l2 { padding-left: 6.6em; text-indent: -3.4em; }
  .ct-l2 .ct-n { min-width: 3.4em; }
  .ct-l3 { padding-left: 8.8em; text-indent: -3.9em; }
  .ct-l3 .ct-n { min-width: 3.9em; }
  .ct-sign { text-align: left; margin: 3pt 0 0; }
  .ct-sigwrap { margin: 2pt 0 -4pt; text-align: left; }
  .ct-sig { height: 46pt; width: auto; display: block; }
  .ct-sign:first-of-type { margin-top: 26pt; }
  .agreed { margin-top: 26pt; padding-top: 10pt; border-top: 1px solid #999;
            font-size: 9.5pt; color: #444; text-align: left; }
  </style></head><body>
  ${filled}
  <div class="agreed">
    პირობებს დაეთანხმა ელექტრონულად: ${esc(vals["სახელი"])} (პ/ნ ${esc(vals["პირადი"])})<br>
    თარიღი და დრო: ${esc(new Date(reg.agreed_at).toISOString().replace("T", " ").slice(0, 16))} UTC<br>
    ხელშეკრულების ვერსია: ${esc(reg.contract_version ?? "1")} · ჩანაწერი #${esc(reg.id)}
  </div>
  </body></html>`;
}

export default async () => {
  if (!DRIVE_URL || !DRIVE_SECRET) return new Response("ok");

  let done = 0, failed = 0, firstError = "";
  try {
    const rows = await sbTable(
      "registrations?contract_id=not.is.null&drive_url=is.null"
      + "&select=id,first_name,last_name,personal_id,account_number,company_name,company_id,"
      + "entity_type,agreed_at,created_at,contract_id,email&order=created_at.asc&limit=20");
    if (!rows?.length) return new Response("ok");

    const ids = [...new Set(rows.map(r => r.contract_id))];
    const cs = await sbTable(
      `contracts?id=in.(${ids.join(",")})&select=id,body,version,entity_type`);
    const byId = Object.fromEntries((cs || []).map(c => [c.id, c]));

    for (const r of rows) {
      const c = byId[r.contract_id];
      if (!c) continue;
      r.contract_version = c.version;
      const day = String(r.agreed_at || "").slice(0, 10);
      const kind = KIND[c.entity_type] || "სხვა";
      const name = safe(`${day} ${[r.first_name, r.last_name].filter(Boolean).join(" ")} (${kind})`);
      // დრაივში: ხელშეკრულებები / 2026-10-09 / ფიზიკური პირი /
      const path = [day, kind];

      try {
        const res = await fetch(DRIVE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret: DRIVE_SECRET, name, path, html: buildDoc(r, c.body),
            email: r.email || "",
            person: [r.first_name, r.last_name].filter(Boolean).join(" "),
          }),
        });
        const out = await res.json();
        if (!out.ok) throw new Error(out.error || "drive");

        await sbTable(`registrations?id=eq.${r.id}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ drive_url: out.url }),
        });
        done++;
      } catch (e) {
        failed++;
        if (!firstError) firstError = e.message;
        console.error("drive upload", r.id, e.message);
      }
    }

    // პირველ ჩავარდნაზე ვატყობინებ — თორემ ჩუმად დაგროვდება
    if (failed && OWNER) {
      await say(OWNER, `⚠️ ${failed} ხელშეკრულება ვერ აიტვირთა დრაივში.\n\n`
        + `მიზეზი: ${String(firstError).slice(0, 300)}\n\n`
        + `შემდეგ გაშვებაზე თავიდან ვცდი.`);
    }
  } catch (e) {
    console.error("contracts:", e.message);
  }

  return new Response(JSON.stringify({ done, failed }), {
    headers: { "content-type": "application/json" },
  });
};
