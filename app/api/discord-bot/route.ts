import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const discordBotToken = process.env.DISCORD_BOT_TOKEN
const serverId = process.env.DISCORD_SERVER_ID;

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
    basic: process.env.DISCORD_BASIC_ROLE_NAME,
    standard: process.env.DISCORD_STANDARD_ROLE_NAME,
    unlimited: process.env.DISCORD_UNLIMITED_ROLE_NAME,
    ultimate: process.env.DISCORD_PRO_ROLE_NAME,
    discord: process.env.DISCORD_PRO_ROLE_NAME,
};

async function getDiscordRoleId(guildId: string, roleName: string) {
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

    return role ? role.id : null;
}

async function updateDiscordRoles(discordUserId: string, addRoleId: string | null, removeRoleId: string | null) {
    const memberEndpoint = `https://discord.com/api/guilds/${serverId}/members/${discordUserId}`;

    if (removeRoleId) {
        await fetch(`${memberEndpoint}/roles/${removeRoleId}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bot ${discordBotToken}`,
            },
        });
    }

    if (addRoleId) {
        await fetch(`${memberEndpoint}/roles/${addRoleId}`, {
            method: 'PUT',
            headers: {
                Authorization: `Bot ${discordBotToken}`,
            },
        });
    }
}

async function changeDiscordRoles(userId: string, oldLookupKey: string, newLookupKey: string) {
    const { data, error } = await supabase.auth.admin.getUserById(userId)

    if (error) {
        console.error('An error occurred:', error);
        throw error;
    }

    data.user?.identities?.find((i) => i.provider === 'discord')?.id
    const discordUserId = data.user?.user_metadata?.provider_id;

    if (!discordUserId || !serverId) {
        console.error('Discord ID or Server ID is undefined');
        return false;
    }

    function findRoleName(lookupKey: string) {
        const roleName = Object.keys(planToRoleMap).find((key) => lookupKey.includes(key)) as keyof typeof planToRoleMap;
        return roleName ? planToRoleMap[roleName] : null;
    }
    const oldRoleName = oldLookupKey ? findRoleName(oldLookupKey) : null;
    const newRoleName = newLookupKey ? findRoleName(newLookupKey) : null;

    const removeRoleId = oldRoleName ? await getDiscordRoleId(serverId, oldRoleName) : null;
    const addRoleId = newRoleName ? await getDiscordRoleId(serverId, newRoleName) : null;

    await updateDiscordRoles(discordUserId, addRoleId, removeRoleId);
    return true;
}

export async function POST(request: NextRequest) {
    const authHeader = request.headers.get('Authentication');
    const expectedAuthToken = process.env.DISCORD_AUTH_SECRET;

    if (!authHeader || authHeader !== `Bearer ${expectedAuthToken}`) {
        console.error('Unauthenticated request');
        return new Response('Unathenticated', { status: 401 });
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
