--> statement-breakpoint
CREATE TABLE `unstructured_usage` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`pages_processed` integer DEFAULT 0,
	`documents_processed` integer DEFAULT 0,
	`fast_mode_pages` integer DEFAULT 0,
	`hi_res_pages` integer DEFAULT 0,
	`total_cost` real DEFAULT 0,
	`quota_used` integer DEFAULT 0,
	`quota_limit` integer DEFAULT 0,
	`error_count` integer DEFAULT 0,
	PRIMARY KEY (`user_id`, `date`)
);

--> statement-breakpoint
CREATE INDEX `idx_unstructured_usage_date` ON `unstructured_usage` (`date`);