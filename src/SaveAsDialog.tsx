/**
 * The rename step for browsers without an OS Save As picker (see saveFile.ts).
 * Reuses the feedback dialog's shell and portals to `document.body` for the
 * same stacking-context reason FeedbackDialog.tsx documents.
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { downloadAs, withExtension, type SaveRequest } from './saveFile.ts'

export function SaveAsDialog({ request, onClose }: { request: SaveRequest; onClose: () => void }) {
  const [name, setName] = useState(request.suggestedName)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    downloadAs(request.blob, withExtension(name, request.extension))
    onClose()
  }

  return createPortal(
    <div
      className="feedback-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="save-as-title">
        <button type="button" className="feedback-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <h2 id="save-as-title">Save {request.description}</h2>
        <form onSubmit={save}>
          <div className="save-as-name">
            <input
              className="feedback-email"
              aria-label="File name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onFocus={(event) => event.target.select()}
              autoFocus
              required
            />
            <span className="save-as-ext">{request.extension}</span>
          </div>
          <p className="feedback-subtitle">
            This browser saves to your downloads folder. Chrome or Edge let you pick any folder.
          </p>
          <button type="submit" className="btn btn-block">
            Save
          </button>
        </form>
      </div>
    </div>,
    document.body,
  )
}
