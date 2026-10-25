// Picks a document (camera, gallery or PDF) and uploads it to the API.
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { api, ApiError } from "./api";

export type Source = "camera" | "library" | "pdf";
export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  file?: Blob; // web only
}

const MAX_BYTES = 5 * 1024 * 1024;

export async function pickFile(source: Source): Promise<PickedFile | null> {
  if (source === "pdf") {
    const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/jpeg", "image/png"], copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return null;
    const a = r.assets[0];
    return { uri: a.uri, name: a.name, mimeType: a.mimeType ?? "application/pdf", size: a.size, file: a.file };
  }
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new ApiError(0, "PERMISSION", "Allow camera access in your phone settings to take a photo.");
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7, allowsEditing: false };
  const r = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  const mimeType = a.mimeType === "image/png" ? "image/png" : "image/jpeg";
  return { uri: a.uri, name: a.fileName ?? `photo.${mimeType === "image/png" ? "png" : "jpg"}`, mimeType, size: a.fileSize, file: a.file };
}

/** Uploads a document. The API reads the fields before the file, so they're appended first. */
export async function uploadDocument(file: PickedFile, meta: { documentTypeId: string; vehicleId?: string | null; expiryDate?: string | null }) {
  if (file.size && file.size > MAX_BYTES) throw new ApiError(400, "FILE_TOO_LARGE", "Files must be 5 MB or smaller. Take a new photo or choose a smaller file.");
  const form = new FormData();
  form.append("documentTypeId", meta.documentTypeId);
  if (meta.vehicleId) form.append("vehicleId", meta.vehicleId);
  if (meta.expiryDate) form.append("expiryDate", meta.expiryDate);
  if (Platform.OS === "web") {
    const blob = file.file ?? (await (await fetch(file.uri)).blob());
    form.append("file", blob, file.name);
  } else {
    // React Native's FormData accepts { uri, name, type } for files on the device.
    form.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  }
  return api<{ id: string; status: string }>("/driver/documents", { method: "POST", form });
}

