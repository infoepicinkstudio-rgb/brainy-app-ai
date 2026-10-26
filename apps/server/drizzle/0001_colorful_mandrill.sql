PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_provider_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`api_key` text,
	`is_enabled` integer DEFAULT true NOT NULL,
	`execution_mode` text DEFAULT 'native' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_provider_credentials`("id", "provider", "api_key", "is_enabled", "created_at", "updated_at") SELECT "id", "provider", "api_key", "is_enabled", "created_at", "updated_at" FROM `provider_credentials`;--> statement-breakpoint
DROP TABLE `provider_credentials`;--> statement-breakpoint
ALTER TABLE `__new_provider_credentials` RENAME TO `provider_credentials`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `provider_credentials_provider_unique` ON `provider_credentials` (`provider`);