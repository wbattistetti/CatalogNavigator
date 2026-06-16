# Backup dizionari

Snapshot JSON esportati da `kb_dictionaries` (tokens + categories).

Ripristino manuale: copiare `tokens` e `categories` dalla voce desiderata nel backup e aggiornare la riga in Supabase, oppure usare l’editor dopo import.

Generare un nuovo backup:

```bash
npx tsx scripts/backup-dictionaries.ts
```
