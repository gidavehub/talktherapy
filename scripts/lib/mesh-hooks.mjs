/**
 * Module hooks for the mesh simulation: app/lib/groupCall.ts runs unmodified,
 * with `firebase/firestore` and the app's Firebase setup swapped for the fakes
 * in this folder, and the app's extensionless relative imports resolved to
 * their .ts files.
 */

const here = (file) => new URL(file, import.meta.url).href;
const FAKE_FIREBASE = `data:text/javascript,${encodeURIComponent(
  "export const firestore = () => ({ path: '' }); export const firebaseConfigured = () => true;",
)}`;
const FAKE_CALL = `data:text/javascript,${encodeURIComponent("export const hasRelay = () => false;")}`;

export async function resolve(specifier, context, next) {
  if (specifier === "firebase/firestore") return { url: here("./fake-firestore.mjs"), shortCircuit: true };
  const fromApp = context.parentURL?.includes("/app/lib/");
  if (fromApp && specifier === "./firebase") return { url: FAKE_FIREBASE, shortCircuit: true };
  if (fromApp && specifier === "./call") return { url: FAKE_CALL, shortCircuit: true };
  if (fromApp && specifier.startsWith(".") && !/\.[mc]?[jt]sx?$/.test(specifier)) {
    return next(`${specifier}.ts`, context);
  }
  return next(specifier, context);
}
