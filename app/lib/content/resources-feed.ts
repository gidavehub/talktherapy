/**
 * The resource centre's published articles, read in the browser — for the
 * dashboard's suggestion. Kept apart from the article editor's code
 * (./resources-client) so a patient's home screen carries none of it.
 */

import { collection, getDocs, query, where } from "firebase/firestore";
import { firebaseConfigured, firestore } from "../firebase";
import { RESOURCE_COLLECTIONS, resourceCatalogue, type PublicResource } from "./resources";

/**
 * The articles as the public site shows them. Read the way the server reads
 * them — published and withdrawn, merged with the starter set — and, if
 * either half cannot be read, the starter articles as they ship. Never throws.
 */
export async function loadPublicResources(): Promise<PublicResource[]> {
  if (!firebaseConfigured()) return resourceCatalogue(null);
  try {
    const withStatus = (status: "published" | "withdrawn") =>
      getDocs(query(collection(firestore(), RESOURCE_COLLECTIONS.published), where("status", "==", status)));
    const [published, withdrawn] = await Promise.all([withStatus("published"), withStatus("withdrawn")]);
    const stored = new Map<string, unknown>();
    for (const d of [...published.docs, ...withdrawn.docs]) stored.set(d.id, d.data());
    return resourceCatalogue(stored);
  } catch {
    return resourceCatalogue(null);
  }
}
