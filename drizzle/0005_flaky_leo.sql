CREATE TABLE `event_custom_answers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`response_id` integer NOT NULL,
	`question_id` integer NOT NULL,
	`answer` text NOT NULL,
	FOREIGN KEY (`response_id`) REFERENCES `event_responses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `event_custom_questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_custom_answers_response_id_idx` ON `event_custom_answers` (`response_id`);--> statement-breakpoint
CREATE INDEX `event_custom_answers_question_id_idx` ON `event_custom_answers` (`question_id`);