// The icon sprite: <svg><use href="#i-…"/></svg> anywhere on the page.
export default function Icons() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <symbol id="i-play" viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></symbol>
      <symbol id="i-pause" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></symbol>
      <symbol id="i-prev" viewBox="0 0 24 24"><rect x="5" y="5" width="2.4" height="14" rx="1"/><path d="M19 6.2v11.6a1 1 0 0 1-1.55.83L9.2 13.2a1.4 1.4 0 0 1 0-2.4l8.25-5.43A1 1 0 0 1 19 6.2Z"/></symbol>
      <symbol id="i-next" viewBox="0 0 24 24"><rect x="16.6" y="5" width="2.4" height="14" rx="1"/><path d="M5 6.2v11.6a1 1 0 0 0 1.55.83l8.25-5.43a1.4 1.4 0 0 0 0-2.4L6.55 5.37A1 1 0 0 0 5 6.2Z"/></symbol>
      <symbol id="i-chevron" viewBox="0 0 24 24"><path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></symbol>
      <symbol id="i-loop" viewBox="0 0 24 24"><path d="m17 3.5 3 3-3 3M20 6.5H9a5 5 0 0 0-5 5M7 20.5l-3-3 3-3M4 17.5h11a5 5 0 0 0 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></symbol>
      <symbol id="i-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/></symbol>
      <symbol id="i-video" viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2"/><path d="m16 10.5 5-3v9l-5-3Z"/></symbol>
      <symbol id="i-volume" viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/></symbol>
      <symbol id="i-mute" viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path d="m16 9.5 5 5m0-5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/></symbol>
      <symbol id="i-note" viewBox="0 0 24 24"><path d="M9 17.5V6l10-2v11.5" stroke="currentColor" strokeWidth="2" fill="none"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/></symbol>
      <symbol id="i-wave" viewBox="0 0 24 24"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10.5v3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none"/></symbol>
      <symbol id="i-both" viewBox="0 0 24 24"><path d="M6 15.5V5l8-1.6v10" stroke="currentColor" strokeWidth="2" fill="none"/><circle cx="4" cy="15.5" r="2.2"/><circle cx="12" cy="13.4" r="2.2"/><path d="M17 12v6M20.5 9.5v11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/></symbol>
    </svg>
  );
}
