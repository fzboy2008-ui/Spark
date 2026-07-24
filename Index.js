require('dotenv').config(); 
const { Client, GatewayIntentBits, Collection, REST, Routes, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');
const GuildConfig = require('./models/GuildConfig');
const { GuildStore, OrderTicket } = require('./models/GuildStore');
const InviteData = require('./models/InviteData');
const BotSettings = require('./models/BotSettings');

const parser = new Parser();
const guildInvites = new Map(); // Global invite cache memory

const PRIMARY_OWNER_ID = '1266728371719508062';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.DirectMessages
    ]
});

client.commands = new Collection();
const commandsArray = [];
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(path.join(__dirname, 'commands', file));
    client.commands.set(command.data.name, command);
    commandsArray.push(command.data.toJSON());
}

client.once('ready', async () => {
    console.log(`🔥 [SPARK CORE] ${client.user.tag} online securely!`);
    if (process.env.MONGO_URI) {
        try { await mongoose.connect(process.env.MONGO_URI); console.log('📦 Connected to MongoDB successfully.'); } catch (err) { console.error("Mongo Error:", err); }
    }

    // Cache active guild invites on boot
    client.guilds.cache.forEach(async (guild) => {
        try {
            const invites = await guild.invites.fetch();
            const codeUses = new Map();
            invites.forEach(inv => codeUses.set(inv.code, inv.uses));
            guildInvites.set(guild.id, codeUses);
        } catch (e) {}
    });

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try { await rest.put(Routes.applicationCommands(client.user.id), { body: commandsArray }); } catch (e) { console.error("Slash Reg Error:", e); }
});

// Helper to check if a user is an authorized owner (Primary + Co-Owners)
async function isAuthorizedOwner(userId) {
    if (userId === PRIMARY_OWNER_ID) return true;
    const settings = await BotSettings.findOne({ settingKey: 'global' });
    if (settings && settings.coOwners.includes(userId)) return true;
    return false;
}

