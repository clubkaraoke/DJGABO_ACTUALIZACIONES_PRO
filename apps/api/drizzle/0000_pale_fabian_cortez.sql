CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`storage_key` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`type` text NOT NULL,
	`metadata` text,
	`provider_file_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_provider_provider_file_id_unique` ON `assets` (`provider`,`provider_file_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `assets_provider_storage_key_unique` ON `assets` (`provider`,`storage_key`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`description` text,
	`cover_url` text,
	`storage_path` text NOT NULL,
	`published_at` integer,
	`updated_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collections_slug_unique` ON `collections` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `collections_year_month_idx` ON `collections` (`year`,`month`);--> statement-breakpoint
CREATE TABLE `device_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_id` text NOT NULL,
	`name` text,
	`last_seen_at` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_user_device_idx` ON `device_sessions` (`user_id`,`device_id`);--> statement-breakpoint
CREATE TABLE `download_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`karaoke_id` text,
	`collection_id` text,
	`asset_id` text,
	`type` text NOT NULL,
	`ip` text,
	`device_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`karaoke_id`) REFERENCES `karaokes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `download_logs_user_idx` ON `download_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `download_logs_created_at_idx` ON `download_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `karaokes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`code` text NOT NULL,
	`identity_key` text NOT NULL,
	`genre` text,
	`year` integer,
	`format` text,
	`size` integer,
	`cover_url` text,
	`collection_id` text NOT NULL,
	`master_asset_id` text,
	`preview_asset_id` text,
	`published_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`master_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`preview_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `karaokes_master_asset_id_unique` ON `karaokes` (`master_asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `karaokes_preview_asset_id_unique` ON `karaokes` (`preview_asset_id`);--> statement-breakpoint
CREATE INDEX `karaokes_collection_idx` ON `karaokes` (`collection_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `karaokes_identity_key_unique` ON `karaokes` (`identity_key`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`active` integer DEFAULT true NOT NULL,
	`max_devices` integer DEFAULT 2 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plans_slug_unique` ON `plans` (`slug`);--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refresh_tokens_token_hash_unique` ON `refresh_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`dry_run` integer NOT NULL,
	`files_detected` integer NOT NULL,
	`new_count` integer NOT NULL,
	`updated_count` integer NOT NULL,
	`error_count` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_collection_access` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`granted_at` integer NOT NULL,
	`expires_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_user_collection_idx` ON `user_collection_access` (`user_id`,`collection_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`avatar_url` text,
	`role` text DEFAULT 'MEMBER' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`plan_id` text,
	`subscription_start` integer,
	`subscription_end` integer,
	`max_devices` integer DEFAULT 2 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_status_idx` ON `users` (`status`);