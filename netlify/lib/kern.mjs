// Kernlogica van de link-in-bio-API. Los van Netlify, zodat het te testen is.
import { createHash, timingSafeEqual } from "node:crypto";

const MAX_LINKS = 50;
const MAX_BYTES = 60_000;

function gelijk(a, b) {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

function tekst(v, max) {
  return String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

export function schoonUrl(u) {
  u = tekst(u, 2000);
  if (!u) return "";
  if (/^(mailto:|tel:)/i.test(u)) return u;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try {
    const p = new URL(u);
    if (p.protocol !== "http:" && p.protocol !== "https:") return "";
    if (!p.hostname.includes(".")) return "";
    return p.href;
  } catch {
    return "";
  }
}

function schoonLogo(v) {
  v = tekst(v, 500);
  if (!v) return "";
  if (/^[\w.\-\/]+$/.test(v) && !v.includes("..")) return v; // bestand in de site-map
  const u = schoonUrl(v);
  return u.startsWith("https://") ? u : "";
}

export function valideer(d) {
  if (!d || typeof d !== "object" || !Array.isArray(d.links)) throw new Error("Ongeldige gegevens");
  if (d.links.length > MAX_LINKS) throw new Error(`Maximaal ${MAX_LINKS} links`);
  const p = d.profiel || {};
  return {
    profiel: { naam: tekst(p.naam, 120), bio: tekst(p.bio, 300), logo: schoonLogo(p.logo) },
    links: d.links
      .map((l) => ({
        titel: tekst(l?.titel, 120),
        ondertitel: tekst(l?.ondertitel, 200),
        url: schoonUrl(l?.url),
        uitgelicht: !!l?.uitgelicht,
        zichtbaar: l?.zichtbaar !== false,
      }))
      .filter((l) => l.titel || l.url),
    gewijzigd: new Date().toISOString(),
  };
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

export function maakHandler({ store, wachtwoord }) {
  async function geautoriseerd(req) {
    const h = req.headers.get("authorization") || "";
    const pw = h.startsWith("Bearer ") ? h.slice(7) : "";
    if (wachtwoord && pw && gelijk(pw, wachtwoord)) return true;
    await wacht(1000); // remt raden af
    return false;
  }

  return async (req) => {
    if (req.method === "GET") {
      const data = await store.get("links", { type: "json" });
      return json(data || null);
    }

    if (req.method === "POST" || req.method === "PUT") {
      if (!wachtwoord) return json({ fout: "Er is nog geen beheerwachtwoord ingesteld op Netlify." }, 503);
      if (!(await geautoriseerd(req))) return json({ fout: "Onjuist wachtwoord." }, 401);
      if (req.method === "POST") return json({ ok: true }); // alleen wachtwoord controleren

      const ruw = await req.text();
      if (ruw.length > MAX_BYTES) return json({ fout: "Te veel gegevens." }, 413);
      let data;
      try {
        data = valideer(JSON.parse(ruw));
      } catch (e) {
        return json({ fout: e.message || "Ongeldige gegevens" }, 400);
      }
      await store.setJSON("links", data);
      return json({ ok: true, data });
    }

    return json({ fout: "Methode niet toegestaan" }, 405);
  };
}
