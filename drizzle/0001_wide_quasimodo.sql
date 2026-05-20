CREATE TABLE `participant_cards` (
	`response_id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`rarity` text NOT NULL,
	`attribute` text NOT NULL,
	`race` text NOT NULL,
	`flavor` text NOT NULL,
	`attack` integer NOT NULL,
	`defense` integer NOT NULL,
	`tier` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`response_id`) REFERENCES `event_responses`(`id`) ON UPDATE no action ON DELETE cascade
);
