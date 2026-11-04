/**
 * Hands a text file to the browser. The only DOM touch in the profile path, so
 * the rest of it stays framework-free and testable.
 */
export function downloadText(fileName: string, text: string, type = 'application/json'): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.click();
  URL.revokeObjectURL(url);
}

/** `ak820-profile-2026-11-04.json`, from the day the file was written. */
export function profileFileName(at: Date): string {
  const day = at.toISOString().slice(0, 10);
  return `ak820-profile-${day}.json`;
}
