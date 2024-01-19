require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const { Client, GatewayIntentBits, Partials } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember] // Include as needed
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async message => {
    console.log(`Message from ${message.author.tag}: ${message.content}`);
    
    if (message.content.startsWith('!changeUserRole')) {
      // Hardcoded username
      const hardcodedUsername = 'michelleqin';
      const roleToRemove = 'Pro';
      const roleToAdd = 'Basic'; // Specify the new role to add
  
      if (message.author.username === hardcodedUsername) {
        const guildRoleToRemove = message.guild.roles.cache.find(r => r.name === roleToRemove);
        const guildRoleToAdd = message.guild.roles.cache.find(r => r.name === roleToAdd);
  
        if (guildRoleToRemove && guildRoleToAdd) {
          try {
            // Remove the old role
            await message.member.roles.remove(guildRoleToRemove);
            message.reply(`Role ${roleToRemove} removed from ${hardcodedUsername}`);
  
            // Add the new role
            await message.member.roles.add(guildRoleToAdd);
            message.reply(`Role ${roleToAdd} assigned to ${hardcodedUsername}`);
          } catch (err) {
            console.error(err);
            message.reply("There was an error updating the roles!");
          }
        } else {
          message.reply("One or more roles not found!");
        }
      }
    }
  });
  

client.login(process.env.DISCORD_BOT_TOKEN);
