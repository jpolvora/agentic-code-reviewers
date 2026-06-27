/** Splits a file list into N roughly equal chunks for parallel agent runs. */
export function chunkFilesByCount(files: string[], chunkCount: number): string[][] {
  if (files.length === 0 || chunkCount <= 1) {
    return [files];
  }

  const count = Math.min(chunkCount, files.length);
  const chunks: string[][] = Array.from({ length: count }, () => []);
  for (let i = 0; i < files.length; i++) {
    chunks[i % count]!.push(files[i]!);
  }
  return chunks.filter((c) => c.length > 0);
}
