CREATE TABLE `districts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`district_name` text NOT NULL,
	`lock_status` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `districts_district_name_unique` ON `districts` (`district_name`);--> statement-breakpoint
CREATE TABLE `magic_link_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `magic_link_tokens_token_unique` ON `magic_link_tokens` (`token`);--> statement-breakpoint
CREATE TABLE `pac_data` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`district_id` integer NOT NULL,
	`financial_year` text NOT NULL,
	`gross_arrears` real NOT NULL,
	`rc_count` integer NOT NULL,
	`rc_amount` real NOT NULL,
	`recovered_amount` real NOT NULL,
	`stay_count` integer NOT NULL,
	`stay_amount` real NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`district_id`) REFERENCES `districts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `district_year_unique` ON `pac_data` (`district_id`,`financial_year`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role` text DEFAULT 'deo' NOT NULL,
	`email` text,
	`cug_hash` text,
	`district_id` integer,
	`locked_at` text,
	`submitted_by_name` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`district_id`) REFERENCES `districts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_cug_hash_unique` ON `users` (`cug_hash`);