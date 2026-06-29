import type { AnalyzeResponse, BusinessProfile, InspectBatchResponse, InspectResponse, UploadRole } from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export async function inspectFile(file: File, fileType?: string): Promise<InspectResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (fileType) formData.append("file_type", fileType);

  const response = await fetch(`${API_BASE_URL}/inspect`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.detail || "No se pudo inspeccionar el archivo.");
  }

  return response.json();
}

export async function analyzeFile(file: File, mapping?: Record<string, string | null>, fileType = "combined", businessProfile?: BusinessProfile): Promise<AnalyzeResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("file_type", fileType);
  if (mapping) {
    formData.append("mapping_json", JSON.stringify(mapping));
  }
  if (businessProfile) {
    formData.append("business_profile_json", JSON.stringify(businessProfile));
  }

  const response = await fetch(`${API_BASE_URL}/analyze`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.detail || "No se pudo analizar el archivo.");
  }

  return response.json();
}

const roleToFormKey: Record<UploadRole, string> = {
  combined: "combined_file",
  inventory: "inventory_file",
  sales: "sales_file",
};

const roleToMappingKey: Record<UploadRole, string> = {
  combined: "combined_mapping_json",
  inventory: "inventory_mapping_json",
  sales: "sales_mapping_json",
};

export type BatchUploadPayload = Partial<Record<UploadRole, File>>;
export type BatchMappingPayload = Partial<Record<UploadRole, Record<string, string | null>>>;

export async function inspectBatchFiles(files: BatchUploadPayload): Promise<InspectBatchResponse> {
  const formData = new FormData();
  (Object.keys(files) as UploadRole[]).forEach((role) => {
    const file = files[role];
    if (file) formData.append(roleToFormKey[role], file);
  });

  const response = await fetch(`${API_BASE_URL}/inspect-batch`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.detail || "No se pudieron inspeccionar los archivos.");
  }

  return response.json();
}

export async function analyzeBatchFiles(files: BatchUploadPayload, mappings?: BatchMappingPayload, businessProfile?: BusinessProfile): Promise<AnalyzeResponse> {
  const formData = new FormData();
  (Object.keys(files) as UploadRole[]).forEach((role) => {
    const file = files[role];
    if (file) formData.append(roleToFormKey[role], file);
    const mapping = mappings?.[role];
    if (mapping) formData.append(roleToMappingKey[role], JSON.stringify(mapping));
  });

  if (businessProfile) {
    formData.append("business_profile_json", JSON.stringify(businessProfile));
  }

  const response = await fetch(`${API_BASE_URL}/analyze-batch`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.detail || "No se pudo generar el análisis multiarchivo.");
  }

  return response.json();
}
