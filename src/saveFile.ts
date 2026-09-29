/**
 * Every export goes through here, so "the user picks where and under what name"
 * is one decision rather than one per export button.
 *
 * Chromium browsers expose the File System Access API's `showSaveFilePicker`, a
 * real OS Save As dialog: folder and filename. Firefox and Safari don't, and a
 * web page has no other way to choose a folder — there, the caller shows its
 * own rename step and the file goes wherever the browser saves downloads.
 *
 * Chrome shows "this site can see the edits you make" after the picker grants
 * write access. That indicator comes with the API and can't be suppressed; it
 * was tried without the picker (stage 18) and the folder choice was preferred.
 */

export type SaveRequest = {
  blob: Blob
  /** Without extension; the extension is appended if the user drops it. */
  suggestedName: string
  /** Including the dot, e.g. `.pdb`. */
  extension: string
  /** Shown in the picker's file-type dropdown, e.g. "PDB structure". */
  description: string
}

// Not in TypeScript's DOM lib yet — declared to the extent used here.
type WritableHandle = {
  createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>
}
type SaveFilePicker = (options: {
  suggestedName: string
  types: { description: string; accept: Record<string, string[]> }[]
}) => Promise<WritableHandle>

function savePicker(): SaveFilePicker | undefined {
  return (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker
}

export function hasSavePicker(): boolean {
  return typeof savePicker() === 'function'
}

export function withExtension(name: string, extension: string): string {
  const trimmed = name.trim() || 'untitled'
  return trimmed.toLowerCase().endsWith(extension.toLowerCase()) ? trimmed : trimmed + extension
}

/**
 * Opens the OS Save As dialog. Must be called straight from a click handler —
 * the browser rejects the picker without a fresh user gesture. Resolves quietly
 * if the user cancels.
 */
export async function saveWithPicker(request: SaveRequest): Promise<void> {
  const picker = savePicker()
  if (!picker) throw new Error('showSaveFilePicker is not supported in this browser')
  try {
    const handle = await picker({
      suggestedName: withExtension(request.suggestedName, request.extension),
      types: [
        {
          description: request.description,
          accept: { [request.blob.type || 'application/octet-stream']: [request.extension] },
        },
      ],
    })
    const writable = await handle.createWritable()
    await writable.write(request.blob)
    await writable.close()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    throw error
  }
}

/** The fallback: a normal download, under the name the user typed. */
export function downloadAs(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
