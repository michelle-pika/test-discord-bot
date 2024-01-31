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
        // console.log(`Checking membership for user ID: ${discordUserId}`);
        // Check if the user is part of the Discord server
        const memberResponse = await fetchWithRateLimit(memberEndpoint, {
            headers: {
                Authorization: `Bot ${discordBotToken}`,
            },
        });
        // console.log(`Response status: ${memberResponse.status}`);

        const responseBody = await memberResponse.json();
        if (discordUserId === "101892171787124548898") {
            console.log(`Response body: `, responseBody);
        }

        // If the user is not part of the server
        if (!memberResponse.ok) {
            // console.log(`NOT a part of the server.`);
            return;
        } else {
            console.log(`User ID: ${discordUserId} is a part of the server.`);
        }

        console.log(`Updating Discord roles for user ID: ${discordUserId}, Adding Role ID: ${addRoleId}, Removing Role ID: ${removeRoleId}`);
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

async function getDiscordUserId(userId) {
    // Query the 'identities' table in the 'auth' schema for the row that matches the given userId and provider
    const { data, error } = await supabase
        .from('auth.identities') // Assuming 'identities' table is within the 'auth' schema
        .select('identity_data') // Selecting only the 'identity_data' column
        .eq('id', userId) // Matching the 'id' column to the provided userId
        .eq('provider', 'discord') // Ensuring the provider is 'discord'
        .single(); // Assuming there's only one identity per user per provider, or you could handle multiple

    if (error) {
        console.error('Failed to fetch Discord user ID:', error);
        throw error; // Or handle the error as appropriate for your application
    }

    if (data && data.identity_data) {
        // Parse the 'identity_data' JSON to access the 'provider_id'
        const identityData = JSON.parse(data.identity_data);
        return identityData.provider_id || null;
    }

    return null; // Return null if no matching identity or 'provider_id' is found
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

    // data.user?.identities?.find((i) => i.provider === 'discord')?.id
    // const discordUserId = data.user?.user_metadata?.provider_id;
    // const discordUserId = await getDiscordUserId(userId);
    const discordUserId = data.user?.identities?.find((i) => i.provider === 'discord')?.id
    if (!discordUserId) {
        return true; // Return true as it's not an error situation
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
    if (userId === "f57d9061-0a95-4d19-8e25-e6d6573d87c4") {
        console.log("DATA: ", data)
        console.log("DISCORD USER ID: ", discordUserId)
        console.log("REMOVE ROLD: ", oldRoleName)
        console.log("ADD ROLE: ", newRoleName)
    }
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

    // Helper function 
    async function processSubscriptionList(subscriptions, type) { // Added 'type' parameter for logging
        console.log(`NOW PROCESSING ${type} subscriptions...`);
        for (const subscription of subscriptions) {
            const userId = subscription.user_id;
            console.log("User Id: ", userId)
            const stripeLookupKey = subscription.stripe_lookup_key;
            // Assuming the old stripe_lookup_key is null for this operation
            totalUsersProcessed++;
            const success = await changeDiscordRoles(userId, stripeLookupKey, stripeLookupKey);

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

async function fetchAllMembers(afterId = '0', limit = 1000, allMembers = []) {
    const membersEndpoint = `https://discord.com/api/guilds/${serverId}/members?after=${afterId}&limit=${limit}`;
    const membersResponse = await fetchWithRateLimit(membersEndpoint, {
        headers: {
            Authorization: `Bot ${discordBotToken}`,
        },
    });

    if (!membersResponse.ok) {
        throw new Error(`Failed to fetch members: ${membersResponse.statusText}`);
    }

    const members = await membersResponse.json();
    allMembers.push(...members);

    // If the number of members returned is equal to the limit, there might be more members to fetch
    if (members.length === limit) {
        const lastMemberId = members[members.length - 1].user.id;
        return fetchAllMembers(lastMemberId, limit, allMembers);
    }

    return allMembers;
}

async function listAllMembers() {
    try {
        const members = await fetchAllMembers();
        console.log(`Total Members: ${members.length}`);
        members.forEach(member => {
            console.log(`ID: ${member.user.id}, Username: ${member.user.username}, Roles: ${member.roles.join(', ')}`);
        });
    } catch (error) {
        console.error(`An error occurred while listing members:`, error);
    }
}



// Main function to run the script
async function main() {
    console.time('Script Execution Time'); // Start the timer with a label

    try {
        await cacheDiscordRoles();
        // await listAllMembers();
        // exit(0)
        await processSubscriptions();
        console.log('All subscriptions have been processed.');
    } catch (error) {
        console.error('An error occurred:', error);
    }

    console.timeEnd('Script Execution Time'); // Stop the timer and log the elapsed time
}

main();