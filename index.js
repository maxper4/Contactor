const { Client, GatewayIntentBits, ChannelType } = require("discord.js");
const ipc = require('node-ipc');	   

let config = require("./config.json");

const discord = new Client({intents: [GatewayIntentBits.DirectMessages], partials: ["MESSAGE", "CHANNEL", "REACTION"]});

discord.login(config.DISCORD_BOT_TOKEN);

ipc.config.id = "contactor";
ipc.config.retry = 1500;
ipc.config.silent = true;

ipc.serveNet(() => ipc.server.on('alert', (message, socket) => {
    toContactOnAlert.forEach(nickname => {
        sendMessage(nickname, message);
    });
}));
ipc.server.start();

const reloadModule = (moduleName) => {
    delete require.cache[require.resolve(moduleName)]
    console.log('Reloading ' + moduleName + "...");
    return require(moduleName)
}

let contacts = {};
let toContactOnAlert = [];
const setup = async() => {
    config = reloadModule("./config.json");

    contacts = {};
    await Promise.all(config.CONTACTS.map(async contact => {
        try {
            contacts[contact.nickname] = await discord.users.fetch(contact.discordId, false);
        } catch (error) {
            console.log("Error while fetching contact " + contact.nickname + ": " + error);
        }
    }));

    toContactOnAlert = config.TO_CONTACT_ON_ALERT;

    console.log("Contacts: ", contacts);
    console.log("Setup done.");

    toContactOnAlert.forEach(nickname => {
        sendMessage(nickname, "[Contactor] Setup done.");
    });
};

const OnReceiveDiscordMessage = (discordId, message) => {
    if (!ContactByDiscordId(discordId)) return;
    const user = ContactByDiscordId(discordId);
    const nickname = user.nickname;
    const perms = user.permissions;

    if(message == "ping") sendMessage(nickname, "pong");
    else if(message == "reload") if (perms >= 2) setup(); else sendMessage(nickname, "[Contactor] You don't have permission to do that.");
    else if(message == "nickname") sendMessage(nickname, nickname);
    else if(message.startsWith("restart ")) {
        if(perms < 3) return sendMessage(nickname, "[Contactor] You don't have permission to do that.");

        const command = message.replace("restart ", "");
        if(command == "contactor") {
            setTimeout(function () {
                process.on("exit", function () {
                    require("child_process").spawn(process.argv.shift(), process.argv, {
                        cwd: process.cwd(),
                        detached : true,
                        stdio: "inherit"
                    });
                });
                process.exit();
            }, 5000);
            sendMessage(nickname, "[Contactor] Restarting...");
        }
        else {
            sendMessage(nickname, "Unknown thing to restart. You might try 'help'.");
        }
    }
    else if(message.startsWith("stop ")) {
        if(perms < 3) return sendMessage(nickname, "[Contactor] You don't have permission to do that.");

        const command = message.replace("stop ", "");
        if(command == "contactor"){
            sendMessage(nickname, "[Contactor] Stopping...");
            setTimeout(function () {
                process.exit();
            }, 3000);
        }
        else {
            sendMessage(nickname, "Unknown thing to stop. You might try 'help'.");
        }
    }
    else if(message == "list contacts") if (perms >= 2) sendMessage(nickname, "[Contactor] Contacts: " + Object.keys(contacts).join(", ")); else sendMessage(nickname, "[Contactor] You don't have permission to do that.");
    else if(message == "list alerteds") if (perms >= 2) sendMessage(nickname, "[Contactor] Alerts: " + toContactOnAlert.join(", ")); else sendMessage(nickname, "[Contactor] You don't have permission to do that.");
    else if(message == "help") sendMessage(nickname, "Available commands (permissions needed or empty if none): ping, reload (2), nickname, restart contactor (2), stop contactor (2), list contacts|alerteds (2), help");
    else sendMessage(nickname, "Unknown command. You might try 'help'.");

    console.log(nickname, message);
};

const ContactByDiscordId = (discordId) => {
    return config.CONTACTS.find(x => x.discordId == discordId);
};

const sendMessage = (nickname, message) => {
    console.log("Sending message to " + nickname + ": " + message);
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