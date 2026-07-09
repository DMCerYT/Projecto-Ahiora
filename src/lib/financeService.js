import { apiRequest } from './apiClient.js';

export async function getDashboardRecords(userId) {
  return apiRequest('/api/dashboard');
}

export async function listRecords(entityKey) {
  return apiRequest(`/api/records/${entityKey}`);
}

export async function saveRecord(entityKey, record, editingId) {
  const path = editingId ? `/api/records/${entityKey}/${editingId}` : `/api/records/${entityKey}`;
  const method = editingId ? 'PUT' : 'POST';
  return apiRequest(path, {
    method,
    body: JSON.stringify(record)
  });
}

export async function deleteRecord(entityKey, id) {
  return apiRequest(`/api/records/${entityKey}/${id}`, { method: 'DELETE' });
}

export async function listAttachments(entityKey) {
  return apiRequest(`/api/records/${entityKey}/attachments`);
}

export async function uploadAttachments(entityKey, recordId, files) {
  if (!files.length) return { data: [] };

  const encodedFiles = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      type: file.type,
      data: await fileToBase64(file)
    }))
  );

  return apiRequest(`/api/records/${entityKey}/${recordId}/attachments`, {
    method: 'POST',
    body: JSON.stringify({ files: encodedFiles })
  });
}

export async function deleteAttachment(id) {
  return apiRequest(`/api/attachments/${id}`, { method: 'DELETE' });
}

export async function listBillPayments() {
  return apiRequest('/api/bills/payments');
}

export async function recordBillPayment(billId, payment, files) {
  const encodedFiles = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      type: file.type,
      data: await fileToBase64(file)
    }))
  );

  return apiRequest(`/api/bills/${billId}/payments`, {
    method: 'POST',
    body: JSON.stringify({ ...payment, files: encodedFiles })
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
