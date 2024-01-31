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
        // Check if the user is part of the Discord server
        const memberResponse = await fetchWithRateLimit(memberEndpoint, {
            headers: {
                Authorization: `Bot ${discordBotToken}`,
            },
        });

        const responseBody = await memberResponse.json();

        // If the user is not part of the server
        if (!memberResponse.ok) {
            return;
        } 
        // No need to remove roles in the update script (everyone has no roles to begin with)
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

    const discordUserId = data.user?.identities?.find((i) => i.provider === 'discord')?.id
    if (!discordUserId) {
        return true; 
    }

    if (!serverId) {
        console.error('Server ID is undefined');
        return false;
    }
    function findRoleName(lookupKey) {
        const planType = lookupKey.split('_')[0];
        return planToRoleMap[planType] || null;
    }
    
    const oldRoleName = oldLookupKey ? findRoleName(oldLookupKey) : null;
    const newRoleName = newLookupKey ? findRoleName(newLookupKey) : null;

    const removeRoleId = oldRoleName ? getDiscordRoleIdFromCache(oldRoleName) : null;
    const addRoleId = newRoleName ? getDiscordRoleIdFromCache(newRoleName) : null;
    await updateDiscordRoles(discordUserId, addRoleId, removeRoleId);
    return true;
}

async function getSubscriptionsByType(type) {
    const stripeLookupKeys = {
        ultimate: ['ultimate_monthly', 'ultimate_yearly'],
        unlimited: ['unlimited_monthly', 'unlimited_yearly'],
        standard: ['standard_monthly', 'standard_yearly']
    };

    const keysForType = stripeLookupKeys[type];
    if (!keysForType) {
        console.error(`Invalid subscription type: ${type}`);
        return [];
    }

    const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .in('stripe_lookup_key', keysForType);

    if (error) {
        console.error(`Error fetching ${type} subscriptions:`, error);
        throw error;
    }

    return data;
}


async function processSubscriptions() {
    let totalUsersProcessed = 0; 

    async function processSubscriptionList(subscriptions, type) { 
        console.log(`NOW PROCESSING ${type} subscriptions...`);
        for (const subscription of subscriptions) {
            const userId = subscription.user_id;
            console.log("User Id: ", userId)
            const stripeLookupKey = subscription.stripe_lookup_key;

            totalUsersProcessed++;
            const success = await changeDiscordRoles(userId, stripeLookupKey, stripeLookupKey); // Passing same stripeLookupKey because we aren't removing anything

            if (!success) {
                console.error(`Failed to update Discord roles for user ID: ${userId}`);
            }
        }
        console.log(`${type} subscriptions processed.`);
    }

    // Process each type of subscription
    const ultimateSubscriptions = await getSubscriptionsByType('ultimate');
    await processSubscriptionList(ultimateSubscriptions, 'ultimate');

    const unlimitedSubscriptions = await getSubscriptionsByType('unlimited');
    await processSubscriptionList(unlimitedSubscriptions, 'unlimited');

    const standardSubscriptions = await getSubscriptionsByType('standard');
    await processSubscriptionList(standardSubscriptions, 'standard');
    console.log(`Total number of users processed: ${totalUsersProcessed}`);
}

// async function listAllMembers() {
//     try {
//         const members = await fetchAllMembers();
//         console.log(`Total Members: ${members.length}`);
//         members.forEach(member => {
//             console.log(`ID: ${member.user.id}, Username: ${member.user.username}, Roles: ${member.roles.join(', ')}`);
//         });
//     } catch (error) {
//         console.error(`An error occurred while listing members:`, error);
//     }
// }


// Main function to run the script
async function main() {
    console.time('Script Execution Time'); // Start the timer with a label

    try {
        await cacheDiscordRoles();
        // await listAllMembers(); for debugging
        await processSubscriptions();
        console.log('All subscriptions have been processed.');
    } catch (error) {
        console.error('An error occurred:', error);
    }

    console.timeEnd('Script Execution Time'); // Stop the timer and log the elapsed time
}

main();