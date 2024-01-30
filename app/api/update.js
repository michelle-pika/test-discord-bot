import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import pLimit from 'p-limit';

dotenv.config({ path: '../../.env.local' });

const discordBotToken = process.env.DISCORD_BOT_TOKEN
const serverId = process.env.DISCORD_SERVER_ID;
let discordRolesCache = {};

const RATE_LIMIT = 45; // Slightly less than the maximum to allow for some buffer
const limit = pLimit(RATE_LIMIT);

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_ADMIN_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
);

const planToRoleMap = {
    basic: process.env.DISCORD_BASIC_ROLE_NAME,
    standard: process.env.DISCORD_STANDARD_ROLE_NAME,
    unlimited: process.env.DISCORD_UNLIMITED_ROLE_NAME,
    ultimate: process.env.DISCORD_PRO_ROLE_NAME,
};

async function cacheDiscordRoles() {
    const response = await fetch(`https://discord.com/api/guilds/${serverId}/roles`, {
        headers: {
            Authorization: `Bot ${discordBotToken}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch roles: ${response.statusText}`);
    }

    const roles = await response.json();
    // Transform and cache the roles by name for easy lookup
    discordRolesCache = roles.reduce((acc, role) => {
        acc[role.name] = role.id;
        return acc;
    }, {});
}

function getDiscordRoleIdFromCache(roleName) {
    // Use the cached roles
    return discordRolesCache[roleName] || null;
}

async function fetchWithRateLimit(url, options, retries = 5) {
    try {
        return await limit(async () => { // Ensure the result of the limit call is returned
            const response = await fetch(url, options);
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After') || 1;
                console.log(`Rate limited. Retrying after ${retryAfter} seconds.`);
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                return fetchWithRateLimit(url, options, retries - 1); // Ensure this result is returned
            }
            return response;
        });
    } catch (error) {
        if (retries > 0) {
            console.log(`Request failed. Retrying after 5 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            return fetchWithRateLimit(url, options, retries - 1); // Ensure this result is returned
        } else {
            throw new Error(`Max retries reached. Failed to fetch data: ${error}`);
        }
    }
}

async function updateDiscordRoles(discordUserId, addRoleId, removeRoleId) {
    const memberEndpoint = `https://discord.com/api/guilds/${serverId}/members/${discordUserId}`;
    try {
        console.log(`Checking membership for user ID: ${discordUserId}`);
        // Check if the user is part of the Discord server
        const memberResponse = await fetchWithRateLimit(memberEndpoint, {
            headers: {
                Authorization: `Bot ${discordBotToken}`,
            },
        });
        console.log(`Response status: ${memberResponse.status}`);

        const responseBody = await memberResponse.json();
        console.log(`Response body: `, responseBody);

        // If the user is not part of the server
        if (!memberResponse.ok) {
            console.log(`User ID: ${discordUserId} is not a part of the server.`);
            return;
        } else {
            console.log(`User ID: ${discordUserId} is a part of the server.`);
        }

        // If the user is part of the server, proceed to update roles
        // We can assume there is no role to begin with
        // if (removeRoleId) {
        //     await fetchWithRateLimit(`${memberEndpoint}/roles/${removeRoleId}`, {
        //         method: 'DELETE',
        //         headers: {
        //             Authorization: `Bot ${discordBotToken}`,
        //         },
        //     });
        // }

        if (addRoleId) {
            await fetchWithRateLimit(`${memberEndpoint}/roles/${addRoleId}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bot ${discordBotToken}`,
                },
            });
        }
    } catch (error) {
        console.error(`An error occurred while updating roles for user ID: ${discordUserId}:`, error);
    }
}


async function changeDiscordRoles(userId, oldLookupKey, newLookupKey) {
    const { data, error } = await supabase.auth.admin.getUserById(userId)

    // Ensure roles are cached before proceeding
    if (Object.keys(discordRolesCache).length === 0) {
        await cacheDiscordRoles();
    }

    if (error) {
        console.error('An error occurred:', error);
        throw error;
    }

    data.user?.identities?.find((i) => i.provider === 'discord')?.id
    const discordUserId = data.user?.user_metadata?.provider_id;
    if (!discordUserId) {
        return true; // Return true as it's not an error situation
    }

    if (!serverId) {
        console.error('Server ID is undefined');
        return false;
    }
    function findRoleName(lookupKey) {
        const roleName = Object.keys(planToRoleMap).find((key) => lookupKey.includes(key));
        return roleName ? planToRoleMap[roleName] : null;
    }
    const oldRoleName = oldLookupKey ? findRoleName(oldLookupKey) : null;
    const newRoleName = newLookupKey ? findRoleName(newLookupKey) : null;

    const removeRoleId = oldRoleName ? getDiscordRoleIdFromCache(oldRoleName) : null;
    const addRoleId = newRoleName ? getDiscordRoleIdFromCache(newRoleName) : null;
    console.log('remove role id: ', removeRoleId);
    console.log('add role id: ', addRoleId)

    await updateDiscordRoles(discordUserId, addRoleId, removeRoleId);
    return true;
}

// Function to retrieve all subscription records from Supabase
async function getAllSubscriptions() {
    const { data, error } = await supabase
        .from('subscriptions')
        .select('*');

    if (error) {
        console.error('Error fetching subscriptions:', error);
        throw error;
    }


    return data;
}

// Function to process each subscription record
async function processSubscriptions() {
    const subscriptions = await getAllSubscriptions();

    // thread pool? or workers for this?
    for (const subscription of subscriptions) {
        const userId = subscription.user_id;
     
        const stripeLookupKey = subscription.stripe_lookup_key || 'basic';

        // Assuming the old stripe_lookup_key is null for this operation
        const success = await changeDiscordRoles(userId, stripeLookupKey, stripeLookupKey);

        if (!success) {
            console.error(`Failed to update Discord roles for user ID: ${userId}`);
        }
    }
}

// Main function to run the script
async function main() {
    console.time('Script Execution Time'); // Start the timer with a label

    try {
        await cacheDiscordRoles();
        await processSubscriptions();
        console.log('All subscriptions have been processed.');
    } catch (error) {
        console.error('An error occurred:', error);
    }

    console.timeEnd('Script Execution Time'); // Stop the timer and log the elapsed time
}

main();
