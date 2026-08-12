// Passthrough stubs — real E2E encryption can be layered in later
export async function encryptMessage(plaintext: string): Promise<string> {
  return plaintext;
}

export async function decryptMessage(ciphertext: string): Promise<string> {
  return ciphertext;
}

export async function buildBlindIndex(text: string): Promise<string> {
  return text.toLowerCase().trim();
}

export async function hashQuery(query: string): Promise<string[]> {
  return [query.toLowerCase().trim()];
}
