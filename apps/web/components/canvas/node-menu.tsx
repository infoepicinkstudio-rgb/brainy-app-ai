// Round 6 / ADR-0075 — this file is retired. The per-card 3-dot "⋮" menu it used to
// export (`NodeMenu`) was removed entirely from every node type's header (Istiyak:
// "Let's remove 3 dots from card header... No 3 dots only on hover GO TO link and X
// outside as is") — delete now lives solely in `NodeChrome`'s own hover-only "X", and
// the link card's one remaining menu action ("Edit link") moved into its own
// always-visible pencil icon in `link-node.tsx`'s body. Nothing imports this file any
// more; it's kept in place (rather than left as working-but-unreferenced code) only
// because this device-bridge sync has no file-delete operation — if/when a normal git
// workflow is available for this repo, delete this file outright instead of keeping
// this stub.
export {};
