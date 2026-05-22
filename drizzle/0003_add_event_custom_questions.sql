CREATE TABLE `event_custom_questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`question` text NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_custom_questions_event_id_idx` ON `event_custom_questions` (`event_id`);
