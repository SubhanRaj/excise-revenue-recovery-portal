CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_type` text NOT NULL,
	`actor_role` text,
	`actor_email` text,
	`district_name` text,
	`metadata` text,
	`created_at` text NOT NULL
);
