import type { PredictionCaptureSession } from "./predictionCapture";
import { isPredictionCaptureSession } from "./predictionCapture";

const DATABASE_NAME = "windfall-prediction-capture";
const DATABASE_VERSION = 1;
const STORE_NAME = "workspace";
const ACTIVE_SESSION_KEY = "active-session";

const requireIndexedDb = (): IDBFactory => {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is unavailable in this browser context. Prediction Capture was not persisted.");
  }
  return indexedDB;
};

const openDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = requireIndexedDb().open(DATABASE_NAME, DATABASE_VERSION);
  request.onerror = () => reject(request.error ?? new Error("Prediction Capture storage could not be opened."));
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
  };
  request.onsuccess = () => resolve(request.result);
});

const withStore = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    request.onerror = () => reject(request.error ?? new Error("Prediction Capture storage request failed."));
    request.onsuccess = () => resolve(request.result);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Prediction Capture storage transaction failed."));
    };
  });
};

export const loadPredictionCaptureSession = async (): Promise<PredictionCaptureSession | null> => {
  const stored = await withStore<unknown>("readonly", (store) => store.get(ACTIVE_SESSION_KEY));
  return isPredictionCaptureSession(stored) ? stored : null;
};

export const savePredictionCaptureSession = async (session: PredictionCaptureSession): Promise<void> => {
  await withStore<IDBValidKey>("readwrite", (store) => store.put(session, ACTIVE_SESSION_KEY));
};

export const clearPredictionCaptureSession = async (): Promise<void> => {
  await withStore<undefined>("readwrite", (store) => store.delete(ACTIVE_SESSION_KEY));
};
