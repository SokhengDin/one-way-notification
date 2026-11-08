-- Brand asset bytes move out of Postgres into file-vault (the file storage
-- service). A row now points at one immutable file-vault version instead of
-- holding the bytes.
--
--   storage_file_id     file-vault file id
--   storage_version_id  the exact version uploaded; reading it back by
--                       version means the bytes behind an asset URL never change
--
-- Rows uploaded before this migration keep their bytes in `data` and are
-- still served from it. `bun run assets:move-to-file-vault` moves them over.
-- Every row has exactly one of the two.
ALTER TABLE brand_assets
    ADD COLUMN storage_file_id    UUID,
    ADD COLUMN storage_version_id UUID,
    ALTER COLUMN data DROP NOT NULL,
    DROP CONSTRAINT chk_brand_assets_byte_size;

ALTER TABLE brand_assets
    ADD CONSTRAINT chk_brand_assets_byte_size
        CHECK (byte_size > 0 AND (data IS NULL OR byte_size = octet_length(data))),
    ADD CONSTRAINT chk_brand_assets_storage_pair
        CHECK ((storage_file_id IS NULL) = (storage_version_id IS NULL)),
    ADD CONSTRAINT chk_brand_assets_one_location
        CHECK ((data IS NULL) <> (storage_file_id IS NULL));
