/**
 * The feedback button in the top bar, next to the theme toggle.
 *
 * Fully self-contained — it owns its own open state and submit logic, so
 * nothing above it needs a prop for this. Delivery has no backend to lean on
 * (this is a static Vite app), so it POSTs to a Formspree endpoint, which
 * relays the message to email without a server of our own.
 */

import { useEffect, useState } from 'react'

const FORMSPREE_ENDPOINT = 'https://formspree.io/f/mvkpwogp'

type SendStatus = 'idle' | 'sending' | 'sent' | 'error'

/** A speech bubble. One path, following the lightbulb icon's inline-SVG convention. */
function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M4 5.5h16a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1h-9l-4 3.5V16H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function FeedbackDialog() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<SendStatus>('idle')

  const close = () => {
    setOpen(false)
    setStatus('idle')
  }

  // Escape closes the dialog — the same convention ExamplesMenu uses for its
  // dropdown. Only listens while open, so it costs nothing the rest of the time.
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus('sending')
    try {
      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, message }),
      })
      if (!response.ok) throw new Error('Formspree request failed')
      setStatus('sent')
      setEmail('')
      setMessage('')
    } catch {
      setStatus('error')
    }
  }

  return (
    <>
      <button
        type="button"
        className="theme-toggle"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Send feedback or report a bug"
        title="Send feedback or report a bug"
        onClick={() => setOpen(true)}
      >
        <MessageIcon />
      </button>

      {open && (
        <div
          className="feedback-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <div
            className="feedback-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
          >
            <button type="button" className="feedback-close" aria-label="Close" onClick={close}>
              ×
            </button>
            <h2 id="feedback-title">Got feedback?</h2>
            <form onSubmit={handleSubmit}>
              <input
                type="email"
                className="feedback-email"
                placeholder="Your email"
                aria-label="Your email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <p className="feedback-subtitle">If I keep building this, I'll keep you in the loop.</p>
              <textarea
                className="feedback-textarea"
                placeholder="Drop me a message here or report bugs/ideas here"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                required
                rows={4}
              />
              <button type="submit" className="feedback-submit" disabled={status === 'sending'}>
                {status === 'sending' ? 'Sending…' : 'Send'}
              </button>
              {status === 'sent' && <p className="feedback-status">Sent — thanks!</p>}
              {status === 'error' && (
                <p className="feedback-status error">Something went wrong — try again.</p>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  )
}
