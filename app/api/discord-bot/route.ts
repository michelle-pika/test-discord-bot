import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Client, GatewayIntentBits, Partials } from 'discord.js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const planToRoleMap = {
    basic: "Basic",
    standard: "Standard",
    unlimited: "Unlimited",
    ultimate: "Unlimited",
    discord: "Pro", 
  };

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});

discordClient.once('ready', () => {
    if (discordClient.user) {
      console.log(`Logged in as ${discordClient.user.tag}!`);
    } else {
      console.log('The bot is ready, but the user is null.');
    }
});

async function changeDiscordRoles(userId: string, oldLookupKey: string, newLookupKey: string) {

    const { data: userData, error } = await supabase
        .from('users')
        .select('raw_user_meta_data')
        .eq('id', userId)
        .single();

    if (error) {
        console.error('Error fetching user from Supabase:', error);
        return false;
    }

    const discordId = userData.raw_user_meta_data.full_name; 
    const serverId = process.env.DISCORD_SERVER_ID;

    if (!discordId || !serverId) {
        console.error('Discord ID or Server ID is undefined');
        return false;
    }

    const guild = discordClient.guilds.cache.get(serverId);

    if (!guild) {
        console.error('Guild not found');
        return false;
    }

    const member = await guild.members.fetch(discordId);

    const oldRoleKey = Object.keys(planToRoleMap).find(key => oldLookupKey.includes(key)) as keyof typeof planToRoleMap;
    const newRoleKey = Object.keys(planToRoleMap).find(key => newLookupKey.includes(key)) as keyof typeof planToRoleMap;
    const newRoleName = planToRoleMap[newRoleKey];
    const oldRoleName = planToRoleMap[oldRoleKey];

    if (oldRoleName) {
        const oldRole = guild.roles.cache.find(role => role.name === oldRoleName);
        if (oldRole) {
        await member.roles.remove(oldRole);
        }
    }

    if (newRoleName) {
        const newRole = guild.roles.cache.find(role => role.name === newRoleName);
        if (newRole) {
        await member.roles.add(newRole);
        }
    }

    return true;
}

discordClient.login(process.env.DISCORD_BOT_TOKEN);

// Next.js API endpoint
export async function POST(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    const expectedAuthToken = process.env.YOUR_AUTH_SECRET;

    if (!authHeader || authHeader !== `Bearer ${expectedAuthToken}`) {
        console.error('Unauthorized request');
        return new Response('Unauthorized', { status: 401 });
    }

    const payload = await request.json();
    const { old_record, record } = payload;

    const userId = record.user_id;
    const oldStripeLookupKey = old_record.stripe_lookup_key;
    const newStripeLookupKey = record.stripe_lookup_key;

    const success = await changeDiscordRoles(userId, oldStripeLookupKey, newStripeLookupKey);

    if (!success) {
        return NextResponse.json({ success: false, message: "Failed to change Discord roles" });
    }

    return NextResponse.json({ success: true });
}

// export async function POST(request: NextRequest) {
//     // Implements the discord bot script 
//     console.log(request.formData);
    

//     // get discord ID using user ID in user table (auth schema)

//     // put my discord script here 


//     return NextResponse.json({success: true}); // get the user ID, get the subscription change

// }
