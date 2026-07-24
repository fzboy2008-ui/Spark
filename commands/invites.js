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
    console.log(`🔥 [SPARK CORE] ${client.user.tag} online successfully!`);
    if (process.env.MONGO_URI) {
        try { await mongoose.connect(process.env.MONGO_URI); console.log('📦 Connected to MongoDB.'); } catch (err) { console.error("Mongo Error:", err); }
    }

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

async function isAuthorizedOwner(userId) {
    if (userId === PRIMARY_OWNER_ID) return true;
    const settings = await BotSettings.findOne({ settingKey: 'global' });
    if (settings && settings.coOwners.includes(userId)) return true;
    return false;
}

// ================= GLOBAL MESSAGE & DM ROUTER =================
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

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

    if (!message.guild && message.reference) {
        if (!(await isAuthorizedOwner(message.author.id))) return;

        try {
            const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMsg && repliedMsg.embeds.length > 0) {
                const embedDesc = repliedMsg.embeds[0].description || '';
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

// ================= WELCOME & INVITE TRACKER JOIN =================
client.on('guildMemberAdd', async (member) => {
    try {
        const config = await GuildConfig.findOne({ guildId: member.guild.id });
        if (config && config.welcomeChannel) {
            const channel = member.guild.channels.cache.get(config.welcomeChannel);
            if (channel) {
                let descText = config.welcomeMessage || 'Welcome!';
                descText = descText
                    .replace(/{user}/g, `${member}`)
                    .replace(/{memberCount}/g, `${member.guild.memberCount}`);
                
                const embed = new EmbedBuilder()
                    .setTitle(config.welcomeTitle || '✨ WELCOME ✨')
                    .setDescription(descText)
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                    .setColor('#FFCC00')
                    .setFooter({ text: `Member #${member.guild.memberCount}` })
                    .setTimestamp();
                
                if (config.welcomeThumbnail && config.welcomeThumbnail.startsWith('http')) {
                    embed.setImage(config.welcomeThumbnail);
                }
                await channel.send({ content: `${member}`, embeds: [embed] }).catch(() => null);
            }
        }
        if (config && config.totalMembersChan) {
            const chan = member.guild.channels.cache.get(config.totalMembersChan);
            if (chan) await chan.setName(`🪐 Total Members: ${member.guild.memberCount}`).catch(() => null);
        }

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
                    const lifetimeTotal = invData.regular - invData.leaves - invData.fake;
                    const logCard = `👤 Member     : ${member.user.tag}\n🔗 Invited By : ${inviter.tag}\n--------------------------------\n📊 Total Invites: ${lifetimeTotal} (${invData.regular} Valid)`;
                    const embed = new EmbedBuilder().setTitle('📥 MEMBER JOIN LOG').setDescription(logCard).setColor('#00FF00').setTimestamp();
                    await logChan.send({ embeds: [embed] }).catch(() => null);
                }
            }
        }
    } catch (err) {}
});

client.on('guildMemberRemove', async (member) => {
    try {
        const config = await GuildConfig.findOne({ guildId: member.guild.id });
        if (config && config.totalMembersChan) {
            const chan = member.guild.channels.cache.get(config.totalMembersChan);
            if (chan) await chan.setName(`🪐 Total Members: ${member.guild.memberCount}`).catch(() => null);
        }
    } catch (err) {}
});

