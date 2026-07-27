const { GuildConfig } = require('../models/GuildConfig');
const { GuildStore, OrderTicket } = require('../models/GuildStore');
const Parser = require('rss-parser');
const parser = new Parser();

module.exports = (client) => {
    setInterval(async () => {
        try {
            // Stats & YouTube background checks
            const stats = await GuildConfig.find({ totalMembersChan: { $ne: null } });
            for (const config of stats) {
                const g = await client.guilds.fetch(config.guildId).catch(() => null);
                if (g && config.totalMembersChan) {
                    const chan = g.channels.cache.get(config.totalMembersChan);
                    if (chan) await chan.setName(`🪐 Total Members: ${g.memberCount}`).catch(() => null);
                }
            }
        } catch (e) { console.error("Background Loop Exception:", e); }
    }, 300000);
};
