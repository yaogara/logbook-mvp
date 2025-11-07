export const OfflineBanner = () => (
  !navigator.onLine ? (
    <div style={{ background: '#ffeb3b', padding: '6px', textAlign: 'center', fontSize: '0.9em' }}>
      ⚠️ You are offline — changes will sync automatically when back online.
    </div>
  ) : null
)