// ================= DYNAMIC INTERACTIONS & TIMED LOOP =================
client.on('interactionCreate', async (interaction) => {
    try {
        const guildId = interaction.guild?.id;

        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (command) await command.execute(interaction);
            return;
        }

        if (interaction.isButton() && !interaction.guild) {
            if (!(await isAuthorizedOwner(interaction.user.id))) {
                return interaction.reply({ content: '❌ Unauthorized.', ephemeral: true });
            }

            if (interaction.customId === 'dev_btn_servers') {
                const guilds = client.guilds.cache.map(g => `• **${g.name}** (\`${g.id}\`) - ${g.memberCount} Members`);
                const embed = new EmbedBuilder().setTitle('🌐 Active Bot Deployment Nodes').setDescription(guilds.length > 0 ? guilds.join('\n') : 'No servers connected.').setColor('#5865F2');
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('dev_btn_leave_prompt').setLabel('Remote Leave').setStyle(ButtonStyle.Danger).setEmoji('🚪'),
                    new ButtonBuilder().setCustomId('dev_btn_back').setLabel('Back').setStyle(ButtonStyle.Secondary)
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
                    return interaction.reply({ content: '❌ Only Primary Owner.', ephemeral: true });
                }
                const settings = await BotSettings.findOne({ settingKey: 'global' }) || { coOwners: [] };
                const list = settings.coOwners.length > 0 ? settings.coOwners.map(id => `• <@${id}>`).join('\n') : 'No co-owners.';
                const embed = new EmbedBuilder().setTitle('👥 Co-Owner Management').setDescription(`**Primary:** <@${PRIMARY_OWNER_ID}>\n\n**Co-Owners:**\n${list}`).setColor('#fbee5c');
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('dev_btn_add_owner').setLabel('Add').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('dev_btn_remove_owner').setLabel('Remove').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('dev_btn_back').setLabel('Back').setStyle(ButtonStyle.Secondary)
                );
                return interaction.update({ embeds: [embed], components: [row] });
            }

            if (interaction.customId === 'dev_btn_add_owner') {
                const modal = new ModalBuilder().setCustomId('modal_add_owner').setTitle('Add Co-Owner');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_owner_id').setLabel('User ID').setRequired(true).setStyle(TextInputStyle.Short)));
                return interaction.showModal(modal);
            }

            if (interaction.customId === 'dev_btn_remove_owner') {
                const modal = new ModalBuilder().setCustomId('modal_remove_owner').setTitle('Remove Co-Owner');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rem_owner_id').setLabel('User ID').setRequired(true).setStyle(TextInputStyle.Short)));
                return interaction.showModal(modal);
            }

            if (interaction.customId === 'dev_btn_back') {
                const embed = new EmbedBuilder().setTitle('💎 SPARK ELITE DEVELOPER COMMAND CENTER').setDescription('Select an option below.').setColor('#2b2d31');
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('dev_btn_servers').setLabel('Manage Servers').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('dev_btn_coowners').setLabel('Manage Co-Owners').setStyle(ButtonStyle.Secondary)
                );
                return interaction.update({ embeds: [embed], components: [row] });
            }
        }

        if (interaction.isButton() && guildId) {
            if (interaction.customId === 'setup_spark_center') {
                const modal = new ModalBuilder().setCustomId('modal_spark_center_setup').setTitle('Setup Spark Center');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('spark_chan_id').setLabel('Channel ID').setRequired(true).setStyle(TextInputStyle.Short)));
                return interaction.showModal(modal);
            }
            if (interaction.customId === 'setup_store_cfg' || interaction.customId === 'setup_store_visual' || interaction.customId === 'setup_store_execution' || interaction.customId === 'setup_store_dms' || interaction.customId === 'setup_stats_btn' || interaction.customId === 'setup_youtube_btn' || interaction.customId === 'setup_welcome_btn' || interaction.customId === 'setup_tickets_btn' || interaction.customId === 'setup_ticket_btn' || interaction.customId === 'setup_auto_btn') {
                // Trigger existing modals for setup buttons smoothly
                const modalMap = {
                    setup_store_cfg: ['modal_store_cfg', '1. Stock Setup', 'cfg_name', 'Server Name', 'cfg_role', 'Role ID', 'cfg_logs', 'Logs ID', 'cfg_items', 'Items Setup'],
                    setup_stats_btn: ['modal_stats_setup', 'Stats Setup', 'stats_total_input', 'Total Voice ID', 'stats_online_input', 'Online Voice ID'],
                    setup_youtube_btn: ['youtube_modal_submit', 'YouTube Setup', 'yt_channel_id_input', 'YT ID', 'yt_live_chan_input', 'Live ID', 'yt_upload_chan_input', 'Upload ID'],
                    setup_welcome_btn: ['modal_welcome', 'Welcome Setup', 'w_title', 'Title', 'w_msg', 'Message', 'w_chan', 'Channel ID', 'w_thumb', 'Thumbnail URL']
                };
                if (interaction.customId === 'setup_welcome_btn') {
                    const modal = new ModalBuilder().setCustomId('modal_welcome').setTitle('Welcome Configuration');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('w_title').setLabel('Title').setRequired(true).setStyle(TextInputStyle.Short)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('w_msg').setLabel('Message').setRequired(true).setStyle(TextInputStyle.Paragraph)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('w_chan').setLabel('Channel ID').setRequired(true).setStyle(TextInputStyle.Short)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('w_thumb').setLabel('Thumbnail URL').setRequired(false).setStyle(TextInputStyle.Short))
                    );
                    return interaction.showModal(modal);
                }
            }

            const config = await GuildConfig.findOne({ guildId });
            if (interaction.customId === 'claim_ticket') {
                if (config && config.ticketRole && !interaction.member.roles.cache.has(config.ticketRole)) {
                    return await interaction.reply({ content: '❌ Staff only.', ephemeral: true });
                }
                await interaction.reply({ content: `🔒 Ticket claimed by ${interaction.user}` });
                return await interaction.message.edit({ components: [interaction.message.components[0]] });
            }

            if (interaction.customId === 'close_ticket') {
                await interaction.reply('🔒 Closing channel...');
                setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
            }
        }

        if (interaction.isModalSubmit()) {
            await interaction.deferReply({ ephemeral: true });

            if (interaction.customId === 'modal_dev_leave') {
                const targetGuildId = interaction.fields.getTextInputValue('leave_guild_id').trim();
                const targetGuild = client.guilds.cache.get(targetGuildId);
                if (!targetGuild) return interaction.editReply({ content: '❌ Invalid Guild ID.' });
                await targetGuild.leave();
                return interaction.editReply({ content: `✅ Left server: **${targetGuild.name}**` });
            }

            if (interaction.customId === 'modal_add_owner') {
                const newId = interaction.fields.getTextInputValue('new_owner_id').trim();
                let settings = await BotSettings.findOne({ settingKey: 'global' }) || new BotSettings({ settingKey: 'global', coOwners: [] });
                if (!settings.coOwners.includes(newId)) { settings.coOwners.push(newId); await settings.save(); }
                return interaction.editReply({ content: `✅ Added <@${newId}> as Co-Owner.` });
            }

            if (interaction.customId === 'modal_remove_owner') {
                const remId = interaction.fields.getTextInputValue('rem_owner_id').trim();
                let settings = await BotSettings.findOne({ settingKey: 'global' });
                if (settings) { settings.coOwners = settings.coOwners.filter(id => id !== remId); await settings.save(); }
                return interaction.editReply({ content: `✅ Removed <@${remId}>.` });
            }

            if (interaction.customId === 'modal_spark_center_setup') {
                const chanId = interaction.fields.getTextInputValue('spark_chan_id').trim();
                await GuildConfig.findOneAndUpdate({ guildId }, { sparkCenterChannel: chanId }, { upsert: true });
                return interaction.editReply({ content: `✅ Spark Center linked to <#${chanId}>.` });
            }

            if (interaction.customId === 'modal_welcome') {
                await GuildConfig.findOneAndUpdate({ guildId }, {
                    welcomeTitle: interaction.fields.getTextInputValue('w_title'),
                    welcomeMessage: interaction.fields.getTextInputValue('w_msg'),
                    welcomeChannel: interaction.fields.getTextInputValue('w_chan'),
                    welcomeThumbnail: interaction.fields.getTextInputValue('w_thumb') || ''
                }, { upsert: true });
                return interaction.editReply({ content: '✅ Welcome settings saved!' });
            }
        }
    } catch (err) {
        console.error("Interaction Error:", err);
    }
});

setInterval(async () => {
    try {
        const stats = await GuildConfig.find({ onlinePlayersChan: { $ne: null } });
        for (const config of stats) {
            const g = await client.guilds.fetch(config.guildId).catch(() => null);
            if (!g) continue;
            const mems = await g.members.fetch({ withPresences: true }).catch(() => null);
            const on = mems ? mems.filter(m => m.presence && m.presence.status !== 'offline').size : 0;
            if (config.onlinePlayersChan) {
                const chan = g.channels.cache.get(config.onlinePlayersChan);
                if (chan) await chan.setName(`🟢 Online Players: ${on}`).catch(() => null);
            }
        }
    } catch (e) {}
}, 300000);

client.login(process.env.DISCORD_TOKEN);
                    
