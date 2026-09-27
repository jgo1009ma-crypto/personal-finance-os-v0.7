# Moving local v0.6 state to cloud v0.7

Local v0.6 stores mutable application state in `data/user-data.json`.

Production v0.7 stores the same aggregate in Postgres table `app_state`, so migration can be lossless.

## Safe procedure

1. Stop the local app so `user-data.json` cannot change during export.
2. Make a copy of `data/user-data.json`.
3. Create the v0.7 Postgres tables.
4. Insert the JSON as the `state` value for `id='primary'`.
5. Set `version` to 7 or allow the application migration function to normalize it during first load.
6. Log in to the cloud deployment and compare Overview, cards, movements and recurring overrides before entering new data.

Example SQL structure:

```sql
insert into app_state(id, state, revision)
values ('primary', '<JSON HERE>'::jsonb, 1)
on conflict (id) do update
set state = excluded.state,
    revision = app_state.revision + 1,
    updated_at = now();
```

Do not paste financial JSON into public issue trackers, chat rooms, or source control.
