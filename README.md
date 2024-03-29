# How it Works
- Created a webhook that checks for changes in the subscriptions table
- If a change is detected (e.g. user updates their subscription), it calls an API to the discord bot which then - - updates the new Discord role to the user
Works only if the user connected their Discord account to their Pika account

https://github.com/tinloof/pika/assets/155480239/407741e2-88b9-4eb0-ad22-35ce85235861


# Set Up
Add these to your `.env.local`
```
DISCORD_BOT_TOKEN={see next section}
DISCORD_SERVER_ID={right click on server in discord --> click "Copy Server ID"}
DISCORD_AUTH_SECRET={go to web hooks section in supabase --> click 3 dots --> click "Edit hook" --> scroll to the HTTPS headers section to find the value associated with "Authentication"} 
DISCORD_BASIC_ROLE_NAME=Basic
DISCORD_STANDARD_ROLE_NAME=Standard
DISCORD_UNLIMITED_ROLE_NAME=Unlimited
DISCORD_PRO_ROLE_NAME=Pro
```

## How to get the Discord Bot Token and set Bot Permissions
1. Go to the Discord Developer Portal
2. Click on "New Application" button
3. Go to "Bot" section and set Bot's name and icon 
4. Under "TOKEN" click "Copy" or "Reset" to get the bot token. This is the `DISCORD_BOT_TOKEN` you will use.
5. Go to "OAuth2" section. Under "SCOPES", select "bot."
6. In "BOT PERMISSIONS" section, select the permissions your bot needs to operate as intended. It is best practice to give the bot the least privileges. I only checked 1) "Manage Roles" and 2) "Read Messages/View Channels."
7. Copy the Generated URL at the bottom and past it into your web browser. 
8. Select the server you want to invite the bot to and click "Authorize."
9. Ensure that the bot has the necessary permissions in the Discover server by right clicking the server --> "Server Settings" --> "Roles" --> select the bot's role --> "Permissions" --> Make sure that 1) "Manage Roles" is checked off and 2) [This is outside the "Permissions" section, now in the overall "Roles" section] The bot's role is positioned higher than the other roles (drag and drop) 

# To Do
1. The Pika team will probably change the role names, which would just be editing the last 4 variables in the `.env.local` file. Check with the Pika team before deploying to Prod.
10. Update the web hook in supabase to the correct URL

# Testing 
1. Created a new Next.js test project
2. Put the API endpoint in `app/api/discord-bot`
11. Deployed to Vercel
12. Changed the web hook to use the URL of the new test project
13. Test with Postman (see next section)
14. Test with Supabase updates (see next section)
15. Once working, copy it back to the Pika codebase

## Test with Postman
1. Run `npm run dev`
2. Open Postman. Create a `POST` request to `localhost:3000/api/discord-bot` assuming that `npm run dev` started `localhost:3000`
3. Under `Headers`, add "Authentication" under `Key` and add "Bearer {DISCORD_AUTH_SECRET}" under `Value`. Alternatively, you can temporarily comment out the authentication check.
4. You can use the template below for the `Body`. Change the `user_id` to the user ID in the supabase table for the user you want to test with, and play around with the values of `stripe_lookup_key` for testing.
5. To verify it is working correctly, go to your Discord server and click on the test user to see the roles change. You should also get a success response message in Postman. 
```
{
  "type": "UPDATE",
  "table": "subscriptions",
  "record": {
    "user_id": "bea29bd1-8e45-471e-a661-b0757a4cdb97",
    "created_at": "2023-12-27T08:13:45.234106+00:00",
    "nr_credits": 0,
    "free_credits": 30,
    "stripe_lookup_key": "unlimited",
    "discord_nr_credits": 0,
    "stripe_customer_id": null,
    "monthly_cycle_count": 0,
    "subscription_credits": 0,
    "monthly_cycle_end_date": null,
    "monthly_cycle_start_date": null,
    "discord_stripe_lookup_key": null,
    "discord_stripe_customer_id": null,
    "discord_monthly_cycle_count": 0,
    "discord_subscription_credits": 0,
    "scheduled_subscription_status": null,
    "discord_monthly_cycle_end_date": null,
    "stripe_subscription_expiry_date": null,
    "discord_monthly_cycle_start_date": null,
    "discord_scheduled_subscription_status": null,
    "discord_stripe_subscription_expiry_date": null
  },
  "schema": "public",
  "old_record": {
    "user_id": "bea29bd1-8e45-471e-a661-b0757a4cdb97",
    "created_at": "2023-12-27T08:13:45.234106+00:00",
    "nr_credits": 0,
    "free_credits": 30,
    "stripe_lookup_key": null,
    "discord_nr_credits": 0,
    "stripe_customer_id": null,
    "monthly_cycle_count": 0,
    "subscription_credits": 0,
    "monthly_cycle_end_date": null,
    "monthly_cycle_start_date": null,
    "discord_stripe_lookup_key": null,
    "discord_stripe_customer_id": null,
    "discord_monthly_cycle_count": 0,
    "discord_subscription_credits": 0,
    "scheduled_subscription_status": null,
    "discord_monthly_cycle_end_date": null,
    "stripe_subscription_expiry_date": null,
    "discord_monthly_cycle_start_date": null,
    "discord_scheduled_subscription_status": null,
    "discord_stripe_subscription_expiry_date": null
  }
}
```

## Test with Supabase Updates
1. Deploy to Vercel
2. Update the web hook URL in supabase
3. Go to `subscriptions` table in supabase, filter by the user ID for the test user, directly modify the `stripe_lookup_key`
4. To verify it is working correctly, go to your Discord server and click on the test user to see the roles change. You should also get a success response message in Postman. 

Thank you, Mohammed!!