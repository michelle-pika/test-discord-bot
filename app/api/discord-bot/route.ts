import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

// const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
// const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
// const supabase = createClient(supabaseUrl, supabaseKey);
const discordBotToken=process.env.DISCORD_BOT_TOKEN
const serverId = process.env.DISCORD_SERVER_ID;
const CHANNEL_ID = 1197870397807415336

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_ADMIN_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
);

interface Role {
    id: string;
    name: string;
  }

const planToRoleMap = {
    basic: "Basic",
    standard: "Standard",
    unlimited: "Pro",
    ultimate: "Pro",
    discord: "Pro", 
  };

  async function getDiscordRoleId(guildId: string, roleName: string) {
    console.log(`Fetching roles for guildId: ${guildId}, roleName: ${roleName}`);
    const response = await fetch(`https://discord.com/api/guilds/${guildId}/roles`, {
      headers: {
        Authorization: `Bot ${discordBotToken}`,
      },
    });
    
    if (!response.ok) {
        throw new Error(`Failed to fetch roles: ${response.statusText}`);
      }

    const roles = await response.json() as Role[];
    const role = roles.find(r => r.name === roleName);

    console.log(`Role ID for '${roleName}': ${role ? role.id : 'Not found'}`);
    return role ? role.id : null;
  }
  
  async function updateDiscordRoles(discordUserId: string, addRoleId: string | null, removeRoleId: string | null) {
    const memberEndpoint = `https://discord.com/api/guilds/${serverId}/members/${discordUserId}`;

    console.log(`Updating roles for user ${discordUserId}: Adding ${addRoleId}, Removing ${removeRoleId}`);

    if (removeRoleId) {
        const removeResponse = await fetch(`${memberEndpoint}/roles/${removeRoleId}`, {
        method: 'DELETE',
        headers: {
            Authorization: `Bot ${discordBotToken}`,
          },
      });
      console.log(`Remove role response: ${await removeResponse.text()}`);
    }
  
    if (addRoleId) {
        const addResponse = await fetch(`${memberEndpoint}/roles/${addRoleId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bot ${discordBotToken}`,
        },
      });
      console.log(`Add role response: ${await addResponse.text()}`);
    }
  }

async function changeDiscordRoles(userId: string, oldLookupKey: string, newLookupKey: string) {

    console.log(`Change Discord Roles: UserID: ${userId}, OldKey: ${oldLookupKey}, NewKey: ${newLookupKey}`);

    // const userResponse = await supabase.auth.admin.getUserById(userId);
    // const userData = userResponse.data['user'];
    // console.log("USER DATA: ", userData)
    
    // // await supabase
    // //     .from('profiles.auth.users')
    // //     .select('raw_user_meta_data')
    // //     .eq('id', userId)
    // //     .single();

    // // if (error) {
    // //     console.error('Error fetching user from Supabase:', error);
    // //     return false;
    // // }

    // const discordId = userData['raw_user_meta_data']['full_name']; 

    const {data, error} = await supabase.auth.admin.getUserById(userId)

    if (error) {
        console.log('error')
    }

    data.user?.identities?.find((i) => i.provider === 'discord')?.id
    const discordUserId = data.user?.user_metadata?.provider_id;

    console.log("DISCORD_ID: ", discordUserId);
    console.log("SERVER_ID: ", serverId)

    if (!discordUserId || !serverId) {
        console.error('Discord ID or Server ID is undefined');
        return false;
    }

    console.log("OLD LOOKUP KEY: ", oldLookupKey);
    console.log("NEW LOOKUP KEY: ", newLookupKey);

    function findRoleName(lookupKey: string) {
        const roleName = Object.keys(planToRoleMap).find((key) => lookupKey.includes(key)) as keyof typeof planToRoleMap;
return roleName ? planToRoleMap[roleName] : null;
      }
      const oldRoleName = oldLookupKey ? findRoleName(oldLookupKey) : null;
      const newRoleName = newLookupKey ? findRoleName(newLookupKey) : null;
      
    console.log("OLD ROLE NAME: ", oldRoleName);
    console.log("NEW ROLE NAME: ", newRoleName);

    const removeRoleId = oldRoleName ? await getDiscordRoleId(serverId, oldRoleName) : null;
    const addRoleId = newRoleName ? await getDiscordRoleId(serverId, newRoleName) : null;
  
    console.log("REMOVE ROLE ID: ", removeRoleId);
    console.log("ADD ROLE ID: ", addRoleId);

    if (addRoleId || removeRoleId) {
        await updateDiscordRoles(discordUserId, addRoleId, removeRoleId);
        const confirmationMessage = 'Your role has been changed successfully!';
        await sendConfirmationMessage(confirmationMessage);
      }
    return true;
  }

  async function sendConfirmationMessage(messageContent: string) {
    const apiUrl = `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`;
    const headers = {
      'Authorization': `Bot ${discordBotToken}`,
    //   'Content-Type': 'application/json',
    };
    const body = JSON.stringify({
      content: messageContent,
    });
  
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body,
      });
  
      if (response.ok) {
        console.log('Message sent successfully!');
      } else {
        console.error(`Failed to send message: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }
  

// Next.js API endpoint
export async function POST(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    const expectedAuthToken = process.env.YOUR_AUTH_SECRET;

    // if (!authHeader || authHeader !== `Bearer ${expectedAuthToken}`) {
    //     console.error('Unauthorized request');
    //     return new Response('Unauthorized', { status: 401 });
    // }

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
