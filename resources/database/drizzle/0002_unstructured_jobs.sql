--> statement-breakpoint
CREATE TABLE `unstructured_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`file_name` text NOT NULL,
	`file_size` integer NOT NULL,
	`file_type` text NOT NULL,
	`status` text NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
	`start_time` text NOT NULL,
	`end_time` text,
	`processing_params` text NOT NULL,
	`result` text,
	`error` text,
	`retry_count` integer DEFAULT 0,
	`estimated_cost` real,
	`actual_cost` real
);

--> statement-breakpoint
CREATE INDEX `idx_unstructured_jobs_source_id` ON `unstructured_jobs` (`source_id`);

--> statement-breakpoint
CREATE INDEX `idx_unstructured_jobs_status` ON `unstructured_jobs` (`status`);