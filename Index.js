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
const guildInvites = new Map();

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
    console.log(`🔥 [SPARK CORE] ${client.user.tag} online!`);
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
    if (settings && settings.coOwners && settings.coOwners.includes(userId)) return true;
    return false;
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (!message.guild && message.content.toLowerCase() === '!panel') {
        if (!(await isAuthorizedOwner(message.author.id))) {
            return message.reply("❌ **Access Denied:** You are not authorized.");
        }

        const embed = new EmbedBuilder()
            .setTitle('💎 SPARK ELITE DEVELOPER COMMAND CENTER')
            .setDescription('Welcome back, Chief. Select an operational module below to control active nodes or manage sub-owners.')
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
        } catch (err) {}
    }

    if (message.guild) {
        try {
            const config = await GuildConfig.findOne({ guildId: message.guild.id });
            if (config && config.sparkCenterChannel && message.channel.id === config.sparkCenterChannel) {
                const settings = await BotSettings.findOne({ settingKey: 'global' });
                const recipientIds = [PRIMARY_OWNER_ID, ...(settings && settings.coOwners ? settings.coOwners : [])];

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
        const userMessage = message.content.toLowerCase();
        try {
            const config = await GuildConfig.findOne({ guildId: message.guild.id });
            if (!config || !config.autoResponses || config.autoResponses.length === 0) return;

            const matched = config.autoResponses.find(r => {
                const regex = new RegExp(`\\b${r.trigger}\\b`, 'i');
                return regex.test(userMessage);
            });
            
            if (matched && matched.replyText) {
                let replyText = matched.replyText.replace(/\\n/g, '\n');
                const responseEmbed = new EmbedBuilder().setColor("Blue").setTimestamp();

                const urlRegex = /(https?:\/\/[^\s]+)/g;
                const foundUrls = replyText.match(urlRegex);

                if (foundUrls && foundUrls.length > 0) {
                    const imageUrl = foundUrls.find(url => url.match(/\.(jpeg|jpg|gif|png|webp)$/i) || url.includes('cdn.discordapp.com') || url.includes('media.discordapp.net'));
                    if (imageUrl) {
                        responseEmbed.setImage(imageUrl);
                        replyText = replyText.replace(imageUrl, '').trim();
                    }
                }

                if (replyText.length > 0) responseEmbed.setDescription(replyText);
                return message.reply({ embeds: [responseEmbed] });
            }
        } catch (err) {}
    }
});

