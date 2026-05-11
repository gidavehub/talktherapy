/**
 * Save base64 media into Firestore for a given user. Splits the document so
 * profile metadata stays small and queryable, while the heavy base64 blob
 * lives in a sub-doc that we only load when rendering the avatar.
 */

import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { firestore } from "./firebase";
import { fileToCompressedDataUrl, estimateBytes } from "./base64";

const MEDIA_COLLECTION = "media";

export type SavedMedia = {
  dataUrl: string;
  bytes: number;
  updatedAt: number;
};

export async function saveProfilePhoto(
  userId: string,
  file: File,
): Promise<SavedMedia> {
  const dataUrl = await fileToCompressedDataUrl(file, {
    maxDimension: 512,
    quality: 0.82,
    mime: "image/jpeg",
  });
  const bytes = estimateBytes(dataUrl);

  await setDoc(doc(firestore(), MEDIA_COLLECTION, `${userId}_avatar`), {
    ownerId: userId,
    kind: "avatar",
    dataUrl,
    bytes,
    updatedAt: serverTimestamp(),
  });

  return { dataUrl, bytes, updatedAt: Date.now() };
}

export async function loadProfilePhoto(userId: string): Promise<SavedMedia | null> {
  const snap = await getDoc(doc(firestore(), MEDIA_COLLECTION, `${userId}_avatar`));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    dataUrl: data.dataUrl,
    bytes: data.bytes,
    updatedAt: data.updatedAt?.toMillis?.() ?? Date.now(),
  };
}
