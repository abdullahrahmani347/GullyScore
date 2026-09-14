#!/usr/bin/env node
/**
 * GULLYSCORE v2 §15.2 — VAPID key generator (dev helper).
 * Prints a ready-to-paste .env block. Run: node scripts/generate-vapid-keys.mjs
 */
import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:hello@gullyscore.app`);
