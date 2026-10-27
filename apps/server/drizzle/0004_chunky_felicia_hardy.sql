CREATE TABLE `chat_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`title` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `session_id` text REFERENCES chat_sessions(id);--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `attachments` text;