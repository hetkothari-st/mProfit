<!-- END MODULES -->

## Roles and profiles

### Signed-out visitor <!-- R-VISITOR -->
Cannot open any page in this area; sent to sign in.

### Free user <!-- R-FREE -->
Full use of Import, Email ingestion, Gmail connection and inbox scans, and CAS. **Documents** shows a lock card.

### Plus subscriber <!-- R-PLUS -->
Everything Free has, plus **Documents**.

### Family subscriber <!-- R-FAMILY -->
Same as Plus in this area.

### Pro/Advisor subscriber <!-- R-PRO -->
Same as Plus in this area.

### Administrator <!-- R-ADMIN -->
No admin-only powers here; access follows the admin's own plan.

### Family owner <!-- R-FAMOWNER -->
Family view does not change these pages: imports, events, senders, Gmail and documents are always your own.

### Family contributor <!-- R-FAMCONTRIB -->
Same as family owner here.

### Family viewer <!-- R-FAMVIEWER -->
Same as family owner here.

### Managing a family member's account <!-- R-MANAGER -->
Imports, events, senders and Documents act on the managed person's data under the manager's plan. Gmail connection, inbox scans and the scan shortcut are refused with "Switch back to your own account to do this."

### Professional acting for a client <!-- R-PROF -->
Not applicable here — professionals upload client files from the CA workspace.

### AI chatbot connection <!-- R-AICONN -->
No access to these features.

### Succession nominee <!-- R-NOMINEE -->
No access.

## Glossary
| Term | Meaning |
|---|---|
<!-- BEGIN GLOSSARY -->
| Import job | One uploaded or emailed file being processed; shown as a row in **Import history** with a status. |
| Partial | Import status meaning some rows were added and some failed (stored as COMPLETED_WITH_ERRORS). |
| Needs password | Import status: the file is encrypted and none of the automatic passwords opened it. |
| Parser | The reader that recognises one document format (for example Zerodha contract note, CAMS/KFintech CAS) and extracts its transactions; its name and version are stored on each imported row. |
| Contract note | The broker's legally required record of the trades you made on a day. |
| Source hash | A fingerprint stored on each imported row so the same row is never added twice. |
| Ingestion failure | A record kept when a file, row or email could not be processed, with its raw data, for review or automatic retry (the "dead-letter queue"). |
| Monitored sender | An email address (or `@domain`) whose emails the app is allowed to read for financial events. |
| Event | A single financial fact read from an email (a buy, a UPI credit, a premium…) waiting for review or already written to your books. |
| Auto-commit | A monitored-sender setting: its confident events are written without manual review. |
| Approve & commit | Accept an event so it is written as a transaction or cash-flow entry. |
| Inbox scan | A one-off search of a date range of your Gmail for financial attachments to approve and import. |
| Inbox imports | The Reports tab where documents found by an inbox scan are approved or rejected. |
| Needs attention | The Documents card holding files that are still being read or need a password, review or assignment. |
| Auto-created folder | A Documents person folder the app created from a name found on a document. |
<!-- END GLOSSARY -->
