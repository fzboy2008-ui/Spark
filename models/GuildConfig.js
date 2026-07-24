const mongoose = require('mongoose');

const GuildConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    welcomeTitle: { type: String, default: '' },
    welcomeMessage: { type: String, default: '' },
    welcomeChannel: { type: String, default: '' },
    welcomeThumbnail: { type: String, default: '' },
    
    inviteLogChannel: { type: String, default: '' },
    sparkCenterChannel: { type: String, default: '' }, // Admin-only support bridge channel

    ticketDescription: { type: String, default: '' },
    ticketParent: { type: String, default: '' },
    ticketLogs: { type: String, default: '' },
    ticketRole: { type: String, default: '' },   
    ticketMessage: { type: String, default: '' },

    totalMembersChan: { type: String, default: null },
    onlinePlayersChan: { type: String, default: null },

    ytChannelId: { type: String, default: null },
    ytLiveChannel: { type: String, default: null },
    ytUploadChannel: { type: String, default: null },
    ytLastVideoId: { type: String, default: null },

    autoResponses: [
        {
            trigger: { type: String, lowercase: true, trim: true },
            replyText: { type: String }
        }
    ]
});

module.exports = mongoose.model('GuildConfig', GuildConfigSchema);
