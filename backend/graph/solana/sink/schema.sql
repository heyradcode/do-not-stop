-- Schema for the Solana CryptoPets substreams-sink-sql target.
--
-- Embedded into the spkg via the `sink.config.schema` block in
-- ../substreams/substreams.yaml and applied by `substreams-sink-sql setup`
-- into the schema named in the DSN (`?schema=solana`). The sink also creates
-- its own `cursors` table in that schema to track resumable progress.
--
-- Columns/types mirror `db_out` (../substreams/src/lib.rs) and the backend
-- `pet_roster` table (backend/prisma/schema.prisma). db_out emits every value
-- as a string; the sink casts it to the column type below.

create table if not exists pet (
    id          text    not null,
    owner       text    not null,
    name        text    not null,
    dna         text    not null,
    level       integer not null,
    rarity      integer not null,
    win_count   integer not null,
    loss_count  integer not null,
    ready_at    bigint  not null,
    updated_at  bigint  not null, -- source slot the account last changed at
    primary key (id)
);
