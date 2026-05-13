CREATE TABLE `event_option_responses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`response_id` integer NOT NULL,
	`option_id` integer NOT NULL,
	`answer` text NOT NULL,
	FOREIGN KEY (`response_id`) REFERENCES `event_responses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`option_id`) REFERENCES `event_options`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_option_responses_response_id_idx` ON `event_option_responses` (`response_id`);--> statement-breakpoint
CREATE INDEX `event_option_responses_option_id_idx` ON `event_option_responses` (`option_id`);--> statement-breakpoint
CREATE TABLE `event_options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`label` text NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_options_event_id_idx` ON `event_options` (`event_id`);--> statement-breakpoint
CREATE TABLE `event_responses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`custom_answer` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_responses_event_id_idx` ON `event_responses` (`event_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`custom_question` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `slack_webhooks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
