# ADR 019: Public composition contracts and view-local transport

Status: accepted for alpha.18.

## Context

Applications need several views of one musical document and configurable presentation without copying the editor or inventing new musical state. Previously the API and visible playback controls could disagree about position, instrument and practice tempo. Presentation changes also need to preserve the existing document/history contract.

## Decision

- `RiffScoreSession` composes the existing ScoreProvider. It owns document, selection, recognition and history; each RiffScore owns presentation, interaction settings and transport. This is a React ownership boundary, not a second engine or a general service registry.
- Measure windows retain source identities and indices. Rendering-only clefs flow through the same layout used by engraving and hit testing. Source queries/exports remain complete.
- One PlaybackProvider per view connects API, toolbar and custom controls to the same usePlayback. Synchronous refs serve immediate API queries; React state serves reactive rendering. Cancellation aborts only that view's request. Audio remains a shared engine, so simultaneous independent playback is not promised.
- `renderOverlay` resolves musical identities through existing layout coordinates. Unresolvable anchors return null. Hosts declare scroll bounds explicitly; overlays never secretly mutate layout.
- MusicGlyphProvider is a generic async adapter/fallback boundary. Adapters preserve canonical Bravura metrics; core does not fit arbitrary fonts. Loading races and failure retain deterministic Bravura output.
- `riffscore/theory` is a separate build entry with no React/CSS/audio initialization. No internal-path imports are required for its queries.
- Permission guards compare musical entities. A synchronous guarded UI action buffers notifications and rolls back score/history on refusal or exception; the UI facade restores selection. This does not change legacy transaction batching into a general atomic or asynchronous transaction API.

## Consequences and limits

Core has one musical authority and one layout calculation per view. Customization remains plain React composition and partial configuration. Transport positions use source measure indices and 64 quants per whole note. A view window restricts rendering, not editing authorization or navigation. Generic composition does not coordinate focus, MIDI ownership or playback across views. Existing low-level context exports remain compatibility surfaces, not immutable/network-safe document handles. No collaboration protocol, sidecar history participant or multi-voice schema is introduced.

Contract coverage includes shared undo/identities, view-local read-only behavior, retained config handles, overlay deletion/page coordinates, stale/failed glyph loads, API/UI transport agreement, guarded rollback and clean package consumers. Real-browser coverage checks keyboard focus, touch, contrast, bounds, and print pagination.
