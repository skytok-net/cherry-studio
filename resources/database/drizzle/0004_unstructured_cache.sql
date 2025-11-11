--> statement-breakpoint
CREATE TABLE `unstructured_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`result` text NOT NULL,
	`file_hash` text NOT NULL,
	`processing_params` text NOT NULL,
	`created_at` text NOT NULL,
	`last_accessed_at` text NOT NULL,
	`access_count` integer DEFAULT 1,
	`size_bytes` integer NOT NULL
);

--> statement-breakpoint
CREATE INDEX `idx_unstructured_cache_file_hash` ON `unstructured_cache` (`file_hash`);