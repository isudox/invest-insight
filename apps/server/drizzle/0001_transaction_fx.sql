ALTER TABLE `transactions` ADD `fx_rate` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `fx_base` text;--> statement-breakpoint
-- 已有交易：记录当时的基准币种；本币交易汇率为 1，外币交易的历史汇率未知（留空，计算时按当前汇率估算并在体检中提示）
UPDATE `transactions` SET `fx_base` = COALESCE((SELECT `value` FROM `settings` WHERE `key` = 'base_currency'), 'CNY');--> statement-breakpoint
UPDATE `transactions` SET `fx_rate` = '1' WHERE (SELECT `currency` FROM `assets` WHERE `assets`.`id` = `transactions`.`asset_id`) = `transactions`.`fx_base`;
