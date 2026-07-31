CREATE TABLE `login_attempts` (
	`ip_hash` text PRIMARY KEY NOT NULL,
	`window_start` text NOT NULL,
	`count` integer DEFAULT 1 NOT NULL
);