// ================= GLOBAL MESSAGE & DM ROUTER (SPARK CENTER & !PANEL) =================
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // --- 1. DEVELOPER DM CONTROL PANEL COMMAND (!panel) ---
    if (!message.guild && message.content.toLowerCase() === '!panel') {
        if (!(await isAuthorizedOwner(message.author.id))) {
            return message.reply("❌ **Access Denied:** You are not authorized to use the Spark Developer Control Panel.");
        }

        const embed = new EmbedBuilder()
            .setTitle('💎 SPARK ELITE DEVELOPER COMMAND CENTER')
            .setDescription('Welcome back, Chief. Select an operational module below to control active nodes, manage sub-owners, or oversee deployments.')
            .setColor('#2b2d31')
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('dev_btn_servers').setLabel('Manage Servers').setStyle(ButtonStyle.Primary).setEmoji('🌐'),
            new ButtonBuilder().setCustomId('dev_btn_coowners').setLabel('Manage Co-Owners').setStyle(ButtonStyle.Secondary).setEmoji('👥')
        );

        return message.reply({ embeds: [embed], components: [row] });
    }

    // --- 2. TWO-WAY SPARK CENTER DM BRIDGE (OWNER REPLY HANDLER) ---
    if (!message.guild && message.reference) {
        if (!(await isAuthorizedOwner(message.author.id))) return;

        try {
            const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMsg && repliedMsg.embeds.length > 0) {
                const embedDesc = repliedMsg.embeds[0].description || '';
                // Extract Guild ID from hidden footer or invisible text pattern if stored, or parse description
                const match = embedDesc.match(/GuildID:\s*([0-9]+)/);
                if (match && match[1]) {
                    const targetGuildId = match[1];
                    const targetGuild = client.guilds.cache.get(targetGuildId);
                    if (targetGuild) {
                        const config = await GuildConfig.findOne({ guildId: targetGuildId });
                        if (config && config.sparkCenterChannel) {
                            const sparkChan = targetGuild.channels.cache.get(config.sparkCenterChannel);
                            if (sparkChan) {
                                const bridgeEmbed = new EmbedBuilder()
                                    .setTitle('🛡️ Support Team Response')
                                    .setDescription(message.content)
                                    .setColor('#5865F2')
                                    .setFooter({ text: `Responded by Owner: ${message.author.tag}` })
                                    .setTimestamp();
                                await sparkChan.send({ embeds: [bridgeEmbed] });
                                return message.react('✅');
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Spark Center DM Reply Error:", err);
        }
    }

    // --- 3. GUILD SPARK CENTER MESSAGE FORWARDER (USER -> OWNER DM) ---
    if (message.guild) {
        try {
            const config = await GuildConfig.findOne({ guildId: message.guild.id });
            if (config && config.sparkCenterChannel && message.channel.id === config.sparkCenterChannel) {
                const settings = await BotSettings.findOne({ settingKey: 'global' });
                const recipientIds = [PRIMARY_OWNER_ID, ...(settings ? settings.coOwners : [])];

                const bridgeEmbed = new EmbedBuilder()
                    .setTitle('📥 New Inbound Support Message')
                    .setDescription(`**Server:** ${message.guild.name} (\`GuildID: ${message.guild.id}\`)\n**User:** ${message.author.tag} (${message.author.id})\n\n**Message:**\n${message.content}`)
                    .setColor('#fee75c')
                    .setTimestamp();

                for (const ownerId of recipientIds) {
                    try {
                        const ownerUser = await client.users.fetch(ownerId);
                        if (ownerUser) await ownerUser.send({ embeds: [bridgeEmbed] });
                    } catch (e) {}
                }
                await message.react('📨').catch(() => {});
            }
        } catch (e) {}
    }

    // --- 4. DYNAMIC AUTO RESPONSES ---
    if (message.guild && !message.author.bot) {
        try {
            const userMessage = message.content.toLowerCase();
            const config = await GuildConfig.findOne({ guildId: message.guild.id });
            if (!config || !config.autoResponses || config.autoResponses.length === 0) return;

            const matched = config.autoResponses.find(r => new RegExp(`\\b${r.trigger}\\b`, 'i').test(userMessage));
            if (matched && matched.replyText) {
                let replyText = matched.replyText.replace(/\\n/g, '\n');
                const responseEmbed = new EmbedBuilder().setColor("Blue").setDescription(replyText).setTimestamp();
                return message.reply({ embeds: [responseEmbed] });
            }
        } catch (err) {}
    }
});

// ================= CLEAN INVITE TRACKER & WELCOME SYSTEM =================
client.on('guildMemberAdd', async (member) => {
    try {
        const config = await GuildConfig.findOne({ guildId: member.guild.id });
        if (config && config.welcomeChannel) {
            const channel = member.guild.channels.cache.get(config.welcomeChannel);
            if (channel) {
                let descText = config.welcomeMessage || 'Welcome to the server!';
                descText = descText
                    .replace(/{user}/g, `${member}`)
                    .replace(/{memberCount}/g, `${member.guild.memberCount}`);
                
                const embed = new EmbedBuilder()
                    .setTitle(config.welcomeTitle || '✨ NEW MEMBER ARRIVED ✨')
                    .setDescription(descText)
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                    .setColor('#5865F2')
                    .setFooter({ text: `Member Count: ${member.guild.memberCount}` })
                    .setTimestamp();
                
                if (config.welcomeThumbnail && config.welcomeThumbnail.startsWith('http')) {
                    embed.setImage(config.welcomeThumbnail);
                }
                await channel.send({ content: `${member}`, embeds: [embed] }).catch(() => null);
            }
        }

        // Clean Invite Tracker Logic
        const cachedInvites = guildInvites.get(member.guild.id) || new Map();
        const newInvites = await member.guild.invites.fetch().catch(() => null);
        
        let inviter = null;
        if (newInvites) {
            const usedInvite = newInvites.find(inv => cachedInvites.get(inv.code) < inv.uses);
            if (usedInvite && usedInvite.inviter) inviter = usedInvite.inviter;

            const codeUses = new Map();
            newInvites.forEach(inv => codeUses.set(inv.code, inv.uses));
            guildInvites.set(member.guild.id, codeUses);
        }

        if (inviter) {
            const invData = await InviteData.findOne({ guildId: member.guild.id, userId: inviter.id }) || new InviteData({ guildId: member.guild.id, userId: inviter.id });
            invData.regular += 1;
            await invData.save();

            if (config && config.inviteLogChannel) {
                const logChan = member.guild.channels.cache.get(config.inviteLogChannel);
                if (logChan) {
                    const totalInvites = invData.regular - invData.leaves - invData.fake;
                    const logEmbed = new EmbedBuilder()
                        .setTitle('📥 Member Join Tracked')
                        .setDescription(`**User:** ${member.user.tag}\n**Invited By:** ${inviter.tag}\n**Total Invites:** ${totalInvites} (${invData.regular} Valid)`)
                        .setColor('#57f287')
                        .setTimestamp();
                    await logChan.send({ embeds: [logEmbed] }).catch(() => null);
                }
            }
        }
    } catch (err) {}
});

client.on('guildMemberRemove', async (member) => {
    try {
        // Optional: track leaves if inviter is cacheable, keeping base stats clean
    } catch (err) {}
});

// ================= INTERACTION ROUTER & BUTTON HANDLERS =================
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (command) await command.execute(interaction);
            return;
        }

        // --- DEVELOPER DM PANEL INTERACTIONS ---
        if (interaction.isButton() && !interaction.guild) {
            if (!(await isAuthorizedOwner(interaction.user.id))) {
                return interaction.reply({ content: '❌ Unauthorized.', ephemeral: true });
            }

            if (interaction.customId === 'dev_btn_servers') {
                const guilds = client.guilds.cache.map(g => `• **${g.name}** (\`${g.id}\`) - ${g.memberCount} Members`);
                const embed = new EmbedBuilder()
                    .setTitle('🌐 Active Bot Deployment Nodes')
                    .setDescription(guilds.length > 0 ? guilds.join('\n') : 'No servers connected.')
                    .setColor('#5865F2');

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('dev_btn_leave_prompt').setLabel('Remote Leave Server').setStyle(ButtonStyle.Danger).setEmoji('🚪'),
                    new ButtonBuilder().setCustomId('dev_btn_back').setLabel('Back to Panel').setStyle(ButtonStyle.Secondary)
                );
                return interaction.update({ embeds: [embed], components: [row] });
            }

            if (interaction.customId === 'dev_btn_leave_prompt') {
                const modal = new ModalBuilder().setCustomId('modal_dev_leave').setTitle('Remote Server Exit');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('leave_guild_id').setLabel('Target Guild ID').setRequired(true).setStyle(TextInputStyle.Short)));
                return interaction.showModal(modal);
            }

            if (interaction.customId === 'dev_btn_coowners') {
                if (interaction.user.id !== PRIMARY_OWNER_ID) {
                    return interaction.reply({ content: '❌ Only the Primary Owner can manage co-owners.', ephemeral: true });
                }
                const settings = await BotSettings.findOne({ settingKey: 'global' }) || { coOwners: [] };
                const list = settings.coOwners.length > 0 ? settings.coOwners.map(id => `• <@${id}> (\`${id}\`)`).join('\n') : 'No co-owners assigned.';
                
                const embed = new EmbedBuilder()
                    .setTitle('👥 Co-Owner Management')
                    .setDescription(`**Primary Owner:** <@${PRIMARY_OWNER_ID}>\n\n**Current Co-Owners:**\n${list}`)
                    .setColor('#fbee5c');

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('dev_btn_add_owner').setLabel('Add Co-Owner').setStyle(ButtonStyle.Success).setEmoji('➕'),
                    new ButtonBuilder().setCustomId('dev_btn_remove_owner').setLabel('Remove Co-Owner').setStyle(ButtonStyle.Danger).setEmoji('➖'),
                    new ButtonBuilder().setCustomId('dev_btn_back').setLabel('Back').setStyle(ButtonStyle.Secondary)
                );
                return interaction.update({ embeds: [embed], components: [row] });
            }

            if (interaction.customId === 'dev_btn_add_owner') {
                const modal = new ModalBuilder().setCustomId('modal_add_owner').setTitle('Authorize Co-Owner');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_owner_id').setLabel('Discord User ID').setRequired(true).setStyle(TextInputStyle.Short)));
                return interaction.showModal(modal);
            }

            if (interaction.customId === 'dev_btn_remove_owner') {
                const modal = new ModalBuilder().setCustomId('modal_remove_owner').setTitle('Revoke Co-Owner');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rem_owner_id').setLabel('Discord User ID').setRequired(true).setStyle(TextInputStyle.Short)));
                return interaction.showModal(modal);
            }

            if (interaction.customId === 'dev_btn_back') {
                const embed = new EmbedBuilder()
                    .setTitle('💎 SPARK ELITE DEVELOPER COMMAND CENTER')
                    .setDescription('Select an operational module below to control active nodes or sub-owners.')
                    .setColor('#2b2d31');
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('dev_btn_servers').setLabel('Manage Servers').setStyle(ButtonStyle.Primary).setEmoji('🌐'),
                    new ButtonBuilder().setCustomId('dev_btn_coowners').setLabel('Manage Co-Owners').setStyle(ButtonStyle.Secondary).setEmoji('👥')
                );
                return interaction.update({ embeds: [embed], components: [row] });
            }
        }

        // --- GUILD PANEL & CONFIGURATION BUTTONS ---
        if (interaction.isButton() && interaction.guild) {
            const guildId = interaction.guild.id;

            if (interaction.customId === 'setup_spark_center') {
                const modal = new ModalBuilder().setCustomId('modal_spark_center_setup').setTitle('Setup Spark Center Bridge');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('spark_chan_id').setLabel('Target Channel ID (Admin Only)').setRequired(true).setStyle(TextInputStyle.Short)));
                return interaction.showModal(modal);
            }

            if (interaction.customId === 'setup_welcome_btn') {
                const modal = new ModalBuilder().setCustomId('modal_welcome').setTitle('Welcome Configuration');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('w_title').setLabel('Embed Title').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('w_msg').setLabel('Message').setRequired(true).setStyle(TextInputStyle.Paragraph)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('w_chan').setLabel('Welcome Channel ID').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('w_thumb').setLabel('Banner/Thumbnail URL').setRequired(false).setStyle(TextInputStyle.Short))
                );
                return interaction.showModal(modal);
            }
        }

        // --- MODAL SUBMISSIONS ---
        if (interaction.isModalSubmit()) {
            await interaction.deferReply({ ephemeral: true });

            if (interaction.customId === 'modal_dev_leave') {
                const targetGuildId = interaction.fields.getTextInputValue('leave_guild_id').trim();
                const targetGuild = client.guilds.cache.get(targetGuildId);
                if (!targetGuild) return interaction.editReply({ content: '❌ Bot is not in a guild with that ID.' });
                await targetGuild.leave();
                return interaction.editReply({ content: `✅ Successfully left server: **${targetGuild.name}**` });
            }

            if (interaction.customId === 'modal_add_owner') {
                const newId = interaction.fields.getTextInputValue('new_owner_id').trim();
                let settings = await BotSettings.findOne({ settingKey: 'global' });
                if (!settings) settings = new BotSettings({ settingKey: 'global', coOwners: [] });
                if (!settings.coOwners.includes(newId)) {
                    settings.coOwners.push(newId);
                    await settings.save();
                }
                return interaction.editReply({ content: `✅ Successfully added <@${newId}> as a Co-Owner.` });
            }

            if (interaction.customId === 'modal_remove_owner') {
                const remId = interaction.fields.getTextInputValue('rem_owner_id').trim();
                let settings = await BotSettings.findOne({ settingKey: 'global' });
                if (settings) {
                    settings.coOwners = settings.coOwners.filter(id => id !== remId);
                    await settings.save();
                }
                return interaction.editReply({ content: `✅ Successfully removed <@${remId}> from Co-Owners.` });
            }

            if (interaction.customId === 'modal_spark_center_setup') {
                const chanId = interaction.fields.
