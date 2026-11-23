import { getStore } from "@netlify/blobs";
import { maakHandler } from "../lib/kern.mjs";

export default async (req) => {
  const store = getStore({ name: "linkinbio", consistency: "strong" });
  const handler = maakHandler({ store, wachtwoord: process.env.BEHEER_WACHTWOORD });
  return handler(req);
};

export const config = { path: "/api/links" };
