const { Client, GatewayIntentBits, ChannelType } = require("discord.js");
const ipc = require('node-ipc');	   

let config = require("./config.json");

const discord = new Client({intents: [GatewayIntentBits.DirectMessages], partials: ["MESSAGE", "CHANNEL", "REACTION"]});

discord.login(config.DISCORD_BOT_TOKEN);

ipc.config.id = "contactor";
ipc.config.retry = 1500;
ipc.config.silent = true;

ipc.serveNet(() => ipc.server.on('alert', (message, socket) => {
    sendMessage("maxper", message);
}));
ipc.server.start();

const reloadModule = (moduleName) => {
    delete require.cache[require.resolve(moduleName)]
    console.log('Reloading ' + moduleName + "...");
    return require(moduleName)
}

let contacts = {};
const setup = async() => {
    config = reloadModule("./config.json");

    contacts = {};
    await Promise.all(config.CONTACTS.map(async contact => {
        contacts[contact.nickname] = await discord.users.fetch(contact.discordId, false);
    }));

    console.log("Contacts: ", contacts);
    console.log("Setup done.");

    sendMessage("maxper", "[Contactor] Setup done.");
};

const OnReceiveDiscordMessage = (discordId, message) => {
    if (!ContactByDiscordId(discordId)) return;
    const nickname = ContactByDiscordId(discordId).nickname;

    if(message == "ping") sendMessage(nickname, "pong");
    else if(message == "reload") setup();
    else if(message == "nickname") sendMessage(nickname, nickname);

    console.log(nickname, message);
};

const ContactByDiscordId = (discordId) => {
    return config.CONTACTS.find(x => x.discordId == discordId);
};

const sendMessage = (nickname, message) => {
    if (!contacts[nickname]) return;

    contacts[nickname].send(message);
};

discord.on("ready", async() => {
    discord.on("messageCreate", async message => {
        if (message.author.bot) return;
        if (message.channel.type != ChannelType.DM) return;

        OnReceiveDiscordMessage(message.author.id, message.content);
    });
    
    await setup();
});