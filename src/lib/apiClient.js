export async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "internal");
    error.code = payload.code || "internal";
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function encodeFiles(files) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({ name: file.name, type: file.type, data: reader.result });
          reader.onerror = () => reject(new Error("invalidFile"));
          reader.readAsDataURL(file);
        }),
    ),
  );
}
