// Ticket document id derived from the ticket number, so the same ticket imported
// twice (even by two orienteurs) always lands on the same Firestore document.
// Shared by the browser (storage.ts) and the server (api/).
export function ticketDocId(ticketNumber: string): string {
  return `tkt-${ticketNumber.trim().replace(/[^A-Za-z0-9_-]/g, '_')}`;
}
