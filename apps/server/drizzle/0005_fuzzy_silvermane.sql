CREATE TABLE `youtube_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