client.on('guildMemberAdd', async (member) => {
    try {
        const config = await GuildConfig.findOne({ guildId: member.guild.id });
        if (config && config.welcomeChannel) {
            const channel = member.guild.channels.cache.get(config.welcomeChannel);
            if (channel) {
                let descText = config.welcomeMessage || 'Welcome!';
                descText = descText
                    .replace(/{user}/g, `${member}`)
                    .replace(/{{User.Mention}}/g, `${member}`)
                    .replace(/{{user.mention}}/g, `${member}`)
                    .replace(/{memberCount}/g, `${member.guild.memberCount}`);
                
                const createdAtFormatted = member.user.createdAt.toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'long', year: 'numeric'
                });
                descText = descText.replace(/{accountCreated}/g, createdAtFormatted);
                
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
            const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
            const isFake = accountAgeDays < 7;

            const invData = await InviteData.findOne({ guildId: member.guild.id, userId: inviter.id }) || new InviteData({ guildId: member.guild.id, userId: inviter.id });

            if (isFake) invData.permFake += 1;
            else invData.permRegular += 1;

            if (invData.isEventActive) {
                if (isFake) invData.eventFake += 1;
                else invData.eventRegular += 1;
            }

            await invData.save();

            if (config && config.inviteLogChannel) {
                const logChan = member.guild.channels.cache.get(config.inviteLogChannel);
                if (logChan) {
                    const lifetimeTotal = invData.permRegular - invData.permLeaves - invData.permFake;
                    const logCard = `👤 Member     : ${member.user.tag}\n🔗 Invited By : ${inviter.tag}\n--------------------------------\n📊 Lifetime Stats: ${lifetimeTotal} Total (${invData.permRegular} Reg | ${invData.permLeaves} Leaves)`;
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
                const list = settings.coOwners && settings.coOwners.length > 0 ? settings.coOwners.map(id => `• <@${id}> (\`${id}\`)`).join('\n') : 'No co-owners assigned.';
                const embed = new EmbedBuilder().setTitle('👥 Co-Owner Management').setDescription(`**Primary Owner:** <@${PRIMARY_OWNER_ID}>\n\n**Current Co-Owners:**\n${list}`).setColor('#fbee5c');
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
                const embed = new EmbedBuilder().setTitle('💎 SPARK ELITE DEVELOPER COMMAND CENTER').setDescription('Select an operational module below.').setColor('#2b2d31');
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('dev_btn_servers').setLabel('Manage Servers').setStyle(ButtonStyle.Primary).setEmoji('🌐'),
                    new ButtonBuilder().setCustomId('dev_btn_coowners').setLabel('Manage Co-Owners').setStyle(ButtonStyle.Secondary).setEmoji('👥')
                );
                return interaction.update({ embeds: [embed], components: [row] });
            }
        }

        if (interaction.isModalSubmit() && !interaction.guild) {
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
                if (!settings.coOwners.includes(newId)) { settings.coOwners.push(newId); await settings.save(); }
                return interaction.editReply({ content: `✅ Successfully added <@${newId}> as a Co-Owner.` });
            }
            if (interaction.customId === 'modal_remove_owner') {
                const remId = interaction.fields.getTextInputValue('rem_owner_id').trim();
                let settings = await BotSettings.findOne({ settingKey: 'global' });
                if (settings && settings.coOwners) {
                    settings.coOwners = settings.coOwners.filter(id => id !== remId);
                    await settings.save();
                }
                return interaction.editReply({ content: `✅ Successfully removed <@${remId}> from Co-Owners.` });
            }
            return;
        }

        if (!guildId) return;

                if (interaction.isButton()) {
            if (interaction.customId === 'setup_spark_center') {
                const modal = new ModalBuilder().setCustomId('modal_spark_center_setup').setTitle('Setup Spark Center Bridge');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('spark_chan_id').setLabel('Target Channel ID (Admin Only)').setRequired(true).setStyle(TextInputStyle.Short)));
                return interaction.showModal(modal);
            }

            if (interaction.customId === 'btn_inv_start') {
                await InviteData.updateMany({ guildId }, { isEventActive: true, eventRegular: 0, eventLeaves: 0, eventFake: 0 });
                return await interaction.reply({ content: '🚀 **Event Tracker Started!** Counting new joins from now.', ephemeral: true });
            }

            if (interaction.customId === 'btn_inv_reset') {
                await InviteData.updateMany({ guildId }, { eventRegular: 0, eventLeaves: 0, eventFake: 0 });
                return await interaction.reply({ content: '🔄 **Event Data Reset to 0!**', ephemeral: true });
            }

            if (interaction.customId === 'btn_inv_guild_lb') {
                await interaction.deferReply();
                const fetchedInvites = await interaction.guild.invites.fetch().catch(() => null);
                let inviteMap = new Map();
                if (fetchedInvites) {
                    fetchedInvites.forEach(inv => {
                        if (inv.inviter) {
                            const prev = inviteMap.get(inv.inviter.id) || 0;
                            inviteMap.set(inv.inviter.id, prev + inv.uses);
                        }
                    });
                }
                const dbData = await InviteData.find({ guildId });
                dbData.forEach(d => {
                    const dbTotal = d.permRegular - d.permLeaves - d.permFake;
                    const inviterUses = inviteMap.get(d.userId) || 0;
                    inviteMap.set(d.userId, Math.max(dbTotal, inviterUses));
                });
                const sorted = Array.from(inviteMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
                if (sorted.length === 0) return await interaction.followUp({ content: '❌ No active invite links found in this server.' });
                let str = '```text\n';
                const medals = ['🥇', '🥈', '🥉', '🎖️', '🎖️', '🎖️', '🎖️', '🎖️', '🎖️', '🎖️'];
                for (let i = 0; i < sorted.length; i++) {
                    const u = await interaction.client.users.fetch(sorted[i][0]).catch(() => null);
                    str += `${medals[i]} ${i+1}. ${(u ? u.username : 'Unknown').padEnd(12, ' ')} • ${sorted[i][1]} Invites\n`;
                }
                str += '```';
                const embed = new EmbedBuilder().setTitle('🏆 GUILD LIFETIME LEADERBOARD').setDescription(str).setColor('#00FF00');
                return await interaction.followUp({ embeds: [embed] });
            }
            
            if (interaction.customId === 'btn_inv_event_lb') {
                await interaction.deferReply();
                const allData = await InviteData.find({ guildId });
                const sorted = allData.map(d => ({ userId: d.userId, total: d.eventRegular - d.eventLeaves - d.eventFake, reg: d.eventRegular, lvs: d.eventLeaves }))
                    .sort((a,b) => b.total - a.total).slice(0, 10);
                let str = '```text\n';
                const medals = ['🥇', '🥈', '🥉', '🎖️', '🎖️', '🎖️', '🎖️', '🎖️', '🎖️', '🎖️'];
                for (let i = 0; i < sorted.length; i++) {
                    const u = await interaction.client.users.fetch(sorted[i].userId).catch(() => null);
                    str += `${medals[i]} ${i+1}. ${(u ? u.username : 'Unknown').padEnd(12, ' ')} • ${sorted[i].total} Total (${sorted[i].reg} Reg | ${sorted[i].lvs} Lvs)\n`;
                }
                str += '```';
                const embed = new EmbedBuilder().setTitle('⚡ ACTIVE EVENT LEADERBOARD').setDescription(str).setColor('#FFCC00');
                return await interaction.followUp({ embeds: [embed] });
            }

            if (interaction.customId === 'btn_inv_logs_cfg') {
                const modal = new ModalBuilder().setCustomId('modal_inv_logs').setTitle('Setup Invite Log Channel');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inv_log_input').setLabel('Invite Logs Channel ID').setRequired(true).setStyle(TextInputStyle.Short)));
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'setup_store_cfg') {
                const modal = new ModalBuilder().setCustomId('modal_store_cfg').setTitle('1. Basic Setup & Stock');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cfg_name').setLabel('Server Name').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cfg_role').setLabel('Admin Role ID').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cfg_logs').setLabel('Logs Channel ID').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cfg_items').setLabel('Items & Stock Setup').setRequired(true).setStyle(TextInputStyle.Paragraph))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'setup_store_visual') {
                const modal = new ModalBuilder().setCustomId('modal_store_visual').setTitle('2. Visual Panel Deploy');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pnl_title').setLabel('Embed Header Title').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pnl_desc').setLabel('Embed Description Text').setRequired(true).setStyle(TextInputStyle.Paragraph)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pnl_banner').setLabel('Banner Image CDN Link').setRequired(false).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pnl_chan').setLabel('Target Channel ID').setRequired(true).setStyle(TextInputStyle.Short))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'setup_store_execution') {
                const modal = new ModalBuilder().setCustomId('modal_store_execution').setTitle('3. Console & Commands');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('exe_console').setLabel('Console Channel ID').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('exe_cmds').setLabel('Command Mappings').setRequired(true).setStyle(TextInputStyle.Paragraph))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'setup_store_dms') {
                const store = await GuildStore.findOne({ guildId });
                const modal = new ModalBuilder().setCustomId('modal_store_dms').setTitle('4. DM Alert Templates');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dm_app').setLabel('Approved DM Text').setRequired(true).setStyle(TextInputStyle.Paragraph).setValue(store?.dmApproved || "📦 Order Approved")),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dm_rej').setLabel('Rejected DM Text').setRequired(true).setStyle(TextInputStyle.Paragraph).setValue(store?.dmRejected || "❌ Order Rejected")),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dm_pend').setLabel('Pending Reminder DM Text').setRequired(true).setStyle(TextInputStyle.Paragraph).setValue(store?.dmPendingReminder || "⏰ Reminder"))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'setup_stats_btn') {
                const modal = new ModalBuilder().setCustomId('modal_stats_setup').setTitle('📊 Server Stats Setup');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stats_total_input').setLabel('Total Members Voice ID').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stats_online_input').setLabel('Online Players Voice ID').setRequired(true).setStyle(TextInputStyle.Short))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'setup_youtube_btn') {
                const modal = new ModalBuilder().setCustomId('youtube_modal_submit').setTitle('📺 YouTube System Setup');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('yt_channel_id_input').setLabel('YouTube Channel ID').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('yt_live_chan_input').setLabel('Live Alert Channel ID').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('yt_upload_chan_input').setLabel('Upload Alert Channel ID').setRequired(true).setStyle(TextInputStyle.Short))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'setup_welcome_btn') {
                const modal = new ModalBuilder().setCustomId('modal_welcome').setTitle('Welcome Configuration');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('w_title').setLabel('Embed Title').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('w_msg').setLabel('Message').setRequired(true).setStyle(TextInputStyle.Paragraph)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('w_chan').setLabel('Welcome Channel ID').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('w_thumb').setLabel('Banner Image URL').setRequired(false).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('w_dm').setLabel('DM Text').setRequired(false).setStyle(TextInputStyle.Paragraph))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'setup_tickets_btn' || interaction.customId === 'setup_ticket_btn') {
                const modal = new ModalBuilder().setCustomId('modal_ticket').setTitle('Advanced Ticket Setup');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t_desc').setLabel('Description').setRequired(true).setStyle(TextInputStyle.Paragraph)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t_cats').setLabel('Categories (Comma separated)').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t_parent').setLabel('Category ID').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t_logs').setLabel('LOGS_ID, STAFF_ROLE_ID').setRequired(true).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t_msg').setLabel('Welcome Message').setRequired(true).setStyle(TextInputStyle.Paragraph))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'setup_auto_btn') {
                const modal = new ModalBuilder().setCustomId('modal_auto_response').setTitle('💬 Auto Response Core');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('auto_input_box').setLabel('Format: trigger:reply || trigger:reply').setRequired(true).setStyle(TextInputStyle.Paragraph)));
                return await interaction.showModal(modal);
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
                await interaction.reply('🔒 Closing channel in 5 seconds...');
                const fetched = await interaction.channel.messages.fetch({ limit: 100 });
                let txt = '';
                [...fetched.values()].reverse().forEach(m => { txt += `[${m.createdAt.toLocaleString()}] ${m.author.tag}: ${m.content}\n`; });
                const attachment = new AttachmentBuilder(Buffer.from(txt, 'utf-8'), { name: 'transcript.txt' });
                if (config && config.ticketLogs) {
                    const c = interaction.guild.channels.cache.get(config.ticketLogs);
                    if (c) await c.send({ content: `🗑️ Closed by ${interaction.user.tag}`, files: [attachment] }).catch(() => null);
                }
                setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
            }

            if (interaction.customId.startsWith('btn_trigger_checkout_')) {
                const itemObjectId = interaction.customId.replace('btn_trigger_checkout_', '');
                const playerModal = new ModalBuilder().setCustomId(`modal_player_checkout_${itemObjectId}`).setTitle('Player Verification');
                playerModal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('player_ign').setLabel('Enter In-Game Username (IGN)').setRequired(true).setStyle(TextInputStyle.Short)));
                return await interaction.showModal(playerModal);
            }

            const ticket = await OrderTicket.findOne({ channelId: interaction.channel.id });
            if (ticket) {
                const store = await GuildStore.findOne({ guildId });
                if (interaction.customId === 'btn_order_approve') {
                    await interaction.deferReply();
                    const storeItem = store?.items.find(i => i.name.toLowerCase() === ticket.itemName.toLowerCase());
                    if (store?.consoleChannelId && storeItem && storeItem.command) {
                        const consoleChan = interaction.guild.channels.cache.get(store.consoleChannelId);
                        if (consoleChan) {
                            const finalCmd = storeItem.command.replace(/{name}/g, ticket.buyerIGN);
                            await consoleChan.send({ content: finalCmd });
                        }
                    }
                    const buyer = await interaction.client.users.fetch(ticket.buyerId).catch(() => null);
                    if (buyer) {
                        const msg = (store?.dmApproved || "📦 Order Approved!").replace(/{{server}}/g, store?.serverName || "Server").replace(/{{item}}/g, ticket.itemName);
                        await buyer.send({ content: msg }).catch(() => null);
                    }
                    await interaction.editReply({ content: '✅ **Order Approved!** Command executed.' });
                    return await interaction.message.edit({ components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_order_delete').setLabel('Delete Room').setStyle(ButtonStyle.Secondary))] });
                }

                if (interaction.customId === 'btn_order_reject') {
                    await interaction.deferReply();
                    const buyer = await interaction.client.users.fetch(ticket.buyerId).catch(() => null);
                    if (buyer) {
                        const msg = (store?.dmRejected || "❌ Order Rejected!").replace(/{{server}}/g, store?.serverName || "Server").replace(/{{item}}/g, ticket.itemName);
                        await buyer.send({ content: msg }).catch(() => null);
                    }
                    await interaction.editReply({ content: '🚫 **Order Rejected!** Buyer notified.' });
                    return await interaction.message.edit({ components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_order_delete').setLabel('Delete Room').setStyle(ButtonStyle.Secondary))] });
                }

                if (interaction.customId === 'btn_order_delete') {
                    await interaction.reply({ content: '🗑️ Closing room permanently in 5 seconds...' });
                    await OrderTicket.deleteOne({ channelId: interaction.channel.id });
                    setTimeout(() => interaction.channel.delete().catch(() => null), 5000);
                }
            }
        }

        if (interaction.isModalSubmit()) {
            await interaction.deferReply({ ephemeral: true });

            if (interaction.customId === 'modal_spark_center_setup') {
                const chanId = interaction.fields.getTextInputValue('spark_chan_id').trim();
                await GuildConfig.findOneAndUpdate({ guildId }, { sparkCenterChannel: chanId }, { upsert: true });
                return interaction.editReply({ content: `✅ **Spark Center** successfully linked to <#${chanId}>.` });
            }

            if (interaction.customId === 'modal_inv_logs') {
                const channelId = interaction.fields.getTextInputValue('inv_log_input').trim();
                await GuildConfig.findOneAndUpdate({ guildId }, { inviteLogChannel: channelId }, { upsert: true });
                return await interaction.editReply({ content: `✅ **Saved!** Invite logs channel updated to <#${channelId}>.` });
            }

            if (interaction.customId === 'modal_ticket') {
                const logsData = interaction.fields.getTextInputValue('t_logs').split(',');
                const cats = interaction.fields.getTextInputValue('t_cats').split(',').map(c => c.trim());
                const descData = interaction.fields.getTextInputValue('t_desc').split('||');
                const panelDescription = descData[0]?.trim();
                const panelImage = descData[1]?.trim() || '';

                await GuildConfig.findOneAndUpdate({ guildId }, {
                    ticketDescription: panelDescription,
                    ticketParent: interaction.fields.getTextInputValue('t_parent'),
                    ticketLogs: logsData[0]?.trim(),
                    ticketRole: logsData[1]?.trim(),
                    ticketMessage: interaction.fields.getTextInputValue('t_msg').trim()
                }, { upsert: true, new: true });

                const embed = new EmbedBuilder().setTitle('🎫 Create a Ticket').setDescription(panelDescription).setColor('#5865F2');
                if (panelImage && panelImage.startsWith('http')) embed.setImage(panelImage);

                const options = cats.map(cat => ({ label: cat, value: cat }));
                const menu = new StringSelectMenuBuilder().setCustomId('ticket_select').addOptions(options);
                await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
                return await interaction.editReply({ content: '✅ Deployed Support Tickets Panel Successfully!' });
            }

            if (interaction.customId === 'modal_stats_setup') {
                const tId = interaction.fields.getTextInputValue('stats_total_input').trim();
                const oId = interaction.fields.getTextInputValue('stats_online_input').trim();
                await GuildConfig.findOneAndUpdate({ guildId }, { totalMembersChan: tId, onlinePlayersChan: oId }, { upsert: true });
                return await interaction.editReply({ content: '✅ **Saved Stats Configuration Successfully!**' });
            }

            if (interaction.customId === 'youtube_modal_submit') {
                const ytId = interaction.fields.getTextInputValue('yt_channel_id_input').trim();
                const lId = interaction.fields.getTextInputValue('yt_live_chan_input').trim();
                const uId = interaction.fields.getTextInputValue('yt_upload_chan_input').trim();
                await GuildConfig.findOneAndUpdate({ guildId }, { ytChannelId: ytId, ytLiveChannel: lId, ytUploadChannel: uId }, { upsert: true });
                return await interaction.editReply({ content: '✅ **Connected YouTube System Successfully!**' });
            }

            if (interaction.customId === 'modal_welcome') {
                await GuildConfig.findOneAndUpdate({ guildId }, {
                    welcomeTitle: interaction.fields.getTextInputValue('w_title'),
                    welcomeMessage: interaction.fields.getTextInputValue('w_msg'),
                    welcomeChannel: interaction.fields.getTextInputValue('w_chan'),
                    welcomeThumbnail: interaction.fields.getTextInputValue('w_thumb') || '',
                    welcomeDm: interaction.fields.getTextInputValue('w_dm') || ''
                }, { upsert: true });
                return await interaction.editReply({ content: '✅ Saved Welcome Settings!' });
            }

            if (interaction.customId === 'modal_store_cfg') {
                const serverName = interaction.fields.getTextInputValue('cfg_name');
                const adminRoleId = interaction.fields.getTextInputValue('cfg_role');
                const logsChannelId = interaction.fields.getTextInputValue('cfg_logs');
                const bulkInput = interaction.fields.getTextInputValue('cfg_items');
                const categories = [];
                const items = [];
                if (bulkInput) {
                    const categoryBlocks = bulkInput.split('||');
                    categoryBlocks.forEach(block => {
                        const parts = block.split(':');
                        if (parts.length < 2) return;
                        const catName = parts[0].trim();
                        const itemsRaw = parts[1].split(',');
                        if (!categories.includes(catName) && catName) categories.push(catName);
                        itemsRaw.forEach(iRaw => {
                            const itemParts = iRaw.split('-');
                            if (itemParts.length < 2) return;
                            const iName = itemParts[0].trim();
                            const iPrice = parseInt(itemParts[1].replace(/[^0-9]/g, ''), 10);
                            if (iName && !isNaN(iPrice)) {
                                items.push({ category: catName, name: iName, price: iPrice, command: '' });
                            }
                        });
                    });
                }
                await GuildStore.findOneAndUpdate({ guildId }, { serverName, adminRoleId, logsChannelId, categories, items }, { upsert: true });
                return await interaction.editReply({ content: '✅ **Button 1 Saved!** Stock & Categories updated.' });
            }

            if (interaction.customId === 'modal_store_visual') {
                const panelTitle = interaction.fields.getTextInputValue('pnl_title');
                const panelDescription = interaction.fields.getTextInputValue('pnl_desc');
                const panelBanner = interaction.fields.getTextInputValue('pnl_banner');
                const targetChanId = interaction.fields.getTextInputValue('pnl_chan');
                const store = await GuildStore.findOneAndUpdate({ guildId }, { panelTitle, panelDescription, panelBanner }, { upsert: true, new: true });
                const targetChannel = interaction.guild.channels.cache.get(targetChanId);
                if (!targetChannel) return await interaction.editReply({ content: '❌ Invalid Destination Channel ID!' });
                const embed = new EmbedBuilder().setTitle(panelTitle).setDescription(panelDescription).setColor('#5865F2').setTimestamp();
                if (panelBanner && panelBanner.startsWith('http')) embed.setImage(panelBanner);
                if (!store.categories || store.categories.length === 0) {
                    return await interaction.editReply({ content: '❌ Please setup Button 1 (Stock) first!' });
                }
                const options = store.categories.map(cat => ({ label: cat, value: `store_cat_${cat}` }));
                const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('store_category_select').setPlaceholder('🗂️ Choose a Category...').addOptions(options));
                await targetChannel.send({ embeds: [embed], components: [row] });
                return await interaction.editReply({ content: `🚀 Store deployed in <#${targetChanId}>.` });
            }

            if (interaction.customId === 'modal_store_execution') {
                const consoleChannelId = interaction.fields.getTextInputValue('exe_console');
                const mappingsRaw = interaction.fields.getTextInputValue('exe_cmds').split('||').map(m => m.trim());
                const store = await GuildStore.findOne({ guildId });
                if (!store) return await interaction.editReply({ content: '❌ Setup Button 1 first!' });
                store.consoleChannelId = consoleChannelId;
                mappingsRaw.forEach(mapping => {
                    const parts = mapping.split(':');
                    const iName = parts[0]?.trim();
                    const iCmd = parts[1]?.trim();
                    const matchedItem = store.items.find(i => i.name.toLowerCase() === iName.toLowerCase());
                    if (matchedItem) matchedItem.command = iCmd;
                });
                await store.save();
                return await interaction.editReply({ content: '⚙️ **Button 3 Complete!** Commands mapped.' });
            }

            if (interaction.customId === 'modal_store_dms') {
                const dmApproved = interaction.fields.getTextInputValue('dm_app');
                const dmRejected = interaction.fields.getTextInputValue('dm_rej');
                const dmPendingReminder = interaction.fields.getTextInputValue('dm_pend');
                await GuildStore.findOneAndUpdate({ guildId }, { dmApproved, dmRejected, dmPendingReminder }, { upsert: true });
                return await interaction.editReply({ content: '✅ Custom DM Alert templates saved.' });
            }

            if (interaction.customId === 'modal_auto_response') {
                const bulkInput = interaction.fields.getTextInputValue('auto_input_box');
                const autoResponses = [];
                if (bulkInput && bulkInput.trim().length > 0) {
                    const responseBlocks = bulkInput.split('||');
                    responseBlocks.forEach(block => {
                        const firstColonIndex = block.indexOf(':');
                        if (firstColonIndex === -1) return;
                        const triggerWord = block.substring(0, firstColonIndex).trim().toLowerCase();
                        const replyString = block.substring(firstColonIndex + 1).trim();
                        if (triggerWord && replyString) {
                            autoResponses.push({ trigger: triggerWord, replyText: replyString });
                        }
                    });
                }
                await GuildConfig.findOneAndUpdate({ guildId }, { autoResponses }, { upsert: true });
                return await interaction.editReply({ content: '✅ Custom auto-responses setup live!' });
            }

            if (interaction.customId.startsWith('modal_player_checkout_')) {
                const itemUniqueId = interaction.customId.replace('modal_player_checkout_', '');
                const buyerIGN = interaction.fields.getTextInputValue('player_ign');
                const store = await GuildStore.findOne({ guildId });
                const item = store?.items.find(i => i._id.toString() === itemUniqueId);
                if (!item) return await interaction.editReply({ content: '❌ Item expired or deleted.' });
                const ticketRoom = await interaction.guild.channels.create({
                    name: `order-${interaction.user.username}`,
                    permissionOverwrites: [
                        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                        ...(store.adminRoleId ? [{ id: store.adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : [])
                    ]
                });
                await OrderTicket.create({ guildId, channelId: ticketRoom.id, buyerId: interaction.user.id, buyerIGN, itemName: item.name, itemPrice: item.price, itemCategory: item.category });
                const embed = new EmbedBuilder().setTitle('📥 NEW INBOUND ORDER').setColor('#FFCC00').addFields(
                    { name: '👤 Buyer Account', value: `${interaction.user}`, inline: true },
                    { name: '🎮 IGN', value: `\`${buyerIGN}\``, inline: true },
                    { name: '📦 Selected Package', value: `**${item.name}** (${item.category})`, inline: false },
                    { name: '💰 Price', value: `\`${item.price} INR\``, inline: true }
                ).setTimestamp();
                const controlRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_order_approve').setLabel('Approve Order').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('btn_order_reject').setLabel('Reject Order').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('btn_order_delete').setLabel('Delete Room').setStyle(ButtonStyle.Secondary)
                );
                await ticketRoom.send({ content: `${interaction.user} | <@&${store.adminRoleId}>`, embeds: [embed], components: [controlRow] });
                return await interaction.editReply({ content: `🎯 Order channel opened: ${ticketRoom}` });
            }
        }

        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'ticket_select') {
                const config = await GuildConfig.findOne({ guildId });
                if (!config) return;
                const selectedCategory = interaction.values[0]; 
                const name = `ticket-${interaction.user.username.toLowerCase()}`;
                if (interaction.guild.channels.cache.find(c => c.name === name)) {
                    return await interaction.reply({ content: '❌ You already have an active ticket.', ephemeral: true });
                }
                await interaction.deferReply({ ephemeral: true });
                const ch = await interaction.guild.channels.create({
                    name, parent: config.ticketParent || null,
                    permissionOverwrites: [
                        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                        ...(config.ticketRole ? [{ id: config.ticketRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : [])
                    ]
                });
                let parsedMessage = config.ticketMessage || 'Thank you for contacting support.';
                parsedMessage = parsedMessage.replace(/{user}/g, `${interaction.user}`).replace(/{{User.Mention}}/g, `${interaction.user}`).replace(/{{user.mention}}/g, `${interaction.user}`);
                if (config.ticketRole) parsedMessage = `${parsedMessage}\n\n🔔 **Staff Notification:** <@&${config.ticketRole}>`;
                const embed = new EmbedBuilder().setTitle('🎫 Ticket Support Terminal').setDescription(parsedMessage).addFields({ name: '🗂️ Category', value: `\`${selectedCategory}\``, inline: false }).setColor('#00ffcc');
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger));
                await ch.send({ embeds: [embed], components: [row] });
                return await interaction.editReply({ content: `Generated: ${ch}` });
            }

            const store = await GuildStore.findOne({ guildId });
            if (!store) return;

            if (interaction.customId === 'store_category_select') {
                const chosenCat = interaction.values[0].replace('store_cat_', '');
                const filteredItems = store.items.filter(i => i.category === chosenCat);
                if (filteredItems.length === 0) return await interaction.reply({ content: '❌ No items in this category.', ephemeral: true });
                const options = filteredItems.map(i => ({ label: `${i.name} - ${i.price} INR`, value: `store_itm_${i._id.toString()}` }));
                const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('store_item_select').setPlaceholder('📦 Choose item to buy...').addOptions(options));
                return await interaction.reply({ content: `📁 Category: **${chosenCat}**`, components: [row], ephemeral: true });
            }

            if (interaction.customId === 'store_item_select') {
                const itemDbId = interaction.values[0].replace('store_itm_', '');
                const targetItem = store.items.find(i => i._id.toString() === itemDbId);
                const buyRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`btn_trigger_checkout_${itemDbId}`).setLabel(`Order: ${targetItem.name} (${targetItem.price} INR)`).setStyle(ButtonStyle.Primary));
                return await interaction.reply({ content: `🛒 Buy **${targetItem.name}**? Click checkout below:`, components: [buyRow], ephemeral: true });
            }
        }
    } catch (err) {
        console.error("Interaction Exception Handled:", err);
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

        const twelveHoursAgo = new Date(Date.now() - (12 * 60 * 60 * 1000));
        const pendingTickets = await OrderTicket.find({ lastReminderSent: { $lte: twelveHoursAgo } });
        for (const ticket of pendingTickets) {
            const store = await GuildStore.findOne({ guildId: ticket.guildId });
            if (!store) continue;
            const buyer = await client.users.fetch(ticket.buyerId).catch(() => null);
            if (buyer) {
                const msg = (store.dmPendingReminder || "⏰ **Pending Order Reminder [{{server}}]!** Your order for **{{item}}** is still pending.")
                    .replace(/{{server}}/g, store.serverName)
                    .replace(/{{item}}/g, ticket.itemName);
                await buyer.send({ content: msg }).catch(() => null);
                ticket.lastReminderSent = new Date();
                await ticket.save();
            }
        }

        const yts = await GuildConfig.find({ ytChannelId: { $ne: null } });
        for (const config of yts) {
            const feed = await parser.parseURL(`https://www.youtube.com/feeds/videos.xml?channel_id=${config.ytChannelId}`).catch(() => null);
            if (!feed || !feed.items || feed.items.length === 0) continue;
            const item = feed.items[0];
            const vId = item.id.replace('yt:video:', '');
            if (config.ytLastVideoId === vId) continue;
            config.ytLastVideoId = vId;
            await config.save();
            const g = await client.guilds.fetch(config.guildId).catch(() => null);
            if (!g) continue;
            const isLive = item.title.toLowerCase().includes('live') || item.title.toLowerCase().includes('stream');
            const target = isLive ? config.ytLiveChannel : config.ytUploadChannel;
            if (target) {
                const c = g.channels.cache.get(target);
                if (c) {
                    const msg = isLive ? `🔴 **LIVE NOW!** \n📢 **${item.title}**\n👉 ${item.link} @everyone` : `🎬 **NEW UPLOAD!** \n📢 **${item.title}**\n👉 ${item.link} @everyone`;
                    await c.send({ content: msg }).catch(() => null);
                }
            }
        }
    } catch (e) { console.error("Background Loop Exception:", e); }
}, 300000);

client.login(process.env.DISCORD_TOKEN);
